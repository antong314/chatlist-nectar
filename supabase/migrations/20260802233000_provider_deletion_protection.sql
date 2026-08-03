-- Protect provider deletion behind a service-role Edge Function while keeping
-- the account-free directory readable and editable by the community.

UPDATE public.contacts
SET is_deleted = FALSE
WHERE is_deleted IS NULL;

ALTER TABLE public.contacts
  ALTER COLUMN is_deleted SET DEFAULT FALSE,
  ALTER COLUMN is_deleted SET NOT NULL;

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- Replace every overlapping legacy contacts policy with the explicit policy
-- set below. service_role bypasses RLS and receives an explicit table grant.
DO $$
DECLARE
  existing_policy RECORD;
BEGIN
  FOR existing_policy IN
    SELECT policies.policyname
    FROM pg_catalog.pg_policies AS policies
    WHERE policies.schemaname = 'public'
      AND policies.tablename = 'contacts'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.contacts',
      existing_policy.policyname
    );
  END LOOP;
END;
$$;

REVOKE ALL ON TABLE public.contacts FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.contacts TO anon, authenticated;
GRANT INSERT (
  title,
  category,
  subtitle,
  phone_number,
  website_url,
  image_url,
  map_url
) ON public.contacts TO anon, authenticated;
GRANT UPDATE (
  title,
  category,
  subtitle,
  phone_number,
  website_url,
  image_url,
  map_url
) ON public.contacts TO anon, authenticated;
GRANT ALL ON TABLE public.contacts TO service_role;

CREATE POLICY "Public can read active contacts"
ON public.contacts
FOR SELECT
TO anon, authenticated
USING (is_deleted = FALSE);

CREATE POLICY "Public can add active contacts"
ON public.contacts
FOR INSERT
TO anon, authenticated
WITH CHECK (is_deleted = FALSE);

CREATE POLICY "Public can edit active contacts"
ON public.contacts
FOR UPDATE
TO anon, authenticated
USING (is_deleted = FALSE)
WITH CHECK (is_deleted = FALSE);

CREATE TYPE public.provider_deletion_reason AS ENUM (
  'outdated',
  'duplicate',
  'closed',
  'incorrect',
  'other'
);

CREATE TABLE public.provider_deletion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE RESTRICT,
  provider_name_snapshot TEXT NOT NULL CHECK (char_length(provider_name_snapshot) > 0),
  reason public.provider_deletion_reason NOT NULL,
  requester_whatsapp TEXT NOT NULL CHECK (
    char_length(requester_whatsapp) BETWEEN 8 AND 16
    AND requester_whatsapp ~ '^\+?[0-9]{8,15}$'
  ),
  undo_token_hash TEXT NOT NULL UNIQUE CHECK (undo_token_hash ~ '^[0-9a-f]{64}$'),
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  undo_expires_at TIMESTAMPTZ NOT NULL,
  undone_at TIMESTAMPTZ,
  CHECK (undo_expires_at > deleted_at),
  CHECK (undone_at IS NULL OR undone_at <= undo_expires_at)
);

CREATE INDEX provider_deletion_events_contact_deleted_idx
  ON public.provider_deletion_events (contact_id, deleted_at DESC);
CREATE INDEX provider_deletion_events_pending_undo_idx
  ON public.provider_deletion_events (undo_expires_at)
  WHERE undone_at IS NULL;

ALTER TABLE public.provider_deletion_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.provider_deletion_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TYPE public.provider_deletion_reason FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.provider_deletion_events TO service_role;
GRANT USAGE ON TYPE public.provider_deletion_reason TO service_role;

