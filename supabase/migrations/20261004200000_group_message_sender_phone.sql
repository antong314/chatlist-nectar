-- Providers in community groups usually advertise themselves ("DM me"), so
-- their contact number is the poster's own WhatsApp number. Store the sender's
-- number privately with the raw message (purged with it after the retention
-- window); the digest uses it only for self-promotion.

ALTER TABLE public.group_messages
  ADD COLUMN IF NOT EXISTS sender_phone TEXT
    CHECK (sender_phone IS NULL OR sender_phone ~ '^\+[1-9][0-9]{7,14}$');

DROP FUNCTION IF EXISTS public.record_group_message(TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, JSONB, TEXT);

CREATE FUNCTION public.record_group_message(
  p_group_jid TEXT,
  p_group_name TEXT,
  p_message_id TEXT,
  p_sender_hash TEXT,
  p_sender_name TEXT,
  p_sent_at TIMESTAMPTZ,
  p_body TEXT,
  p_contacts JSONB,
  p_quoted_message_id TEXT,
  p_sender_phone TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_enabled BOOLEAN;
  v_inserted INTEGER;
  v_phone TEXT := NULLIF(btrim(COALESCE(p_sender_phone, '')), '');
BEGIN
  v_enabled := public.upsert_whatsapp_group(p_group_jid, p_group_name);
  IF NOT v_enabled THEN
    RETURN FALSE;
  END IF;
  IF v_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
    v_phone := NULL;
  END IF;
  INSERT INTO public.group_messages (
    group_jid, message_id, sender_hash, sender_name, sent_at, body, contacts,
    quoted_message_id, sender_phone
  ) VALUES (
    p_group_jid,
    p_message_id,
    p_sender_hash,
    NULLIF(left(btrim(COALESCE(p_sender_name, '')), 100), ''),
    COALESCE(p_sent_at, now()),
    left(COALESCE(p_body, ''), 8000),
    COALESCE(p_contacts, '[]'::JSONB),
    NULLIF(btrim(COALESCE(p_quoted_message_id, '')), ''),
    v_phone
  ) ON CONFLICT (group_jid, message_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted > 0 THEN
    UPDATE public.whatsapp_listener_status
    SET last_message_at = GREATEST(COALESCE(last_message_at, '-infinity'), COALESCE(p_sent_at, now()))
    WHERE id = 1;
  END IF;
  RETURN v_inserted > 0;
END;
$$;

-- Re-importing fills in sender numbers for messages stored before this change.
CREATE OR REPLACE FUNCTION public.import_group_messages(p_messages JSONB)
RETURNS TABLE (inserted INTEGER, duplicates INTEGER, disabled INTEGER)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_total INTEGER;
  v_eligible INTEGER;
  v_inserted INTEGER;
BEGIN
  IF jsonb_typeof(p_messages) <> 'array' OR jsonb_array_length(p_messages) > 1000 THEN
    RAISE EXCEPTION 'Import batches must be arrays of at most 1000 messages' USING ERRCODE = '22023';
  END IF;
  v_total := jsonb_array_length(p_messages);

  WITH incoming AS (
    SELECT
      entry->>'group_jid' AS group_jid,
      entry->>'message_id' AS message_id,
      entry->>'sender_hash' AS sender_hash,
      NULLIF(left(btrim(COALESCE(entry->>'sender_name', '')), 100), '') AS sender_name,
      (entry->>'sent_at')::TIMESTAMPTZ AS sent_at,
      left(COALESCE(entry->>'body', ''), 8000) AS body,
      COALESCE(entry->'contacts', '[]'::JSONB) AS contacts,
      NULLIF(btrim(COALESCE(entry->>'quoted_message_id', '')), '') AS quoted_message_id,
      CASE WHEN entry->>'sender_phone' ~ '^\+[1-9][0-9]{7,14}$' THEN entry->>'sender_phone' END AS sender_phone
    FROM jsonb_array_elements(p_messages) AS entry
  ), eligible AS (
    SELECT incoming.* FROM incoming
    JOIN public.whatsapp_groups AS groups ON groups.jid = incoming.group_jid AND groups.enabled
  ), written AS (
    INSERT INTO public.group_messages AS messages (
      group_jid, message_id, sender_hash, sender_name, sent_at, body, contacts,
      quoted_message_id, source, sender_phone
    )
    SELECT group_jid, message_id, sender_hash, sender_name, sent_at, body, contacts,
      quoted_message_id, 'backfill', sender_phone
    FROM eligible
    ON CONFLICT (group_jid, message_id) DO UPDATE
      SET sender_phone = COALESCE(messages.sender_phone, EXCLUDED.sender_phone)
    RETURNING (xmax = 0) AS was_inserted
  )
  SELECT (SELECT count(*) FROM eligible), (SELECT count(*) FROM written WHERE was_inserted)
  INTO v_eligible, v_inserted;

  RETURN QUERY SELECT v_inserted, v_eligible - v_inserted, v_total - v_eligible;
END;
$$;

REVOKE ALL ON FUNCTION public.record_group_message(TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.import_group_messages(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_group_message(TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, JSONB, TEXT, TEXT) TO machu_listener, service_role;
GRANT EXECUTE ON FUNCTION public.import_group_messages(JSONB) TO machu_listener, service_role;

COMMENT ON COLUMN public.group_messages.sender_phone IS
  'Private sender WhatsApp number, used only when a member advertises their own service; purged with the message.';

NOTIFY pgrst, 'reload schema';
