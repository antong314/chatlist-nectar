-- Backfill historical group messages and digest a chosen date window, with
-- reruns. Imported messages are tagged so the daily digest never processes
-- them; backfill runs select messages by sent_at window instead of the
-- receipt watermark, and a rerun supersedes the previous run's undecided items.

ALTER TABLE public.group_messages
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'live'
    CHECK (source IN ('live', 'backfill'));

ALTER TABLE public.group_digest_runs
  ADD COLUMN IF NOT EXISTS window_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS window_end TIMESTAMPTZ;

ALTER TABLE public.group_digest_runs
  DROP CONSTRAINT IF EXISTS group_digest_runs_trigger_check;
ALTER TABLE public.group_digest_runs
  ADD CONSTRAINT group_digest_runs_trigger_check CHECK (trigger IN ('schedule', 'manual', 'backfill'));
ALTER TABLE public.group_digest_runs
  DROP CONSTRAINT IF EXISTS group_digest_runs_backfill_window_check;
ALTER TABLE public.group_digest_runs
  ADD CONSTRAINT group_digest_runs_backfill_window_check CHECK (
    (trigger = 'backfill' AND window_start IS NOT NULL AND window_end > window_start)
    OR (trigger <> 'backfill' AND window_start IS NULL AND window_end IS NULL)
  );

ALTER TABLE public.group_digest_items
  DROP CONSTRAINT IF EXISTS group_digest_items_status_check;
ALTER TABLE public.group_digest_items
  ADD CONSTRAINT group_digest_items_status_check CHECK (status IN (
    'applied', 'proposed', 'needs_review', 'skipped', 'undone', 'failed', 'superseded'
  ));

CREATE INDEX IF NOT EXISTS group_digest_runs_window_idx
  ON public.group_digest_runs (window_start, window_end)
  WHERE trigger = 'backfill';

DROP FUNCTION IF EXISTS public.claim_group_digest_run(DATE, TEXT, TEXT);

CREATE FUNCTION public.claim_group_digest_run(
  p_run_date DATE,
  p_trigger TEXT,
  p_mode TEXT,
  p_window_start TIMESTAMPTZ DEFAULT NULL,
  p_window_end TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_run_id UUID;
BEGIN
  IF p_trigger NOT IN ('schedule', 'manual', 'backfill') OR p_mode NOT IN ('shadow', 'publish')
    OR ((p_trigger = 'backfill') <> (p_window_start IS NOT NULL AND p_window_end > p_window_start)) THEN
    RAISE EXCEPTION 'Invalid digest run' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('machu_group_digest_run'));

  UPDATE public.group_digest_runs
  SET status = 'failed', error = 'Run did not finish within two hours', finished_at = now()
  WHERE status = 'running' AND started_at < now() - interval '2 hours';

  IF EXISTS (SELECT 1 FROM public.group_digest_runs WHERE status = 'running') THEN
    RETURN NULL;
  END IF;
  IF p_trigger = 'schedule' AND (
    EXISTS (
      SELECT 1 FROM public.group_digest_runs
      WHERE run_date = p_run_date AND trigger = 'schedule' AND status = 'completed'
    )
    OR (
      SELECT count(*) FROM public.group_digest_runs
      WHERE run_date = p_run_date AND trigger = 'schedule' AND status = 'failed'
    ) >= 3
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.group_digest_runs (run_date, trigger, mode, window_start, window_end)
  VALUES (
    p_run_date, p_trigger, p_mode,
    CASE WHEN p_trigger = 'backfill' THEN p_window_start END,
    CASE WHEN p_trigger = 'backfill' THEN p_window_end END
  )
  RETURNING id INTO v_run_id;
  RETURN v_run_id;
END;
$$;

-- Imports a batch of historical messages for enabled groups. Existing
-- messages are left untouched; a purged message is restored on re-import.
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
      NULLIF(btrim(COALESCE(entry->>'quoted_message_id', '')), '') AS quoted_message_id
    FROM jsonb_array_elements(p_messages) AS entry
  ), eligible AS (
    SELECT incoming.* FROM incoming
    JOIN public.whatsapp_groups AS groups ON groups.jid = incoming.group_jid AND groups.enabled
  ), written AS (
    INSERT INTO public.group_messages (
      group_jid, message_id, sender_hash, sender_name, sent_at, body, contacts,
      quoted_message_id, source
    )
    SELECT group_jid, message_id, sender_hash, sender_name, sent_at, body, contacts,
      quoted_message_id, 'backfill'
    FROM eligible
    ON CONFLICT (group_jid, message_id) DO NOTHING
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM eligible), (SELECT count(*) FROM written)
  INTO v_eligible, v_inserted;

  RETURN QUERY SELECT v_inserted, v_eligible - v_inserted, v_total - v_eligible;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_group_digest_run(DATE, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.import_group_messages(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_group_digest_run(DATE, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.import_group_messages(JSONB) TO machu_listener, service_role;

NOTIFY pgrst, 'reload schema';
