-- Production foundation for the Machu WhatsApp directory bot.
-- Contact phone numbers are unique after normalization, and short-lived bot
-- state is keyed by an HMAC so submitter phone numbers are never stored here.

CREATE OR REPLACE FUNCTION public.normalize_contact_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT NULLIF(
    CASE
      WHEN left(normalized.digits, 2) = '00' THEN substring(normalized.digits FROM 3)
      ELSE normalized.digits
    END,
    ''
  )
  FROM (
    SELECT regexp_replace(COALESCE(p_phone, ''), '[^0-9]+', '', 'g') AS digits
  ) AS normalized;
$$;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS phone_normalized TEXT
  GENERATED ALWAYS AS (public.normalize_contact_phone(phone_number)) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS contacts_active_phone_normalized_unique_idx
  ON public.contacts (phone_normalized)
  WHERE is_deleted = FALSE
    AND phone_normalized IS NOT NULL;

CREATE OR REPLACE FUNCTION public.find_active_contact_by_phone(p_phone TEXT)
RETURNS TABLE (
  id UUID,
  title TEXT,
  subtitle TEXT,
  category TEXT,
  phone_number TEXT,
  website_url TEXT,
  map_url TEXT,
  image_url TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT
    contacts.id,
    contacts.title,
    contacts.subtitle,
    contacts.category,
    contacts.phone_number,
    contacts.website_url,
    contacts.map_url,
    contacts.image_url
  FROM public.contacts AS contacts
  WHERE contacts.is_deleted = FALSE
    AND contacts.phone_normalized = public.normalize_contact_phone(p_phone)
  LIMIT 1;
$$;

CREATE TYPE public.bot_conversation_phase AS ENUM (
  'awaiting_description',
  'awaiting_category',
  'review_optional',
  'awaiting_review'
);

CREATE TABLE public.bot_conversations (
  conversation_key TEXT PRIMARY KEY CHECK (conversation_key ~ '^[0-9a-f]{64}$'),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  phase public.bot_conversation_phase NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(context) = 'object'),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);

CREATE INDEX bot_conversations_expiry_idx
  ON public.bot_conversations (expires_at);

ALTER TABLE public.bot_conversations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bot_conversations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.bot_conversations TO service_role;

CREATE OR REPLACE FUNCTION public.get_bot_conversation(p_conversation_key TEXT)
RETURNS TABLE (
  contact_id UUID,
  phase TEXT,
  context JSONB,
  expires_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    conversations.contact_id,
    conversations.phase::TEXT,
    conversations.context,
    conversations.expires_at
  FROM public.bot_conversations AS conversations
  JOIN public.contacts AS contacts
    ON contacts.id = conversations.contact_id
   AND contacts.is_deleted = FALSE
  WHERE conversations.conversation_key = lower(btrim(COALESCE(p_conversation_key, '')))
    AND conversations.expires_at > now()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.set_bot_conversation(
  p_conversation_key TEXT,
  p_contact_id UUID,
  p_phase TEXT,
  p_context JSONB DEFAULT '{}'::JSONB,
  p_ttl_hours INTEGER DEFAULT 72
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_key TEXT := lower(btrim(COALESCE(p_conversation_key, '')));
  v_phase public.bot_conversation_phase;
  v_context JSONB := COALESCE(p_context, '{}'::JSONB);
  v_ttl_hours INTEGER := LEAST(GREATEST(COALESCE(p_ttl_hours, 72), 1), 168);
BEGIN
  IF v_key !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid conversation key' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_context) <> 'object' THEN
    RAISE EXCEPTION 'Conversation context must be an object' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.contacts
    WHERE id = p_contact_id AND is_deleted = FALSE
  ) THEN
    RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
  END IF;

  BEGIN
    v_phase := p_phase::public.bot_conversation_phase;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Invalid conversation phase' USING ERRCODE = '22023';
  END;

  INSERT INTO public.bot_conversations AS conversations (
    conversation_key,
    contact_id,
    phase,
    context,
    expires_at,
    updated_at
  )
  VALUES (
    v_key,
    p_contact_id,
    v_phase,
    v_context,
    now() + make_interval(hours => v_ttl_hours),
    now()
  )
  ON CONFLICT (conversation_key) DO UPDATE
  SET
    contact_id = EXCLUDED.contact_id,
    phase = EXCLUDED.phase,
    context = EXCLUDED.context,
    expires_at = EXCLUDED.expires_at,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_bot_conversation(p_conversation_key TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  DELETE FROM public.bot_conversations
  WHERE conversation_key = lower(btrim(COALESCE(p_conversation_key, '')));
$$;

REVOKE ALL ON FUNCTION public.normalize_contact_phone(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_active_contact_by_phone(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_bot_conversation(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_bot_conversation(TEXT, UUID, TEXT, JSONB, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_bot_conversation(TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.normalize_contact_phone(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_active_contact_by_phone(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_bot_conversation(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_bot_conversation(TEXT, UUID, TEXT, JSONB, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_bot_conversation(TEXT) TO anon, authenticated;

COMMENT ON TABLE public.bot_conversations IS
  'Short-lived Machu bot state keyed by a server-generated HMAC; contains no submitter phone numbers.';

NOTIFY pgrst, 'reload schema';
