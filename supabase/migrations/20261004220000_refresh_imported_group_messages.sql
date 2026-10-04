-- Re-importing a window refreshes previously imported messages with the
-- current extraction logic, so improvements (such as contact cards recovered
-- from quoted messages) apply to history that is rerun. Live messages keep
-- their content and only gain missing contact cards and sender numbers.

DROP FUNCTION IF EXISTS public.import_group_messages(JSONB);

CREATE FUNCTION public.import_group_messages(p_messages JSONB)
RETURNS TABLE (inserted INTEGER, refreshed INTEGER, disabled INTEGER)
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
    ON CONFLICT (group_jid, message_id) DO UPDATE SET
      body = CASE WHEN messages.source = 'backfill' THEN EXCLUDED.body ELSE messages.body END,
      contacts = CASE
        WHEN messages.source = 'backfill' OR messages.contacts = '[]'::JSONB THEN EXCLUDED.contacts
        ELSE messages.contacts END,
      quoted_message_id = COALESCE(messages.quoted_message_id, EXCLUDED.quoted_message_id),
      sender_name = COALESCE(messages.sender_name, EXCLUDED.sender_name),
      sender_phone = COALESCE(messages.sender_phone, EXCLUDED.sender_phone)
    RETURNING (xmax = 0) AS was_inserted
  )
  SELECT (SELECT count(*) FROM eligible), (SELECT count(*) FROM written WHERE was_inserted)
  INTO v_eligible, v_inserted;

  RETURN QUERY SELECT v_inserted, v_eligible - v_inserted, v_total - v_eligible;
END;
$$;

REVOKE ALL ON FUNCTION public.import_group_messages(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_group_messages(JSONB) TO machu_listener, service_role;

NOTIFY pgrst, 'reload schema';
