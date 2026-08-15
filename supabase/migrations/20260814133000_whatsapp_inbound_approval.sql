-- Record user-initiated Machu approvals distinctly from legacy outbound OTPs.

ALTER TABLE public.community_verification_actions
  ADD COLUMN verification_method TEXT NOT NULL DEFAULT 'whatsapp_otp';

ALTER TABLE public.community_verification_actions
  ADD CONSTRAINT community_verification_actions_verification_method_check
  CHECK (verification_method IN ('whatsapp_otp', 'whatsapp_inbound'));

ALTER TABLE public.provider_deletion_events
  DROP CONSTRAINT IF EXISTS provider_deletion_events_verification_method_check;

ALTER TABLE public.provider_deletion_events
  ADD CONSTRAINT provider_deletion_events_verification_method_check
  CHECK (verification_method IN ('legacy_community_code', 'whatsapp_otp', 'whatsapp_inbound'));

CREATE OR REPLACE FUNCTION public.complete_verified_provider_deletion(
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
    verification_method = v_action.verification_method,
    verified_at = v_action.verified_at,
    twilio_verification_sid = v_action.twilio_verification_sid
  WHERE events.id = v_event_id;

  UPDATE public.community_verification_actions
  SET status = 'completed', consumed_at = now(), result_id = v_event_id
  WHERE id = v_action.id;

  RETURN QUERY SELECT v_event_id, v_undo_expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_verified_provider_review(
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
    v_action.verification_method,
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

COMMENT ON COLUMN public.community_verification_actions.verification_method IS
  'Possession proof used for this action; new browser actions use a signed inbound Machu message.';