CREATE FUNCTION public.perform_provider_soft_delete(
  p_contact_id UUID,
  p_provider_name_confirmation TEXT,
  p_reason TEXT,
  p_requester_whatsapp TEXT,
  p_undo_token_hash TEXT
)
RETURNS TABLE (
  event_id UUID,
  undo_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_provider_name TEXT;
  v_confirmation TEXT;
  v_reason TEXT;
  v_requester_whatsapp TEXT;
  v_undo_token_hash TEXT;
  v_event_id UUID;
  v_deleted_at TIMESTAMPTZ := now();
  v_undo_expires_at TIMESTAMPTZ := now() + INTERVAL '2 minutes';
BEGIN
  SELECT contacts.title
  INTO v_provider_name
  FROM public.contacts AS contacts
  WHERE contacts.id = p_contact_id
    AND contacts.is_deleted = FALSE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider not found or already removed'
      USING ERRCODE = 'P0002';
  END IF;

  v_confirmation := regexp_replace(
    lower(btrim(COALESCE(p_provider_name_confirmation, ''))),
    '[[:space:]]+',
    ' ',
    'g'
  );

  IF v_confirmation = '' OR v_confirmation <> regexp_replace(
    lower(btrim(COALESCE(v_provider_name, ''))),
    '[[:space:]]+',
    ' ',
    'g'
  ) THEN
    RAISE EXCEPTION 'Provider name confirmation does not match'
      USING ERRCODE = '22023';
  END IF;

  v_reason := lower(btrim(COALESCE(p_reason, '')));
  IF v_reason NOT IN ('outdated', 'duplicate', 'closed', 'incorrect', 'other') THEN
    RAISE EXCEPTION 'Select a valid deletion reason'
      USING ERRCODE = '22023';
  END IF;

  v_requester_whatsapp := regexp_replace(
    btrim(COALESCE(p_requester_whatsapp, '')),
    '[[:space:]().-]+',
    '',
    'g'
  );
  IF left(v_requester_whatsapp, 2) = '00' THEN
    v_requester_whatsapp := '+' || substring(v_requester_whatsapp FROM 3);
  END IF;
  IF v_requester_whatsapp !~ '^\+?[0-9]{8,15}$' THEN
    RAISE EXCEPTION 'Enter a valid WhatsApp number with 8 to 15 digits'
      USING ERRCODE = '22023';
  END IF;

  v_undo_token_hash := lower(btrim(COALESCE(p_undo_token_hash, '')));
  IF v_undo_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid undo token hash'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.provider_deletion_events (
    contact_id,
    provider_name_snapshot,
    reason,
    requester_whatsapp,
    undo_token_hash,
    deleted_at,
    undo_expires_at
  )
  VALUES (
    p_contact_id,
    btrim(regexp_replace(v_provider_name, '[[:space:]]+', ' ', 'g')),
    v_reason::public.provider_deletion_reason,
    v_requester_whatsapp,
    v_undo_token_hash,
    v_deleted_at,
    v_undo_expires_at
  )
  RETURNING provider_deletion_events.id INTO v_event_id;

  UPDATE public.contacts
  SET is_deleted = TRUE
  WHERE id = p_contact_id;

  RETURN QUERY SELECT v_event_id, v_undo_expires_at;
END;
$$;

CREATE FUNCTION public.undo_provider_soft_delete(
  p_event_id UUID,
  p_undo_token_hash TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.provider_deletion_events%ROWTYPE;
  v_undo_token_hash TEXT := lower(btrim(COALESCE(p_undo_token_hash, '')));
BEGIN
  SELECT events.*
  INTO v_event
  FROM public.provider_deletion_events AS events
  WHERE events.id = p_event_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_event.undone_at IS NOT NULL
    OR v_event.undo_token_hash <> v_undo_token_hash
    OR now() >= v_event.undo_expires_at
  THEN
    RAISE EXCEPTION 'Undo link is invalid or no longer available'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.contacts AS contacts
  WHERE contacts.id = v_event.contact_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider no longer exists'
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.contacts
  SET is_deleted = FALSE
  WHERE id = v_event.contact_id;

  UPDATE public.provider_deletion_events
  SET undone_at = now()
  WHERE id = v_event.id;
END;
$$;

REVOKE ALL ON FUNCTION public.perform_provider_soft_delete(UUID, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.undo_provider_soft_delete(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.perform_provider_soft_delete(UUID, TEXT, TEXT, TEXT, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.undo_provider_soft_delete(UUID, TEXT)
  TO service_role;

COMMENT ON TABLE public.provider_deletion_events IS
  'Private audit trail for service-authorized provider soft deletion and short-lived undo.';
COMMENT ON COLUMN public.provider_deletion_events.requester_whatsapp IS
  'Private normalized requester contact. Never expose through public APIs.';
COMMENT ON COLUMN public.provider_deletion_events.undo_token_hash IS
  'Unique SHA-256 hash of a single-use token returned only by the Edge Function.';
COMMENT ON FUNCTION public.perform_provider_soft_delete(UUID, TEXT, TEXT, TEXT, TEXT) IS
  'Service-role-only atomic provider soft deletion with name, reason, WhatsApp, and token-hash validation.';
COMMENT ON FUNCTION public.undo_provider_soft_delete(UUID, TEXT) IS
  'Service-role-only single-use undo before the server-assigned expiry.';

NOTIFY pgrst, 'reload schema';
