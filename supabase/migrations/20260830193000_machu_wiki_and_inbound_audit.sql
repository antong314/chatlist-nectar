-- Extend Machu from a directory-only bot into an audited conversational front
-- door for the community wiki. Every WhatsApp or trusted-browser mutation is
-- attributable, while reads remain public.

ALTER TABLE public.provider_change_events
  ALTER COLUMN verification_action_id DROP NOT NULL;

ALTER TABLE public.provider_change_events
  ADD COLUMN IF NOT EXISTS requester_name TEXT,
  ADD COLUMN IF NOT EXISTS twilio_message_sid TEXT;

ALTER TABLE public.provider_change_events
  DROP CONSTRAINT IF EXISTS provider_change_events_actor_source_check;
ALTER TABLE public.provider_change_events
  ADD CONSTRAINT provider_change_events_actor_source_check CHECK (
    (verification_action_id IS NOT NULL AND twilio_message_sid IS NULL)
    OR (verification_action_id IS NULL AND twilio_message_sid IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS provider_change_events_inbound_message_idx
  ON public.provider_change_events (twilio_message_sid, contact_id, action_type)
  WHERE twilio_message_sid IS NOT NULL;

-- The legacy browser client wrote wiki rows directly. Keep public reads, but
-- require all new mutations to pass through the audited service-only RPCs.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.wiki_pages FROM anon, authenticated;

CREATE TABLE public.wiki_change_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL,
  page_slug TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'wiki_create', 'wiki_update', 'wiki_delete', 'wiki_restore'
  )),
  requester_whatsapp TEXT NOT NULL CHECK (requester_whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  requester_name TEXT,
  verification_method TEXT NOT NULL CHECK (verification_method IN (
    'whatsapp_inbound', 'trusted_session'
  )),
  verification_action_id UUID UNIQUE
    REFERENCES public.community_verification_actions(id) ON DELETE RESTRICT,
  twilio_message_sid TEXT,
  before_snapshot JSONB CHECK (
    before_snapshot IS NULL OR jsonb_typeof(before_snapshot) = 'object'
  ),
  after_snapshot JSONB CHECK (
    after_snapshot IS NULL OR jsonb_typeof(after_snapshot) = 'object'
  ),
  reverted_at TIMESTAMPTZ,
  reverted_by_event_id UUID REFERENCES public.wiki_change_events(id) ON DELETE RESTRICT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (verification_action_id IS NOT NULL AND twilio_message_sid IS NULL)
    OR (verification_action_id IS NULL AND twilio_message_sid IS NOT NULL)
  ),
  CHECK (
    (action_type = 'wiki_create' AND before_snapshot IS NULL AND after_snapshot IS NOT NULL)
    OR (action_type = 'wiki_update' AND before_snapshot IS NOT NULL AND after_snapshot IS NOT NULL)
    OR (action_type = 'wiki_delete' AND before_snapshot IS NOT NULL AND after_snapshot IS NULL)
    OR (action_type = 'wiki_restore' AND (
      before_snapshot IS NOT NULL OR after_snapshot IS NOT NULL
    ))
  )
);

CREATE INDEX wiki_change_events_page_changed_idx
  ON public.wiki_change_events (page_id, changed_at DESC);
CREATE INDEX wiki_change_events_actor_changed_idx
  ON public.wiki_change_events (requester_whatsapp, changed_at DESC);
CREATE UNIQUE INDEX wiki_change_events_inbound_message_idx
  ON public.wiki_change_events (twilio_message_sid, page_slug, action_type)
  WHERE twilio_message_sid IS NOT NULL;

ALTER TABLE public.wiki_change_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wiki_change_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.wiki_change_events TO service_role;

CREATE TABLE public.bot_wiki_sessions (
  conversation_key TEXT PRIMARY KEY CHECK (conversation_key ~ '^[0-9a-f]{64}$'),
  context JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(context) = 'object'),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);

CREATE INDEX bot_wiki_sessions_expiry_idx ON public.bot_wiki_sessions (expires_at);
ALTER TABLE public.bot_wiki_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bot_wiki_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.bot_wiki_sessions TO service_role;

