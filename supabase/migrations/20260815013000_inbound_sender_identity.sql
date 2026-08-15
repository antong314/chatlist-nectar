-- Let Machu's signed inbound webhook supply the authoritative actor number.
-- Pending inbound actions have no phone until the first valid sender atomically
-- claims them; every verified or completed action must still have an actor.

ALTER TABLE public.community_verification_actions
  ALTER COLUMN requester_whatsapp DROP NOT NULL;

ALTER TABLE public.community_verification_actions
  ADD CONSTRAINT community_verification_actions_verified_actor_check
  CHECK (
    requester_whatsapp IS NOT NULL
    OR (
      verification_method = 'whatsapp_inbound'
      AND status IN ('pending', 'sent', 'failed', 'expired')
    )
  );

COMMENT ON COLUMN public.community_verification_actions.requester_whatsapp IS
  'Private verified actor. For inbound flows this is populated atomically from the Twilio-signed WhatsApp sender; pending actions are unclaimed.';
