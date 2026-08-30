-- A browser can retry after the write committed but its HTTP response was
-- lost. Return the already-recorded event for completed actions.

CREATE OR REPLACE FUNCTION public.complete_verified_wiki_write(p_action_id UUID)
RETURNS TABLE (
  id UUID,
  slug TEXT,
  title TEXT,
  content TEXT,
  excerpt TEXT,
  category TEXT,
  version INTEGER,
  updated_at TIMESTAMPTZ,
  event_id UUID
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_action public.community_verification_actions%ROWTYPE;
BEGIN
  SELECT actions.* INTO v_action
  FROM public.community_verification_actions AS actions
  WHERE actions.id = p_action_id
  FOR UPDATE;

  IF NOT FOUND OR v_action.action_type NOT IN ('wiki_create', 'wiki_update', 'wiki_delete')
    OR v_action.requester_whatsapp IS NULL
    OR NOT (
      (v_action.status = 'verified' AND v_action.consumed_at IS NULL)
      OR (v_action.status = 'completed' AND v_action.consumed_at IS NOT NULL)
    ) THEN
    RAISE EXCEPTION 'Verified wiki action is not ready' USING ERRCODE = 'P0001';
  END IF;

  IF v_action.status = 'completed' THEN
    RETURN QUERY SELECT writes.*
    FROM public.apply_audited_wiki_write(
      v_action.action_type,
      v_action.payload->>'slug',
      v_action.payload->>'title',
      v_action.payload->>'category',
      v_action.payload->>'content',
      (v_action.payload->>'expectedVersion')::INTEGER,
      v_action.requester_whatsapp,
      NULL,
      v_action.verification_method,
      v_action.id,
      NULL
    ) AS writes;
    RETURN;
  END IF;

  RETURN QUERY
  WITH applied AS (
    SELECT writes.*
    FROM public.apply_audited_wiki_write(
      v_action.action_type,
      v_action.payload->>'slug',
      v_action.payload->>'title',
      v_action.payload->>'category',
      v_action.payload->>'content',
      (v_action.payload->>'expectedVersion')::INTEGER,
      v_action.requester_whatsapp,
      NULL,
      v_action.verification_method,
      v_action.id,
      NULL
    ) AS writes
  ), completed AS (
    UPDATE public.community_verification_actions AS actions
    SET status = 'completed', consumed_at = now(), result_id = applied.id
    FROM applied
    WHERE actions.id = v_action.id
      AND actions.status = 'verified'
      AND actions.consumed_at IS NULL
    RETURNING applied.*
  )
  SELECT completed.* FROM completed;
END;
$$;