CREATE OR REPLACE FUNCTION public.get_bot_wiki_session(p_conversation_key TEXT)
RETURNS TABLE (context JSONB, expires_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT sessions.context, sessions.expires_at
  FROM public.bot_wiki_sessions AS sessions
  WHERE sessions.conversation_key = lower(btrim(COALESCE(p_conversation_key, '')))
    AND sessions.expires_at > now()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.set_bot_wiki_session(
  p_conversation_key TEXT,
  p_context JSONB DEFAULT '{}'::JSONB,
  p_ttl_hours INTEGER DEFAULT 24
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_key TEXT := lower(btrim(COALESCE(p_conversation_key, '')));
  v_context JSONB := COALESCE(p_context, '{}'::JSONB);
  v_ttl_hours INTEGER := LEAST(GREATEST(COALESCE(p_ttl_hours, 24), 1), 72);
BEGIN
  IF v_key !~ '^[0-9a-f]{64}$' OR jsonb_typeof(v_context) <> 'object' THEN
    RAISE EXCEPTION 'Invalid wiki conversation state' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.bot_wiki_sessions AS sessions (
    conversation_key, context, expires_at, updated_at
  ) VALUES (
    v_key, v_context, now() + make_interval(hours => v_ttl_hours), now()
  ) ON CONFLICT (conversation_key) DO UPDATE SET
    context = EXCLUDED.context,
    expires_at = EXCLUDED.expires_at,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_bot_wiki_session(p_conversation_key TEXT)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  DELETE FROM public.bot_wiki_sessions
  WHERE conversation_key = lower(btrim(COALESCE(p_conversation_key, '')));
$$;

CREATE OR REPLACE FUNCTION public.apply_audited_wiki_write(
  p_action_type TEXT,
  p_slug TEXT,
  p_title TEXT,
  p_category TEXT,
  p_content TEXT,
  p_expected_version INTEGER,
  p_requester_whatsapp TEXT,
  p_requester_name TEXT DEFAULT NULL,
  p_verification_method TEXT DEFAULT 'whatsapp_inbound',
  p_verification_action_id UUID DEFAULT NULL,
  p_twilio_message_sid TEXT DEFAULT NULL
)
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
  v_action TEXT := lower(btrim(COALESCE(p_action_type, '')));
  v_slug TEXT := lower(btrim(COALESCE(p_slug, '')));
  v_title TEXT := btrim(COALESCE(p_title, ''));
  v_category TEXT := COALESCE(NULLIF(btrim(COALESCE(p_category, '')), ''), 'Uncategorized');
  v_phone TEXT := btrim(COALESCE(p_requester_whatsapp, ''));
  v_current public.wiki_pages%ROWTYPE;
  v_next public.wiki_pages%ROWTYPE;
  v_before JSONB;
  v_after JSONB;
  v_event_id UUID;
  v_existing public.wiki_change_events%ROWTYPE;
  v_snapshot JSONB;
BEGIN
  IF v_action NOT IN ('wiki_create', 'wiki_update', 'wiki_delete')
    OR v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    OR v_phone !~ '^\+[1-9][0-9]{7,14}$'
    OR p_verification_method NOT IN ('whatsapp_inbound', 'trusted_session')
    OR ((p_verification_action_id IS NULL) = (p_twilio_message_sid IS NULL)) THEN
    RAISE EXCEPTION 'Invalid audited wiki change' USING ERRCODE = '22023';
  END IF;
  IF length(v_title) > 160 OR length(v_category) > 80
    OR length(COALESCE(p_content, '')) > 200000 THEN
    RAISE EXCEPTION 'Wiki change is too large' USING ERRCODE = '22023';
  END IF;
  IF v_action <> 'wiki_delete' THEN
    IF v_title = '' OR p_content IS NULL OR jsonb_typeof(p_content::JSONB) <> 'array' THEN
      RAISE EXCEPTION 'Wiki content must be a BlockNote JSON array' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_twilio_message_sid IS NOT NULL OR p_verification_action_id IS NOT NULL THEN
    SELECT events.* INTO v_existing
    FROM public.wiki_change_events AS events
    WHERE (
        (p_twilio_message_sid IS NOT NULL AND events.twilio_message_sid = p_twilio_message_sid)
        OR (p_verification_action_id IS NOT NULL
          AND events.verification_action_id = p_verification_action_id)
      )
      AND events.page_slug = v_slug
      AND events.action_type = v_action
    LIMIT 1;
    IF FOUND THEN
      v_snapshot := COALESCE(v_existing.after_snapshot, v_existing.before_snapshot);
      RETURN QUERY SELECT
        (v_snapshot->>'id')::UUID,
        v_existing.page_slug,
        v_snapshot->>'title',
        v_snapshot->>'content',
        v_snapshot->>'excerpt',
        v_snapshot->>'category',
        (v_snapshot->>'version')::INTEGER,
        (v_snapshot->>'updated_at')::TIMESTAMPTZ,
        v_existing.id;
      RETURN;
    END IF;
  END IF;

  SELECT pages.* INTO v_current
  FROM public.wiki_pages AS pages
  WHERE pages.slug = v_slug AND pages.is_published = TRUE
  LIMIT 1 FOR UPDATE;

  IF v_action = 'wiki_create' THEN
    IF FOUND THEN RAISE EXCEPTION 'Wiki page already exists' USING ERRCODE = '23505'; END IF;
    v_next.id := gen_random_uuid();
    v_next.slug := v_slug;
    v_next.title := v_title;
    v_next.content := to_jsonb(p_content);
    v_next.excerpt := 'A page about ' || v_title;
    v_next.category := v_category;
    v_next.version := 0;
    v_next.is_published := TRUE;
    v_next.created_at := now();
    v_next.updated_at := now();
    INSERT INTO public.wiki_pages (
      id, slug, title, content, excerpt, category, version, is_published,
      created_at, updated_at, created_by
    ) VALUES (
      v_next.id, v_next.slug, v_next.title, v_next.content, v_next.excerpt,
      v_next.category, v_next.version, TRUE, v_next.created_at, v_next.updated_at, NULL
    ) RETURNING * INTO v_next;
    v_before := NULL;
    v_after := jsonb_build_object('id', v_next.id, 'slug', v_next.slug,
      'title', v_next.title, 'content', v_next.content, 'excerpt', v_next.excerpt,
      'category', v_next.category, 'version', v_next.version,
      'created_at', v_next.created_at, 'updated_at', v_next.updated_at);
  ELSE
    IF NOT FOUND THEN RAISE EXCEPTION 'Wiki page not found' USING ERRCODE = 'P0002'; END IF;
    IF p_expected_version IS NULL OR v_current.version <> p_expected_version THEN
      RAISE EXCEPTION 'Wiki page changed since it was read' USING ERRCODE = '40001';
    END IF;
    v_before := jsonb_build_object('id', v_current.id, 'slug', v_current.slug,
      'title', v_current.title, 'content', v_current.content, 'excerpt', v_current.excerpt,
      'category', v_current.category, 'version', v_current.version,
      'created_at', v_current.created_at, 'updated_at', v_current.updated_at);
    UPDATE public.wiki_pages AS pages SET is_published = FALSE
    WHERE pages.id = v_current.id AND pages.version = v_current.version;

    IF v_action = 'wiki_delete' THEN
      v_next := v_current;
      v_after := NULL;
    ELSE
      INSERT INTO public.wiki_pages (
        id, slug, title, content, excerpt, category, version, is_published,
        created_at, updated_at, created_by
      ) VALUES (
        v_current.id, v_slug, v_title, to_jsonb(p_content),
        COALESCE(v_current.excerpt, 'A page about ' || v_title), v_category,
        v_current.version + 1, TRUE, v_current.created_at, now(), v_current.created_by
      ) RETURNING * INTO v_next;
      v_after := jsonb_build_object('id', v_next.id, 'slug', v_next.slug,
        'title', v_next.title, 'content', v_next.content, 'excerpt', v_next.excerpt,
        'category', v_next.category, 'version', v_next.version,
        'created_at', v_next.created_at, 'updated_at', v_next.updated_at);
    END IF;
  END IF;

  INSERT INTO public.wiki_change_events (
    page_id, page_slug, action_type, requester_whatsapp, requester_name,
    verification_method, verification_action_id, twilio_message_sid,
    before_snapshot, after_snapshot
  ) VALUES (
    v_next.id, v_slug, v_action, v_phone, NULLIF(btrim(COALESCE(p_requester_name, '')), ''),
    p_verification_method, p_verification_action_id, p_twilio_message_sid,
    v_before, v_after
  ) RETURNING wiki_change_events.id INTO v_event_id;

  RETURN QUERY SELECT v_next.id, v_next.slug, v_next.title, v_next.content #>> '{}',
    v_next.excerpt, v_next.category, v_next.version::INTEGER, v_next.updated_at, v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.undo_last_inbound_wiki_change(
  p_requester_whatsapp TEXT,
  p_requester_name TEXT,
  p_twilio_message_sid TEXT
)
RETURNS TABLE (slug TEXT, title TEXT, version INTEGER, event_id UUID)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_original public.wiki_change_events%ROWTYPE;
  v_current public.wiki_pages%ROWTYPE;
  v_restored public.wiki_pages%ROWTYPE;
  v_before JSONB;
  v_after JSONB;
  v_event_id UUID;
  v_existing public.wiki_change_events%ROWTYPE;
  v_snapshot JSONB;
BEGIN
  IF btrim(COALESCE(p_requester_whatsapp, '')) !~ '^\+[1-9][0-9]{7,14}$'
    OR NULLIF(btrim(COALESCE(p_twilio_message_sid, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Invalid wiki undo request' USING ERRCODE = '22023';
  END IF;

  SELECT events.* INTO v_existing
  FROM public.wiki_change_events AS events
  WHERE events.twilio_message_sid = p_twilio_message_sid
    AND events.action_type = 'wiki_restore'
  LIMIT 1;
  IF FOUND THEN
    v_snapshot := COALESCE(v_existing.after_snapshot, v_existing.before_snapshot);
    RETURN QUERY SELECT v_existing.page_slug, v_snapshot->>'title',
      COALESCE((v_existing.after_snapshot->>'version')::INTEGER, -1), v_existing.id;
    RETURN;
  END IF;

  SELECT events.* INTO v_original
  FROM public.wiki_change_events AS events
  WHERE events.requester_whatsapp = btrim(COALESCE(p_requester_whatsapp, ''))
    AND events.twilio_message_sid IS NOT NULL
    AND events.action_type IN ('wiki_create', 'wiki_update', 'wiki_delete')
    AND events.reverted_at IS NULL
    AND events.changed_at > now() - interval '24 hours'
  ORDER BY events.changed_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No recent wiki change to undo' USING ERRCODE = 'P0002'; END IF;

  SELECT pages.* INTO v_current FROM public.wiki_pages AS pages
  WHERE pages.slug = v_original.page_slug AND pages.is_published = TRUE
  LIMIT 1 FOR UPDATE;

  IF v_original.action_type = 'wiki_create' THEN
    IF NOT FOUND OR v_current.version <> (v_original.after_snapshot->>'version')::INTEGER THEN
      RAISE EXCEPTION 'Wiki page changed after your edit' USING ERRCODE = '40001';
    END IF;
    v_before := v_original.after_snapshot;
    UPDATE public.wiki_pages AS pages SET is_published = FALSE
    WHERE pages.id = v_current.id AND pages.version = v_current.version;
    v_restored := v_current;
    v_after := NULL;
  ELSE
    IF v_original.action_type = 'wiki_update'
      AND (NOT FOUND OR v_current.version <> (v_original.after_snapshot->>'version')::INTEGER) THEN
      RAISE EXCEPTION 'Wiki page changed after your edit' USING ERRCODE = '40001';
    END IF;
    IF v_original.action_type = 'wiki_delete' AND FOUND THEN
      RAISE EXCEPTION 'Wiki page changed after your edit' USING ERRCODE = '40001';
    END IF;
    IF FOUND THEN
      v_before := jsonb_build_object('id', v_current.id, 'slug', v_current.slug,
        'title', v_current.title, 'content', v_current.content, 'excerpt', v_current.excerpt,
        'category', v_current.category, 'version', v_current.version,
        'created_at', v_current.created_at, 'updated_at', v_current.updated_at);
      UPDATE public.wiki_pages AS pages SET is_published = FALSE
      WHERE pages.id = v_current.id AND pages.version = v_current.version;
    ELSE
      v_before := NULL;
    END IF;
    INSERT INTO public.wiki_pages (
      id, slug, title, content, excerpt, category, version, is_published,
      created_at, updated_at, created_by
    ) SELECT
      (v_original.before_snapshot->>'id')::UUID,
      v_original.before_snapshot->>'slug', v_original.before_snapshot->>'title',
      v_original.before_snapshot->'content', v_original.before_snapshot->>'excerpt',
      v_original.before_snapshot->>'category',
      COALESCE((SELECT max(pages.version) + 1 FROM public.wiki_pages AS pages
        WHERE pages.id = (v_original.before_snapshot->>'id')::UUID), 0),
      TRUE, COALESCE((v_original.before_snapshot->>'created_at')::TIMESTAMPTZ, now()),
      now(), NULL
    RETURNING * INTO v_restored;
    v_after := jsonb_build_object('id', v_restored.id, 'slug', v_restored.slug,
      'title', v_restored.title, 'content', v_restored.content, 'excerpt', v_restored.excerpt,
      'category', v_restored.category, 'version', v_restored.version,
      'created_at', v_restored.created_at, 'updated_at', v_restored.updated_at);
  END IF;

  INSERT INTO public.wiki_change_events (
    page_id, page_slug, action_type, requester_whatsapp, requester_name,
    verification_method, twilio_message_sid, before_snapshot, after_snapshot
  ) VALUES (
    v_original.page_id, v_original.page_slug, 'wiki_restore', v_original.requester_whatsapp,
    NULLIF(btrim(COALESCE(p_requester_name, '')), ''), 'whatsapp_inbound',
    p_twilio_message_sid, v_before, v_after
  ) RETURNING wiki_change_events.id INTO v_event_id;
  UPDATE public.wiki_change_events SET reverted_at = now(), reverted_by_event_id = v_event_id
  WHERE wiki_change_events.id = v_original.id;

  RETURN QUERY SELECT v_original.page_slug,
    COALESCE(v_restored.title, v_original.after_snapshot->>'title'),
    COALESCE(v_restored.version, -1), v_event_id;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.upsert_inbound_provider_contact(
  p_name TEXT,
  p_phone TEXT,
  p_requester_whatsapp TEXT,
  p_requester_name TEXT,
  p_twilio_message_sid TEXT
)
RETURNS TABLE (
  id UUID, title TEXT, subtitle TEXT, category TEXT, phone_number TEXT,
  website_url TEXT, map_url TEXT, image_url TEXT, created BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_contact public.contacts%ROWTYPE;
  v_created BOOLEAN := FALSE;
BEGIN
  SELECT contacts.* INTO v_contact FROM public.contacts AS contacts
  WHERE contacts.is_deleted = FALSE
    AND contacts.phone_normalized = public.normalize_contact_phone(p_phone)
  LIMIT 1;
  IF NOT FOUND THEN
    INSERT INTO public.contacts (title, subtitle, category, phone_number, is_deleted)
    VALUES (left(btrim(COALESCE(p_name, p_phone)), 160), '', 'Service', p_phone, FALSE)
    RETURNING * INTO v_contact;
    v_created := TRUE;
    INSERT INTO public.provider_change_events (
      contact_id, action_type, requester_whatsapp, requester_name,
      verification_method, twilio_message_sid, before_snapshot, after_snapshot
    ) VALUES (
      v_contact.id, 'provider_create', p_requester_whatsapp,
      NULLIF(btrim(COALESCE(p_requester_name, '')), ''), 'whatsapp_inbound',
      p_twilio_message_sid, NULL, to_jsonb(v_contact) - 'phone_normalized'
    ) ON CONFLICT (twilio_message_sid, contact_id, action_type)
      WHERE twilio_message_sid IS NOT NULL DO NOTHING;
  END IF;
  RETURN QUERY SELECT v_contact.id, v_contact.title, v_contact.subtitle,
    v_contact.category, v_contact.phone_number, v_contact.website_url,
    v_contact.map_url, v_contact.image_url, v_created;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_inbound_provider_contact(
  p_contact_id UUID,
  p_changes JSONB,
  p_requester_whatsapp TEXT,
  p_requester_name TEXT,
  p_twilio_message_sid TEXT
)
RETURNS TABLE (
  id UUID, title TEXT, subtitle TEXT, category TEXT, phone_number TEXT,
  website_url TEXT, map_url TEXT, image_url TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_before public.contacts%ROWTYPE;
  v_after public.contacts%ROWTYPE;
BEGIN
  IF jsonb_typeof(COALESCE(p_changes, '{}'::JSONB)) <> 'object'
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_changes) AS keys(key)
      WHERE keys.key NOT IN ('title', 'subtitle', 'category')) THEN
    RAISE EXCEPTION 'Invalid provider changes' USING ERRCODE = '22023';
  END IF;
  SELECT contacts.* INTO v_before FROM public.contacts AS contacts
  WHERE contacts.id = p_contact_id AND contacts.is_deleted = FALSE FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002'; END IF;
  UPDATE public.contacts AS contacts SET
    title = CASE WHEN p_changes ? 'title' THEN left(btrim(p_changes->>'title'), 160) ELSE contacts.title END,
    subtitle = CASE WHEN p_changes ? 'subtitle' THEN left(btrim(p_changes->>'subtitle'), 2000) ELSE contacts.subtitle END,
    category = CASE WHEN p_changes ? 'category' THEN left(btrim(p_changes->>'category'), 80) ELSE contacts.category END
  WHERE contacts.id = p_contact_id RETURNING contacts.* INTO v_after;
  IF to_jsonb(v_before) IS DISTINCT FROM to_jsonb(v_after) THEN
    INSERT INTO public.provider_change_events (
      contact_id, action_type, requester_whatsapp, requester_name,
      verification_method, twilio_message_sid, before_snapshot, after_snapshot
    ) VALUES (
      v_after.id, 'provider_update', p_requester_whatsapp,
      NULLIF(btrim(COALESCE(p_requester_name, '')), ''), 'whatsapp_inbound',
      p_twilio_message_sid, to_jsonb(v_before) - 'phone_normalized',
      to_jsonb(v_after) - 'phone_normalized'
    ) ON CONFLICT (twilio_message_sid, contact_id, action_type)
      WHERE twilio_message_sid IS NOT NULL DO NOTHING;
  END IF;
  RETURN QUERY SELECT v_after.id, v_after.title, v_after.subtitle, v_after.category,
    v_after.phone_number, v_after.website_url, v_after.map_url, v_after.image_url;
END;
$$;

ALTER TABLE public.community_verification_actions
  DROP CONSTRAINT IF EXISTS community_verification_actions_action_type_check;
ALTER TABLE public.community_verification_actions
  ADD CONSTRAINT community_verification_actions_action_type_check CHECK (action_type IN (
    'provider_create', 'provider_update', 'provider_delete', 'provider_review',
    'wiki_create', 'wiki_update', 'wiki_delete'
  ));

REVOKE ALL ON FUNCTION public.get_bot_wiki_session(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_bot_wiki_session(TEXT, JSONB, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clear_bot_wiki_session(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_audited_wiki_write(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.undo_last_inbound_wiki_change(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_verified_wiki_write(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_inbound_provider_contact(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_inbound_provider_contact(UUID, JSONB, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_bot_wiki_session(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_bot_wiki_session(TEXT, JSONB, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_bot_wiki_session(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_audited_wiki_write(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.undo_last_inbound_wiki_change(TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_verified_wiki_write(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_inbound_provider_contact(TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_inbound_provider_contact(UUID, JSONB, TEXT, TEXT, TEXT) TO service_role;

COMMENT ON TABLE public.wiki_change_events IS
  'Private immutable actor trail for current wiki mutations through Machu and verified web sessions.';
COMMENT ON TABLE public.bot_wiki_sessions IS
  'Short-lived wiki context keyed by a server HMAC; contains no WhatsApp numbers.';

NOTIFY pgrst, 'reload schema';
