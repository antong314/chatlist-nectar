CREATE TABLE public.bot_search_sessions (
  conversation_key TEXT PRIMARY KEY CHECK (conversation_key ~ '^[0-9a-f]{64}$'),
  context JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(context) = 'object'),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);

CREATE INDEX bot_search_sessions_expiry_idx
  ON public.bot_search_sessions (expires_at);

ALTER TABLE public.bot_search_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bot_search_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.bot_search_sessions TO service_role;

CREATE OR REPLACE FUNCTION public.get_bot_search_session(p_conversation_key TEXT)
RETURNS TABLE (
  context JSONB,
  expires_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    sessions.context,
    sessions.expires_at
  FROM public.bot_search_sessions AS sessions
  WHERE sessions.conversation_key = lower(btrim(COALESCE(p_conversation_key, '')))
    AND sessions.expires_at > now()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.set_bot_search_session(
  p_conversation_key TEXT,
  p_context JSONB DEFAULT '{}'::JSONB,
  p_ttl_hours INTEGER DEFAULT 24
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_key TEXT := lower(btrim(COALESCE(p_conversation_key, '')));
  v_context JSONB := COALESCE(p_context, '{}'::JSONB);
  v_ttl_hours INTEGER := LEAST(GREATEST(COALESCE(p_ttl_hours, 24), 1), 72);
BEGIN
  IF v_key !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid conversation key' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_context) <> 'object' THEN
    RAISE EXCEPTION 'Search context must be an object' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.bot_search_sessions AS sessions (
    conversation_key,
    context,
    expires_at,
    updated_at
  )
  VALUES (
    v_key,
    v_context,
    now() + make_interval(hours => v_ttl_hours),
    now()
  )
  ON CONFLICT (conversation_key) DO UPDATE
  SET
    context = EXCLUDED.context,
    expires_at = EXCLUDED.expires_at,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_bot_search_session(p_conversation_key TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  DELETE FROM public.bot_search_sessions
  WHERE conversation_key = lower(btrim(COALESCE(p_conversation_key, '')));
$$;

REVOKE ALL ON FUNCTION public.get_bot_search_session(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_bot_search_session(TEXT, JSONB, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_bot_search_session(TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_bot_search_session(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_bot_search_session(TEXT, JSONB, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_bot_search_session(TEXT) TO anon, authenticated;

COMMENT ON TABLE public.bot_search_sessions IS
  'Short-lived Machu search result queues keyed by a server-generated HMAC; contains no submitter phone numbers.';

NOTIFY pgrst, 'reload schema';
