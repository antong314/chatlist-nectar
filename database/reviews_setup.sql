-- Account-free provider reviews for San Mateo Love.
--
-- Run this script in the Supabase SQL editor after the `contacts` table exists.
-- Public clients never receive `reviewer_whatsapp`: they can only use the RPCs
-- explicitly granted at the end of this file.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.provider_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT CHECK (comment IS NULL OR char_length(comment) <= 1000),
  reviewer_name TEXT CHECK (reviewer_name IS NULL OR char_length(reviewer_name) <= 80),
  reviewer_whatsapp TEXT NOT NULL CHECK (
    char_length(reviewer_whatsapp) BETWEEN 8 AND 16
    AND reviewer_whatsapp ~ '^\+?[0-9]{8,15}$'
  ),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (is_deleted = FALSE AND deleted_at IS NULL)
    OR (is_deleted = TRUE AND deleted_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS provider_reviews_public_contact_created_idx
  ON public.provider_reviews (contact_id, created_at DESC)
  WHERE is_deleted = FALSE;

CREATE OR REPLACE FUNCTION public.set_provider_review_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_provider_review_updated_at
  ON public.provider_reviews;

CREATE TRIGGER set_provider_review_updated_at
BEFORE UPDATE ON public.provider_reviews
FOR EACH ROW
EXECUTE FUNCTION public.set_provider_review_updated_at();

ALTER TABLE public.provider_reviews ENABLE ROW LEVEL SECURITY;

-- There are intentionally no direct table policies. Even a public SELECT would
-- make it too easy to accidentally expose reviewer_whatsapp in future clients.
REVOKE ALL ON TABLE public.provider_reviews FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_provider_review_updated_at() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_provider_review(
  p_contact_id UUID,
  p_rating SMALLINT,
  p_reviewer_whatsapp TEXT,
  p_comment TEXT DEFAULT NULL,
  p_reviewer_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  contact_id UUID,
  rating SMALLINT,
  comment TEXT,
  reviewer_name TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_comment TEXT;
  v_reviewer_name TEXT;
  v_reviewer_whatsapp TEXT;
BEGIN
  IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Rating must be a whole number between 1 and 5'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.contacts AS c
    WHERE c.id = p_contact_id
      AND COALESCE(c.is_deleted, FALSE) = FALSE
  ) THEN
    RAISE EXCEPTION 'Provider not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- Preserve intentional paragraph breaks while normalizing platform-specific
  -- line endings and trimming surrounding whitespace.
  v_comment := NULLIF(
    btrim(regexp_replace(COALESCE(p_comment, ''), E'\\r\\n?', E'\\n', 'g')),
    ''
  );
  v_reviewer_name := NULLIF(
    btrim(regexp_replace(COALESCE(p_reviewer_name, ''), '[[:space:]]+', ' ', 'g')),
    ''
  );
  v_reviewer_whatsapp := regexp_replace(
    btrim(COALESCE(p_reviewer_whatsapp, '')),
    '[[:space:]().-]+',
    '',
    'g'
  );

  IF left(v_reviewer_whatsapp, 2) = '00' THEN
    v_reviewer_whatsapp := '+' || substring(v_reviewer_whatsapp FROM 3);
  END IF;

  IF v_comment IS NOT NULL AND char_length(v_comment) > 1000 THEN
    RAISE EXCEPTION 'Comment must be 1000 characters or fewer'
      USING ERRCODE = '22023';
  END IF;

  IF v_reviewer_name IS NOT NULL AND char_length(v_reviewer_name) > 80 THEN
    RAISE EXCEPTION 'Reviewer name must be 80 characters or fewer'
      USING ERRCODE = '22023';
  END IF;

  IF v_reviewer_whatsapp !~ '^\+?[0-9]{8,15}$' THEN
    RAISE EXCEPTION 'Enter a valid WhatsApp number with 8 to 15 digits'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  INSERT INTO public.provider_reviews AS reviews (
    contact_id,
    rating,
    comment,
    reviewer_name,
    reviewer_whatsapp
  )
  VALUES (
    p_contact_id,
    p_rating,
    v_comment,
    v_reviewer_name,
    v_reviewer_whatsapp
  )
  RETURNING
    reviews.id,
    reviews.contact_id,
    reviews.rating,
    reviews.comment,
    reviews.reviewer_name,
    reviews.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_provider_reviews(
  p_contact_id UUID,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  contact_id UUID,
  rating SMALLINT,
  comment TEXT,
  reviewer_name TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    reviews.id,
    reviews.contact_id,
    reviews.rating,
    reviews.comment,
    reviews.reviewer_name,
    reviews.created_at
  FROM public.provider_reviews AS reviews
  WHERE reviews.contact_id = p_contact_id
    AND reviews.is_deleted = FALSE
  ORDER BY reviews.created_at DESC, reviews.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.get_provider_review_summaries(
  p_contact_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  contact_id UUID,
  average_rating NUMERIC(3, 2),
  review_count BIGINT,
  rating_counts JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    contacts.id AS contact_id,
    COALESCE(round(avg(reviews.rating)::numeric, 2), 0.00)::numeric(3, 2) AS average_rating,
    count(reviews.id)::bigint AS review_count,
    jsonb_build_object(
      '1', count(reviews.id) FILTER (WHERE reviews.rating = 1),
      '2', count(reviews.id) FILTER (WHERE reviews.rating = 2),
      '3', count(reviews.id) FILTER (WHERE reviews.rating = 3),
      '4', count(reviews.id) FILTER (WHERE reviews.rating = 4),
      '5', count(reviews.id) FILTER (WHERE reviews.rating = 5)
    ) AS rating_counts
  FROM public.contacts AS contacts
  LEFT JOIN public.provider_reviews AS reviews
    ON reviews.contact_id = contacts.id
   AND reviews.is_deleted = FALSE
  WHERE COALESCE(contacts.is_deleted, FALSE) = FALSE
    AND (p_contact_ids IS NULL OR contacts.id = ANY(p_contact_ids))
  GROUP BY contacts.id
  ORDER BY contacts.id;
$$;

CREATE OR REPLACE FUNCTION public.get_provider_review_summary(
  p_contact_id UUID
)
RETURNS TABLE (
  contact_id UUID,
  average_rating NUMERIC(3, 2),
  review_count BIGINT,
  rating_counts JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT *
  FROM public.get_provider_review_summaries(ARRAY[p_contact_id]);
$$;

REVOKE ALL ON FUNCTION public.submit_provider_review(UUID, SMALLINT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_provider_reviews(UUID, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_provider_review_summaries(UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_provider_review_summary(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.submit_provider_review(UUID, SMALLINT, TEXT, TEXT, TEXT)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_provider_reviews(UUID, INTEGER, INTEGER)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_provider_review_summaries(UUID[])
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_provider_review_summary(UUID)
  TO anon, authenticated;

COMMENT ON TABLE public.provider_reviews IS
  'Account-free provider reviews. reviewer_whatsapp is private and must never be exposed by public RPCs.';
COMMENT ON COLUMN public.provider_reviews.reviewer_whatsapp IS
  'Private abuse/contact signal. Never include this column in a public RPC return type.';
COMMENT ON FUNCTION public.submit_provider_review(UUID, SMALLINT, TEXT, TEXT, TEXT) IS
  'Creates an immediately public review while returning only public review fields.';
COMMENT ON FUNCTION public.get_provider_reviews(UUID, INTEGER, INTEGER) IS
  'Returns public review fields for one provider; never returns reviewer_whatsapp.';
COMMENT ON FUNCTION public.get_provider_review_summaries(UUID[]) IS
  'Returns aggregate ratings for selected active providers, or all active providers when passed NULL.';

-- Post-deploy smoke test (replace <ACTIVE_CONTACT_UUID>, then run the block).
-- It exercises the anonymous role and rolls the test review back:
--
-- BEGIN;
-- SET LOCAL ROLE anon;
-- SELECT * FROM public.submit_provider_review(
--   '<ACTIVE_CONTACT_UUID>'::uuid,
--   5::smallint,
--   '+50680000000',
--   'Review system smoke test',
--   NULL
-- );
-- SELECT * FROM public.get_provider_review_summary('<ACTIVE_CONTACT_UUID>'::uuid);
-- SELECT * FROM public.get_provider_reviews('<ACTIVE_CONTACT_UUID>'::uuid, 20, 0);
-- SELECT has_table_privilege('anon', 'public.provider_reviews', 'SELECT'); -- must be false
-- ROLLBACK;
