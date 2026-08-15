-- Remember a WhatsApp-verified browser for 30 days while preserving a private,
-- immutable actor trail for every community mutation.

CREATE TABLE public.community_verified_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  verified_whatsapp TEXT NOT NULL CHECK (verified_whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  source_action_id UUID NOT NULL
    REFERENCES public.community_verification_actions(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CHECK (expires_at > created_at),
  CHECK (last_used_at >= created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX community_verified_sessions_phone_created_idx
  ON public.community_verified_sessions (verified_whatsapp, created_at DESC);
CREATE INDEX community_verified_sessions_expiry_idx
  ON public.community_verified_sessions (expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE public.community_verified_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.community_verified_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.community_verified_sessions TO service_role;

ALTER TABLE public.community_verification_actions
  ADD COLUMN trusted_session_id UUID
    REFERENCES public.community_verified_sessions(id) ON DELETE RESTRICT;

ALTER TABLE public.community_verification_actions
  DROP CONSTRAINT IF EXISTS community_verification_actions_verification_method_check;
ALTER TABLE public.community_verification_actions
  ADD CONSTRAINT community_verification_actions_verification_method_check
  CHECK (verification_method IN ('whatsapp_otp', 'whatsapp_inbound', 'trusted_session'));

ALTER TABLE public.provider_deletion_events
  DROP CONSTRAINT IF EXISTS provider_deletion_events_verification_method_check;
ALTER TABLE public.provider_deletion_events
  ADD CONSTRAINT provider_deletion_events_verification_method_check
  CHECK (verification_method IN (
    'legacy_community_code',
    'whatsapp_otp',
    'whatsapp_inbound',
    'trusted_session'
  ));

ALTER TABLE public.provider_reviews
  DROP CONSTRAINT IF EXISTS provider_reviews_verification_method_check;
ALTER TABLE public.provider_reviews
  ADD CONSTRAINT provider_reviews_verification_method_check
  CHECK (verification_method IN (
    'legacy_unverified',
    'whatsapp_otp',
    'whatsapp_inbound',
    'trusted_session'
  ));

CREATE TABLE public.provider_change_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE RESTRICT,
  action_type TEXT NOT NULL CHECK (action_type IN ('provider_create', 'provider_update')),
  requester_whatsapp TEXT NOT NULL CHECK (requester_whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  verification_method TEXT NOT NULL CHECK (verification_method IN (
    'whatsapp_otp',
    'whatsapp_inbound',
    'trusted_session'
  )),
  verification_action_id UUID NOT NULL UNIQUE
    REFERENCES public.community_verification_actions(id) ON DELETE RESTRICT,
  before_snapshot JSONB CHECK (
    before_snapshot IS NULL OR jsonb_typeof(before_snapshot) = 'object'
  ),
  after_snapshot JSONB NOT NULL CHECK (jsonb_typeof(after_snapshot) = 'object'),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (action_type = 'provider_create' AND before_snapshot IS NULL)
    OR (action_type = 'provider_update' AND before_snapshot IS NOT NULL)
  )
);

CREATE INDEX provider_change_events_contact_changed_idx
  ON public.provider_change_events (contact_id, changed_at DESC);
CREATE INDEX provider_change_events_actor_changed_idx
  ON public.provider_change_events (requester_whatsapp, changed_at DESC);

ALTER TABLE public.provider_change_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.provider_change_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.provider_change_events TO service_role;

CREATE OR REPLACE FUNCTION public.submit_provider_review(
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
  IF p_verification_method NOT IN ('whatsapp_otp', 'whatsapp_inbound', 'trusted_session') THEN
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

CREATE OR REPLACE FUNCTION public.complete_verified_provider_write(
  p_action_id UUID,
  p_image_path TEXT DEFAULT NULL,
  p_image_url TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  subtitle TEXT,
  category TEXT,
  phone_number TEXT,
  website_url TEXT,
  map_url TEXT,
  image_url TEXT,
  previous_image_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, storage
AS $$
DECLARE
  v_action public.community_verification_actions%ROWTYPE;
  v_contact public.contacts%ROWTYPE;
  v_previous_image_url TEXT;
  v_image_change TEXT;
  v_next_image_url TEXT;
  v_before_snapshot JSONB;
  v_after_snapshot JSONB;
BEGIN
  SELECT actions.* INTO v_action
  FROM public.community_verification_actions AS actions
  WHERE actions.id = p_action_id
  FOR UPDATE;

  IF NOT FOUND OR v_action.action_type NOT IN ('provider_create', 'provider_update')
    OR v_action.status <> 'verified' OR v_action.consumed_at IS NOT NULL
    OR v_action.expires_at <= now() THEN
    RAISE EXCEPTION 'Verified provider action is unavailable' USING ERRCODE = '22023';
  END IF;

  v_image_change := v_action.payload->>'imageChange';
  IF v_image_change = 'replace' THEN
    IF p_image_path IS NULL
      OR p_image_path !~ (
        '^' || v_action.id::TEXT
        || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
        || '\.(jpg|jpeg|png|webp)$'
      )
      OR p_image_url IS NULL
      OR p_image_url !~ (
        '^https?://[^[:space:]]+/storage/v1/object/public/contact-images/'
        || replace(replace(p_image_path, '.', '\.'), '/', '\/')
        || '$'
      ) THEN
      RAISE EXCEPTION 'A verified provider logo is required' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM storage.objects AS objects
      WHERE objects.bucket_id = 'contact-images' AND objects.name = p_image_path
    ) THEN
      RAISE EXCEPTION 'The verified provider logo was not uploaded' USING ERRCODE = '22023';
    END IF;
    v_next_image_url := p_image_url;
  ELSIF p_image_path IS NOT NULL OR p_image_url IS NOT NULL THEN
    RAISE EXCEPTION 'This provider action does not allow a new logo' USING ERRCODE = '22023';
  END IF;

  IF v_action.action_type = 'provider_create' THEN
    IF v_image_change IS NULL OR v_image_change NOT IN ('none', 'replace') THEN
      RAISE EXCEPTION 'Invalid provider image action' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.contacts AS contacts (
      title,
      category,
      subtitle,
      phone_number,
      website_url,
      map_url,
      image_url,
      is_deleted
    ) VALUES (
      v_action.payload->>'name',
      v_action.payload->>'category',
      v_action.payload->>'description',
      v_action.payload->>'providerPhone',
      NULLIF(v_action.payload->>'website', ''),
      NULLIF(v_action.payload->>'mapUrl', ''),
      v_next_image_url,
      FALSE
    )
    RETURNING contacts.* INTO v_contact;
  ELSE
    IF v_image_change IS NULL OR v_image_change NOT IN ('keep', 'remove', 'replace') THEN
      RAISE EXCEPTION 'Invalid provider image action' USING ERRCODE = '22023';
    END IF;

    SELECT contacts.* INTO v_contact
    FROM public.contacts AS contacts
    WHERE contacts.id = (v_action.payload->>'providerId')::UUID
      AND contacts.is_deleted = FALSE
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
    END IF;

    v_before_snapshot := jsonb_build_object(
      'name', v_contact.title,
      'category', v_contact.category,
      'description', v_contact.subtitle,
      'phone', v_contact.phone_number,
      'website', v_contact.website_url,
      'mapUrl', v_contact.map_url,
      'imageUrl', v_contact.image_url
    );
    v_previous_image_url := v_contact.image_url;
    IF v_image_change = 'keep' THEN
      v_next_image_url := v_contact.image_url;
    ELSIF v_image_change = 'remove' THEN
      v_next_image_url := NULL;
    END IF;

    UPDATE public.contacts AS contacts
    SET
      title = v_action.payload->>'name',
      category = v_action.payload->>'category',
      subtitle = v_action.payload->>'description',
      phone_number = v_action.payload->>'providerPhone',
      website_url = NULLIF(v_action.payload->>'website', ''),
      map_url = NULLIF(v_action.payload->>'mapUrl', ''),
      image_url = v_next_image_url
    WHERE contacts.id = v_contact.id
    RETURNING contacts.* INTO v_contact;
  END IF;

  v_after_snapshot := jsonb_build_object(
    'name', v_contact.title,
    'category', v_contact.category,
    'description', v_contact.subtitle,
    'phone', v_contact.phone_number,
    'website', v_contact.website_url,
    'mapUrl', v_contact.map_url,
    'imageUrl', v_contact.image_url
  );

  INSERT INTO public.provider_change_events (
    contact_id,
    action_type,
    requester_whatsapp,
    verification_method,
    verification_action_id,
    before_snapshot,
    after_snapshot
  ) VALUES (
    v_contact.id,
    v_action.action_type,
    v_action.requester_whatsapp,
    v_action.verification_method,
    v_action.id,
    v_before_snapshot,
    v_after_snapshot
  );

  UPDATE public.community_verification_actions AS actions
  SET status = 'completed', consumed_at = now(), result_id = v_contact.id
  WHERE actions.id = v_action.id;

  RETURN QUERY SELECT
    v_contact.id,
    v_contact.title,
    v_contact.subtitle,
    v_contact.category,
    v_contact.phone_number,
    v_contact.website_url,
    v_contact.map_url,
    v_contact.image_url,
    v_previous_image_url;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_provider_review(
  UUID, SMALLINT, TEXT, TEXT[], TEXT, TEXT, TEXT, UUID, TEXT
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_verified_provider_write(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_provider_review(
  UUID, SMALLINT, TEXT, TEXT[], TEXT, TEXT, TEXT, UUID, TEXT
) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_verified_provider_write(UUID, TEXT, TEXT)
  TO service_role;

COMMENT ON TABLE public.community_verified_sessions IS
  'Private 30-day browser sessions mapped to a WhatsApp number proven through Machu.';
COMMENT ON COLUMN public.community_verified_sessions.token_hash IS
  'SHA-256 of the opaque HttpOnly browser credential; the raw credential is never stored.';
COMMENT ON TABLE public.provider_change_events IS
  'Private immutable administrator audit trail for provider additions and edits.';
