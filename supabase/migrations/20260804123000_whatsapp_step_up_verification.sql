-- WhatsApp possession verification for destructive actions and reviews.
--
-- The public site remains account-free. Only the application service may write
-- verification actions or publish reviews; public clients retain read-only RPCs.

CREATE TABLE public.community_verification_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT NOT NULL CHECK (action_type IN ('provider_delete', 'provider_review')),
  requester_whatsapp TEXT NOT NULL CHECK (requester_whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  client_secret_hash TEXT NOT NULL UNIQUE CHECK (client_secret_hash ~ '^[0-9a-f]{64}$'),
  request_ip_hash TEXT CHECK (request_ip_hash IS NULL OR request_ip_hash ~ '^[0-9a-f]{64}$'),
  twilio_verification_sid TEXT CHECK (
    twilio_verification_sid IS NULL OR twilio_verification_sid ~ '^VE[0-9a-fA-F]{32}$'
  ),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'verified', 'completed', 'failed', 'expired')),
  check_attempts SMALLINT NOT NULL DEFAULT 0 CHECK (check_attempts BETWEEN 0 AND 10),
  result_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '10 minutes'),
  verified_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  CHECK (expires_at > created_at),
  CHECK (verified_at IS NULL OR verified_at >= created_at),
  CHECK (consumed_at IS NULL OR verified_at IS NOT NULL)
);

CREATE INDEX community_verification_actions_phone_created_idx
  ON public.community_verification_actions (requester_whatsapp, created_at DESC);
CREATE INDEX community_verification_actions_ip_created_idx
  ON public.community_verification_actions (request_ip_hash, created_at DESC)
  WHERE request_ip_hash IS NOT NULL;
CREATE INDEX community_verification_actions_expiry_idx
  ON public.community_verification_actions (expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE public.community_verification_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.community_verification_actions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.community_verification_actions TO service_role;

ALTER TABLE public.provider_deletion_events
  ADD COLUMN verification_action_id UUID REFERENCES public.community_verification_actions(id) ON DELETE RESTRICT,
  ADD COLUMN verification_method TEXT NOT NULL DEFAULT 'legacy_community_code'
    CHECK (verification_method IN ('legacy_community_code', 'whatsapp_otp')),
  ADD COLUMN verified_at TIMESTAMPTZ,
  ADD COLUMN twilio_verification_sid TEXT CHECK (
    twilio_verification_sid IS NULL OR twilio_verification_sid ~ '^VE[0-9a-fA-F]{32}$'
  );

CREATE UNIQUE INDEX provider_deletion_events_verification_action_uidx
  ON public.provider_deletion_events (verification_action_id)
  WHERE verification_action_id IS NOT NULL;

ALTER TABLE public.provider_reviews
  ADD COLUMN verification_action_id UUID REFERENCES public.community_verification_actions(id) ON DELETE RESTRICT,
  ADD COLUMN verification_method TEXT NOT NULL DEFAULT 'legacy_unverified'
    CHECK (verification_method IN ('legacy_unverified', 'whatsapp_otp', 'whatsapp_inbound')),
  ADD COLUMN verified_at TIMESTAMPTZ,
  ADD COLUMN twilio_verification_sid TEXT;

-- Canonical E.164-like storage is necessary for reliable uniqueness. Existing
-- rows were already required to contain the country code; add the leading plus
-- where the earlier validator allowed it to be omitted.
UPDATE public.provider_reviews
SET reviewer_whatsapp = '+' || reviewer_whatsapp
WHERE reviewer_whatsapp ~ '^[1-9][0-9]{7,14}$';

-- Preserve the newest active review if historical data contains more than one
-- review for the same provider/number. Older reviews remain privately retained.
WITH ranked_reviews AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY contact_id, reviewer_whatsapp
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS position
  FROM public.provider_reviews
  WHERE is_deleted = FALSE
)
UPDATE public.provider_reviews AS reviews
SET
  is_deleted = TRUE,
  deleted_at = COALESCE(reviews.deleted_at, now())
FROM ranked_reviews
WHERE reviews.id = ranked_reviews.id
  AND ranked_reviews.position > 1;

CREATE UNIQUE INDEX provider_reviews_one_active_per_whatsapp_uidx
  ON public.provider_reviews (contact_id, reviewer_whatsapp)
  WHERE is_deleted = FALSE;

CREATE UNIQUE INDEX provider_reviews_verification_action_uidx
  ON public.provider_reviews (verification_action_id)
  WHERE verification_action_id IS NOT NULL;

-- The old function was callable by anonymous clients. Recreate it as an
-- internal service function and make repeat submissions update the one active
-- review for that provider/number instead of creating rating spam.
DROP FUNCTION IF EXISTS public.submit_provider_review(UUID, SMALLINT, TEXT, TEXT[], TEXT, TEXT);

