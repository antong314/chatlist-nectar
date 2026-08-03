-- Optional public images for account-free provider reviews.
--
-- Blobs live in the public `review-images` Storage bucket. This table stores
-- only ordered object paths; reviewer WhatsApp remains private in
-- `provider_reviews` and is never returned by the public RPCs.

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'review-images',
  'review-images',
  TRUE,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::TEXT[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public can upload review images" ON storage.objects;

CREATE POLICY "Public can upload review images"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'review-images'
  AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
);

CREATE TABLE public.provider_review_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES public.provider_reviews(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL UNIQUE CHECK (
    storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
  ),
  position SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (review_id, position)
);

CREATE INDEX provider_review_images_review_position_idx
  ON public.provider_review_images (review_id, position);

ALTER TABLE public.provider_review_images ENABLE ROW LEVEL SECURITY;

-- Public clients use SECURITY DEFINER RPCs. No direct metadata-table policy is
-- intentional, so future columns cannot accidentally become public.
REVOKE ALL ON TABLE public.provider_review_images FROM PUBLIC, anon, authenticated;

-- Remove the five-argument version before creating the image-aware function.
-- Leaving both signatures would make PostgREST RPC resolution ambiguous.
DROP FUNCTION IF EXISTS public.submit_provider_review(UUID, SMALLINT, TEXT, TEXT, TEXT);

CREATE FUNCTION public.submit_provider_review(
  p_contact_id UUID,
  p_rating SMALLINT,
  p_reviewer_whatsapp TEXT,
  p_image_paths TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_comment TEXT DEFAULT NULL,
  p_reviewer_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  contact_id UUID,
  rating SMALLINT,
  comment TEXT,
  reviewer_name TEXT,
  created_at TIMESTAMPTZ,
  image_paths TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_comment TEXT;
  v_reviewer_name TEXT;
  v_reviewer_whatsapp TEXT;
  v_image_paths TEXT[] := COALESCE(p_image_paths, ARRAY[]::TEXT[]);
  v_review public.provider_reviews%ROWTYPE;
BEGIN
  IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Rating must be a whole number between 1 and 5'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.contacts AS contacts
    WHERE contacts.id = p_contact_id
      AND COALESCE(contacts.is_deleted, FALSE) = FALSE
  ) THEN
    RAISE EXCEPTION 'Provider not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF cardinality(v_image_paths) > 4 THEN
    RAISE EXCEPTION 'A review can include at most 4 images'
      USING ERRCODE = '22023';
  END IF;

  IF cardinality(v_image_paths) <> (
    SELECT count(DISTINCT paths.storage_path)
    FROM unnest(v_image_paths) AS paths(storage_path)
  ) THEN
    RAISE EXCEPTION 'Review image paths must be unique'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_image_paths) AS paths(storage_path)
    WHERE paths.storage_path IS NULL
      OR paths.storage_path !~ (
        '^' || p_contact_id::TEXT ||
        '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
      )
  ) THEN
    RAISE EXCEPTION 'Review images must use the provider/image path format and an allowed extension'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_image_paths) AS paths(storage_path)
    WHERE NOT EXISTS (
      SELECT 1
      FROM storage.objects AS objects
      WHERE objects.bucket_id = 'review-images'
        AND objects.name = paths.storage_path
    )
  ) THEN
    RAISE EXCEPTION 'One or more review images were not uploaded'
      USING ERRCODE = '22023';
  END IF;

  v_comment := NULLIF(
    btrim(regexp_replace(COALESCE(p_comment, ''), E'\r\n?', E'\n', 'g')),
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
  RETURNING reviews.* INTO v_review;

  INSERT INTO public.provider_review_images (review_id, storage_path, position)
  SELECT
    v_review.id,
    paths.storage_path,
    (paths.ordinality - 1)::SMALLINT
  FROM unnest(v_image_paths) WITH ORDINALITY AS paths(storage_path, ordinality);

  RETURN QUERY
  SELECT
    v_review.id,
    v_review.contact_id,
    v_review.rating,
    v_review.comment,
    v_review.reviewer_name,
    v_review.created_at,
    v_image_paths;
END;
$$;

-- The return shape changed, so PostgreSQL requires a drop/recreate rather than
-- CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public.get_provider_reviews(UUID, INTEGER, INTEGER);

CREATE FUNCTION public.get_provider_reviews(
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
  created_at TIMESTAMPTZ,
  image_paths TEXT[]
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
    reviews.created_at,
    COALESCE(images.image_paths, ARRAY[]::TEXT[]) AS image_paths
  FROM public.provider_reviews AS reviews
  LEFT JOIN LATERAL (
    SELECT array_agg(review_images.storage_path ORDER BY review_images.position) AS image_paths
    FROM public.provider_review_images AS review_images
    WHERE review_images.review_id = reviews.id
  ) AS images ON TRUE
  WHERE reviews.contact_id = p_contact_id
    AND reviews.is_deleted = FALSE
  ORDER BY reviews.created_at DESC, reviews.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.submit_provider_review(UUID, SMALLINT, TEXT, TEXT[], TEXT, TEXT)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_provider_reviews(UUID, INTEGER, INTEGER)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.submit_provider_review(UUID, SMALLINT, TEXT, TEXT[], TEXT, TEXT)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_provider_reviews(UUID, INTEGER, INTEGER)
  TO anon, authenticated;

COMMENT ON TABLE public.provider_review_images IS
  'Private relational metadata for ordered public review-image objects; read through review RPCs only.';
COMMENT ON FUNCTION public.submit_provider_review(UUID, SMALLINT, TEXT, TEXT[], TEXT, TEXT) IS
  'Creates an immediately public review and ordered image metadata without returning reviewer WhatsApp.';
COMMENT ON FUNCTION public.get_provider_reviews(UUID, INTEGER, INTEGER) IS
  'Returns public review fields and ordered image paths; never returns reviewer WhatsApp.';