CREATE FUNCTION public.submit_provider_review(
  p_contact_id UUID,
  p_rating SMALLINT,
  p_reviewer_whatsapp TEXT,
  p_image_paths TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_comment TEXT DEFAULT NULL,
  p_reviewer_name TEXT DEFAULT NULL,
  p_verification_method TEXT DEFAULT 'whatsapp_inbound',
  p_verification_action_id UUID DEFAULT NULL,
  p_twilio_verification_sid TEXT DEFAULT NULL
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
SET search_path = pg_catalog, public, storage
AS $$
DECLARE
  v_comment TEXT;
  v_reviewer_name TEXT;
  v_reviewer_whatsapp TEXT;
  v_image_paths TEXT[] := COALESCE(p_image_paths, ARRAY[]::TEXT[]);
  v_review public.provider_reviews%ROWTYPE;
  v_storage_path TEXT;
BEGIN
  IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Rating must be a whole number between 1 and 5' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.contacts AS contacts
    WHERE contacts.id = p_contact_id AND contacts.is_deleted = FALSE
  ) THEN
    RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
  END IF;

  IF cardinality(v_image_paths) > 4 THEN
    RAISE EXCEPTION 'A review can include at most 4 images' USING ERRCODE = '22023';
  END IF;
  IF cardinality(v_image_paths) <> cardinality(ARRAY(SELECT DISTINCT unnest(v_image_paths))) THEN
    RAISE EXCEPTION 'Review image paths must be unique' USING ERRCODE = '22023';
  END IF;

  FOREACH v_storage_path IN ARRAY v_image_paths LOOP
    IF v_storage_path !~ ('^' || p_contact_id::TEXT || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$') THEN
      RAISE EXCEPTION 'Invalid review image path' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM unnest(v_image_paths) AS paths(storage_path)
    WHERE NOT EXISTS (
      SELECT 1 FROM storage.objects AS objects
      WHERE objects.bucket_id = 'review-images' AND objects.name = paths.storage_path
    )
  ) THEN
    RAISE EXCEPTION 'One or more review images were not uploaded' USING ERRCODE = '22023';
  END IF;

  v_comment := NULLIF(btrim(regexp_replace(COALESCE(p_comment, ''), E'\r\n?', E'\n', 'g')), '');
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
  ELSIF v_reviewer_whatsapp ~ '^[1-9][0-9]{7,14}$' THEN
    v_reviewer_whatsapp := '+' || v_reviewer_whatsapp;
  END IF;

  IF v_comment IS NOT NULL AND char_length(v_comment) > 1000 THEN
    RAISE EXCEPTION 'Comment must be 1000 characters or fewer' USING ERRCODE = '22023';
  END IF;
  IF v_reviewer_name IS NOT NULL AND char_length(v_reviewer_name) > 80 THEN
    RAISE EXCEPTION 'Reviewer name must be 80 characters or fewer' USING ERRCODE = '22023';
  END IF;
  IF v_reviewer_whatsapp !~ '^\+[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'Enter a valid WhatsApp number including country code' USING ERRCODE = '22023';
  END IF;
  IF p_verification_method NOT IN ('whatsapp_otp', 'whatsapp_inbound') THEN
    RAISE EXCEPTION 'A verified WhatsApp method is required' USING ERRCODE = '22023';
  END IF;

  SELECT reviews.* INTO v_review
  FROM public.provider_reviews AS reviews
  WHERE reviews.contact_id = p_contact_id
    AND reviews.reviewer_whatsapp = v_reviewer_whatsapp
    AND reviews.is_deleted = FALSE
  FOR UPDATE;

  IF FOUND THEN
    DELETE FROM public.provider_review_images AS images WHERE images.review_id = v_review.id;
    UPDATE public.provider_reviews AS reviews
    SET
      rating = p_rating,
      comment = v_comment,
      reviewer_name = v_reviewer_name,
      verification_method = p_verification_method,
      verification_action_id = COALESCE(p_verification_action_id, reviews.verification_action_id),
      verified_at = now(),
      twilio_verification_sid = p_twilio_verification_sid,
      updated_at = now()
    WHERE reviews.id = v_review.id
    RETURNING reviews.* INTO v_review;
  ELSE
    INSERT INTO public.provider_reviews AS reviews (
      contact_id,
      rating,
      comment,
      reviewer_name,
      reviewer_whatsapp,
      verification_method,
      verification_action_id,
      verified_at,
      twilio_verification_sid
    ) VALUES (
      p_contact_id,
      p_rating,
      v_comment,
      v_reviewer_name,
      v_reviewer_whatsapp,
      p_verification_method,
      p_verification_action_id,
      now(),
      p_twilio_verification_sid
    )
    RETURNING reviews.* INTO v_review;
  END IF;

  INSERT INTO public.provider_review_images (review_id, storage_path, position)
  SELECT v_review.id, paths.storage_path, (paths.ordinality - 1)::SMALLINT
  FROM unnest(v_image_paths) WITH ORDINALITY AS paths(storage_path, ordinality);

  RETURN QUERY SELECT
    v_review.id,
    v_review.contact_id,
    v_review.rating,
    v_review.comment,
    v_review.reviewer_name,
    v_review.created_at,
    v_image_paths;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_provider_review(
  UUID, SMALLINT, TEXT, TEXT[], TEXT, TEXT, TEXT, UUID, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_provider_review(
  UUID, SMALLINT, TEXT, TEXT[], TEXT, TEXT, TEXT, UUID, TEXT
) TO service_role;

CREATE FUNCTION public.complete_verified_provider_deletion(
  p_action_id UUID,
  p_undo_token_hash TEXT
)
RETURNS TABLE (event_id UUID, undo_expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_action public.community_verification_actions%ROWTYPE;
  v_event_id UUID;
  v_undo_expires_at TIMESTAMPTZ;
BEGIN
  SELECT actions.* INTO v_action
  FROM public.community_verification_actions AS actions
  WHERE actions.id = p_action_id
  FOR UPDATE;

  IF NOT FOUND OR v_action.action_type <> 'provider_delete'
    OR v_action.status <> 'verified' OR v_action.consumed_at IS NOT NULL
    OR v_action.expires_at <= now() THEN
    RAISE EXCEPTION 'Verified deletion action is unavailable' USING ERRCODE = '22023';
  END IF;

  SELECT result.event_id, result.undo_expires_at
  INTO v_event_id, v_undo_expires_at
  FROM public.perform_provider_soft_delete(
    (v_action.payload->>'providerId')::UUID,
    v_action.payload->>'providerNameConfirmation',
    v_action.payload->>'reason',
    v_action.requester_whatsapp,
    p_undo_token_hash
  ) AS result;

  UPDATE public.provider_deletion_events AS events
  SET
    verification_action_id = v_action.id,
    verification_method = 'whatsapp_otp',
    verified_at = v_action.verified_at,
    twilio_verification_sid = v_action.twilio_verification_sid
  WHERE events.id = v_event_id;

  UPDATE public.community_verification_actions
  SET status = 'completed', consumed_at = now(), result_id = v_event_id
  WHERE id = v_action.id;

  RETURN QUERY SELECT v_event_id, v_undo_expires_at;
END;
$$;

CREATE FUNCTION public.complete_verified_provider_review(
  p_action_id UUID,
  p_image_paths TEXT[] DEFAULT ARRAY[]::TEXT[]
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
  v_action public.community_verification_actions%ROWTYPE;
  v_result RECORD;
  v_expected_images INTEGER;
BEGIN
  SELECT actions.* INTO v_action
  FROM public.community_verification_actions AS actions
  WHERE actions.id = p_action_id
  FOR UPDATE;

  IF NOT FOUND OR v_action.action_type <> 'provider_review'
    OR v_action.status <> 'verified' OR v_action.consumed_at IS NOT NULL
    OR v_action.expires_at <= now() THEN
    RAISE EXCEPTION 'Verified review action is unavailable' USING ERRCODE = '22023';
  END IF;

  v_expected_images := COALESCE((v_action.payload->>'imageCount')::INTEGER, 0);
  IF cardinality(COALESCE(p_image_paths, ARRAY[]::TEXT[])) <> v_expected_images THEN
    RAISE EXCEPTION 'Review image count does not match the verified action' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_result
  FROM public.submit_provider_review(
    (v_action.payload->>'providerId')::UUID,
    (v_action.payload->>'rating')::SMALLINT,
    v_action.requester_whatsapp,
    COALESCE(p_image_paths, ARRAY[]::TEXT[]),
    v_action.payload->>'comment',
    v_action.payload->>'reviewerName',
    'whatsapp_otp',
    v_action.id,
    v_action.twilio_verification_sid
  );

  UPDATE public.community_verification_actions
  SET status = 'completed', consumed_at = now(), result_id = v_result.id
  WHERE community_verification_actions.id = v_action.id;

  RETURN QUERY SELECT
    v_result.id,
    v_result.contact_id,
    v_result.rating,
    v_result.comment,
    v_result.reviewer_name,
    v_result.created_at,
    v_result.image_paths;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_verified_provider_deletion(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_verified_provider_review(UUID, TEXT[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_verified_provider_deletion(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_verified_provider_review(UUID, TEXT[]) TO service_role;

COMMENT ON TABLE public.community_verification_actions IS
  'Private, short-lived actions bound to a Twilio WhatsApp possession verification.';
COMMENT ON INDEX public.provider_reviews_one_active_per_whatsapp_uidx IS
  'One active review per provider per canonical verified WhatsApp number.';
