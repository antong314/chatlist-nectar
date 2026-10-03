-- Machu group digest: a read-only WhatsApp listener records messages from
-- groups an administrator has enabled, and a daily server job turns useful
-- provider recommendations and local knowledge into audited directory and wiki
-- changes. Raw messages are private, short-lived, and never exposed publicly.

-- ---------------------------------------------------------------------------
-- Listener login role and private whatsmeow session schema
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'machu_listener') THEN
    -- The password is set out of band; it never appears in a migration.
    CREATE ROLE machu_listener LOGIN NOINHERIT;
  END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS whatsmeow;
REVOKE ALL ON SCHEMA whatsmeow FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA whatsmeow TO machu_listener;
GRANT USAGE ON SCHEMA public TO machu_listener;

COMMENT ON SCHEMA whatsmeow IS
  'Private WhatsApp linked-device session for the Machu group listener. Not exposed through the Data API.';

-- ---------------------------------------------------------------------------
-- Groups, raw messages, and listener health
-- ---------------------------------------------------------------------------

CREATE TABLE public.whatsapp_groups (
  jid TEXT PRIMARY KEY CHECK (jid ~ '^[0-9-]{5,64}@g\.us$'),
  ref INTEGER GENERATED ALWAYS AS IDENTITY UNIQUE,
  name TEXT CHECK (name IS NULL OR char_length(name) <= 200),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  -- Receipt-time watermark: messages delivered late (offline queue or history
  -- sync) are still digested even when their sent_at is older.
  processed_through TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  enabled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.group_messages (
  group_jid TEXT NOT NULL REFERENCES public.whatsapp_groups(jid) ON DELETE CASCADE,
  message_id TEXT NOT NULL CHECK (char_length(message_id) BETWEEN 1 AND 128),
  sender_hash TEXT NOT NULL CHECK (sender_hash ~ '^[0-9a-f]{64}$'),
  sender_name TEXT CHECK (sender_name IS NULL OR char_length(sender_name) <= 100),
  sent_at TIMESTAMPTZ NOT NULL,
  body TEXT NOT NULL DEFAULT '' CHECK (char_length(body) <= 8000),
  contacts JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(contacts) = 'array'),
  quoted_message_id TEXT CHECK (quoted_message_id IS NULL OR char_length(quoted_message_id) <= 128),
  edited_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_jid, message_id)
);

CREATE INDEX group_messages_group_sent_idx ON public.group_messages (group_jid, sent_at);
CREATE INDEX group_messages_group_received_idx ON public.group_messages (group_jid, received_at);
CREATE INDEX group_messages_received_idx ON public.group_messages (received_at);

CREATE TABLE public.whatsapp_listener_status (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  status TEXT NOT NULL CHECK (status IN (
    'starting', 'awaiting_login', 'connected', 'disconnected', 'logged_out'
  )),
  account_phone TEXT CHECK (account_phone IS NULL OR account_phone ~ '^\+[1-9][0-9]{7,14}$'),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Digest runs, decisions, and administrator conversation state
-- ---------------------------------------------------------------------------

CREATE TABLE public.group_digest_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date DATE NOT NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('schedule', 'manual')),
  mode TEXT NOT NULL CHECK (mode IN ('shadow', 'publish')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  stats JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(stats) = 'object'),
  error TEXT,
  summary_sent_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX group_digest_runs_one_scheduled_per_day_idx
  ON public.group_digest_runs (run_date)
  WHERE trigger = 'schedule' AND status IN ('running', 'completed');
CREATE INDEX group_digest_runs_started_idx ON public.group_digest_runs (started_at DESC);

CREATE TABLE public.group_digest_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  run_id UUID NOT NULL REFERENCES public.group_digest_runs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('contact', 'wiki')),
  action TEXT CHECK (action IS NULL OR action IN (
    'contact_create', 'contact_enrich', 'wiki_update', 'wiki_create'
  )),
  status TEXT NOT NULL CHECK (status IN (
    'applied', 'proposed', 'needs_review', 'skipped', 'undone', 'failed'
  )),
  reason TEXT CHECK (reason IS NULL OR char_length(reason) <= 300),
  confidence NUMERIC(3, 2) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  detail TEXT CHECK (detail IS NULL OR char_length(detail) <= 500),
  payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(payload) = 'object'),
  evidence JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(evidence) = 'array'),
  contact_id UUID REFERENCES public.contacts(id) ON DELETE RESTRICT,
  wiki_page_slug TEXT,
  wiki_event_id UUID REFERENCES public.wiki_change_events(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by TEXT CHECK (decided_by IS NULL OR decided_by ~ '^\+[1-9][0-9]{7,14}$')
);

CREATE INDEX group_digest_items_run_idx ON public.group_digest_items (run_id, ref);
CREATE INDEX group_digest_items_status_idx ON public.group_digest_items (status, created_at DESC);

CREATE TABLE public.group_digest_admin_state (
  admin_whatsapp TEXT PRIMARY KEY CHECK (admin_whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  last_inbound_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_listener_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_digest_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_digest_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_digest_admin_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.whatsapp_groups FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.group_messages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.whatsapp_listener_status FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.group_digest_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.group_digest_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.group_digest_admin_state FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.whatsapp_groups TO service_role;
GRANT ALL ON TABLE public.group_messages TO service_role;
GRANT ALL ON TABLE public.whatsapp_listener_status TO service_role;
GRANT ALL ON TABLE public.group_digest_runs TO service_role;
GRANT ALL ON TABLE public.group_digest_items TO service_role;
GRANT ALL ON TABLE public.group_digest_admin_state TO service_role;

-- ---------------------------------------------------------------------------
-- Listener write functions (the listener role can call only these)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_whatsapp_group(p_group_jid TEXT, p_group_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_enabled BOOLEAN;
BEGIN
  INSERT INTO public.whatsapp_groups AS groups (jid, name)
  VALUES (p_group_jid, NULLIF(left(btrim(COALESCE(p_group_name, '')), 200), ''))
  ON CONFLICT (jid) DO UPDATE SET
    name = COALESCE(EXCLUDED.name, groups.name),
    updated_at = CASE WHEN EXCLUDED.name IS DISTINCT FROM groups.name
      AND EXCLUDED.name IS NOT NULL THEN now() ELSE groups.updated_at END
  RETURNING groups.enabled INTO v_enabled;
  RETURN v_enabled;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_group_message(
  p_group_jid TEXT,
  p_group_name TEXT,
  p_message_id TEXT,
  p_sender_hash TEXT,
  p_sender_name TEXT,
  p_sent_at TIMESTAMPTZ,
  p_body TEXT,
  p_contacts JSONB,
  p_quoted_message_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_enabled BOOLEAN;
  v_inserted INTEGER;
BEGIN
  v_enabled := public.upsert_whatsapp_group(p_group_jid, p_group_name);
  IF NOT v_enabled THEN
    RETURN FALSE;
  END IF;
  INSERT INTO public.group_messages (
    group_jid, message_id, sender_hash, sender_name, sent_at, body, contacts, quoted_message_id
  ) VALUES (
    p_group_jid,
    p_message_id,
    p_sender_hash,
    NULLIF(left(btrim(COALESCE(p_sender_name, '')), 100), ''),
    COALESCE(p_sent_at, now()),
    left(COALESCE(p_body, ''), 8000),
    COALESCE(p_contacts, '[]'::JSONB),
    NULLIF(btrim(COALESCE(p_quoted_message_id, '')), '')
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

CREATE OR REPLACE FUNCTION public.edit_group_message(
  p_group_jid TEXT,
  p_message_id TEXT,
  p_body TEXT
)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  UPDATE public.group_messages
  SET body = left(COALESCE(p_body, ''), 8000), edited_at = now()
  WHERE group_jid = p_group_jid AND message_id = p_message_id;
$$;

CREATE OR REPLACE FUNCTION public.revoke_group_message(p_group_jid TEXT, p_message_id TEXT)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  DELETE FROM public.group_messages
  WHERE group_jid = p_group_jid AND message_id = p_message_id;
$$;

CREATE OR REPLACE FUNCTION public.record_listener_status(p_status TEXT, p_account_phone TEXT)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  INSERT INTO public.whatsapp_listener_status AS listener (id, status, account_phone, last_seen_at, updated_at)
  VALUES (1, p_status, NULLIF(btrim(COALESCE(p_account_phone, '')), ''), now(), now())
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    account_phone = COALESCE(EXCLUDED.account_phone, listener.account_phone),
    last_seen_at = now(),
    updated_at = CASE WHEN listener.status IS DISTINCT FROM EXCLUDED.status
      THEN now() ELSE listener.updated_at END;
$$;

-- ---------------------------------------------------------------------------
-- Digest run claiming and raw-message retention (server only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_group_digest_run(
  p_run_date DATE,
  p_trigger TEXT,
  p_mode TEXT
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_run_id UUID;
BEGIN
  IF p_trigger NOT IN ('schedule', 'manual') OR p_mode NOT IN ('shadow', 'publish') THEN
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

  INSERT INTO public.group_digest_runs (run_date, trigger, mode)
  VALUES (p_run_date, p_trigger, p_mode)
  RETURNING id INTO v_run_id;
  RETURN v_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_group_messages(p_retention_days INTEGER DEFAULT 14)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.group_messages
  WHERE received_at < now() - make_interval(days => LEAST(GREATEST(COALESCE(p_retention_days, 14), 1), 90));
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- ---------------------------------------------------------------------------
-- Audit trail: group_digest is a distinct, attributable source
-- ---------------------------------------------------------------------------

ALTER TABLE public.provider_change_events
  DROP CONSTRAINT IF EXISTS provider_change_events_verification_method_check;
ALTER TABLE public.provider_change_events
  ADD CONSTRAINT provider_change_events_verification_method_check CHECK (verification_method IN (
    'whatsapp_otp', 'whatsapp_inbound', 'trusted_session', 'group_digest'
  ));

ALTER TABLE public.wiki_change_events
  DROP CONSTRAINT IF EXISTS wiki_change_events_verification_method_check;
ALTER TABLE public.wiki_change_events
  ADD CONSTRAINT wiki_change_events_verification_method_check CHECK (verification_method IN (
    'whatsapp_inbound', 'trusted_session', 'group_digest'
  ));

-- Wiki writes accept the group_digest source (otherwise identical to 20260830202600).
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
    OR p_verification_method NOT IN ('whatsapp_inbound', 'trusted_session', 'group_digest')
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

-- Inbound provider writes gain an explicit source so digest changes are not
-- recorded as direct WhatsApp messages. Existing callers keep the default.
DROP FUNCTION IF EXISTS public.upsert_inbound_provider_contact(TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.update_inbound_provider_contact(UUID, JSONB, TEXT, TEXT, TEXT);

CREATE FUNCTION public.upsert_inbound_provider_contact(
  p_name TEXT,
  p_phone TEXT,
  p_requester_whatsapp TEXT,
  p_requester_name TEXT,
  p_twilio_message_sid TEXT,
  p_verification_method TEXT DEFAULT 'whatsapp_inbound'
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
  IF COALESCE(p_verification_method, '') NOT IN ('whatsapp_inbound', 'group_digest') THEN
    RAISE EXCEPTION 'Invalid provider source' USING ERRCODE = '22023';
  END IF;
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
      NULLIF(btrim(COALESCE(p_requester_name, '')), ''), p_verification_method,
      p_twilio_message_sid, NULL, to_jsonb(v_contact) - 'phone_normalized'
    ) ON CONFLICT (twilio_message_sid, contact_id, action_type)
      WHERE twilio_message_sid IS NOT NULL DO NOTHING;
  END IF;
  RETURN QUERY SELECT v_contact.id, v_contact.title, v_contact.subtitle,
    v_contact.category, v_contact.phone_number, v_contact.website_url,
    v_contact.map_url, v_contact.image_url, v_created;
END;
$$;

CREATE FUNCTION public.update_inbound_provider_contact(
  p_contact_id UUID,
  p_changes JSONB,
  p_requester_whatsapp TEXT,
  p_requester_name TEXT,
  p_twilio_message_sid TEXT,
  p_verification_method TEXT DEFAULT 'whatsapp_inbound'
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
  IF COALESCE(p_verification_method, '') NOT IN ('whatsapp_inbound', 'group_digest') THEN
    RAISE EXCEPTION 'Invalid provider source' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(COALESCE(p_changes, '{}'::JSONB)) <> 'object'
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_changes) AS keys(key)
      WHERE keys.key NOT IN ('title', 'subtitle', 'category', 'website_url')) THEN
    RAISE EXCEPTION 'Invalid provider changes' USING ERRCODE = '22023';
  END IF;
  IF p_changes ? 'website_url' AND NULLIF(btrim(p_changes->>'website_url'), '') IS NOT NULL
    AND (length(p_changes->>'website_url') > 500 OR btrim(p_changes->>'website_url') ~ '\s') THEN
    RAISE EXCEPTION 'Invalid provider website' USING ERRCODE = '22023';
  END IF;
  SELECT contacts.* INTO v_before FROM public.contacts AS contacts
  WHERE contacts.id = p_contact_id AND contacts.is_deleted = FALSE FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002'; END IF;
  UPDATE public.contacts AS contacts SET
    title = CASE WHEN p_changes ? 'title' THEN left(btrim(p_changes->>'title'), 160) ELSE contacts.title END,
    subtitle = CASE WHEN p_changes ? 'subtitle' THEN left(btrim(p_changes->>'subtitle'), 2000) ELSE contacts.subtitle END,
    category = CASE WHEN p_changes ? 'category' THEN left(btrim(p_changes->>'category'), 80) ELSE contacts.category END,
    website_url = CASE WHEN p_changes ? 'website_url'
      THEN NULLIF(btrim(p_changes->>'website_url'), '') ELSE contacts.website_url END
  WHERE contacts.id = p_contact_id RETURNING contacts.* INTO v_after;
  IF to_jsonb(v_before) IS DISTINCT FROM to_jsonb(v_after) THEN
    INSERT INTO public.provider_change_events (
      contact_id, action_type, requester_whatsapp, requester_name,
      verification_method, twilio_message_sid, before_snapshot, after_snapshot
    ) VALUES (
      v_after.id, 'provider_update', p_requester_whatsapp,
      NULLIF(btrim(COALESCE(p_requester_name, '')), ''), p_verification_method,
      p_twilio_message_sid, to_jsonb(v_before) - 'phone_normalized',
      to_jsonb(v_after) - 'phone_normalized'
    ) ON CONFLICT (twilio_message_sid, contact_id, action_type)
      WHERE twilio_message_sid IS NOT NULL DO NOTHING;
  END IF;
  RETURN QUERY SELECT v_after.id, v_after.title, v_after.subtitle, v_after.category,
    v_after.phone_number, v_after.website_url, v_after.map_url, v_after.image_url;
END;
$$;

-- ---------------------------------------------------------------------------
-- Undo one specific wiki change event (used by digest undo; the existing
-- "undo my last change" flow for neighbors is unchanged)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.undo_wiki_change_event(
  p_event_id UUID,
  p_requester_whatsapp TEXT,
  p_requester_name TEXT,
  p_request_key TEXT
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
    OR NULLIF(btrim(COALESCE(p_request_key, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Invalid wiki undo request' USING ERRCODE = '22023';
  END IF;

  SELECT events.* INTO v_existing
  FROM public.wiki_change_events AS events
  WHERE events.twilio_message_sid = p_request_key
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
  WHERE events.id = p_event_id
    AND events.action_type IN ('wiki_create', 'wiki_update')
    AND events.reverted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wiki change cannot be undone' USING ERRCODE = 'P0002'; END IF;

  SELECT pages.* INTO v_current FROM public.wiki_pages AS pages
  WHERE pages.slug = v_original.page_slug AND pages.is_published = TRUE
  LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR v_current.version <> (v_original.after_snapshot->>'version')::INTEGER THEN
    RAISE EXCEPTION 'Wiki page changed after this edit' USING ERRCODE = '40001';
  END IF;

  v_before := jsonb_build_object('id', v_current.id, 'slug', v_current.slug,
    'title', v_current.title, 'content', v_current.content, 'excerpt', v_current.excerpt,
    'category', v_current.category, 'version', v_current.version,
    'created_at', v_current.created_at, 'updated_at', v_current.updated_at);
  UPDATE public.wiki_pages AS pages SET is_published = FALSE
  WHERE pages.id = v_current.id AND pages.version = v_current.version;

  IF v_original.action_type = 'wiki_create' THEN
    v_restored := v_current;
    v_after := NULL;
  ELSE
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
    v_original.page_id, v_original.page_slug, 'wiki_restore',
    btrim(p_requester_whatsapp), NULLIF(btrim(COALESCE(p_requester_name, '')), ''),
    v_original.verification_method, p_request_key, v_before, v_after
  ) RETURNING wiki_change_events.id INTO v_event_id;
  UPDATE public.wiki_change_events SET reverted_at = now(), reverted_by_event_id = v_event_id
  WHERE wiki_change_events.id = v_original.id;

  RETURN QUERY SELECT v_original.page_slug,
    COALESCE(v_restored.title, v_original.after_snapshot->>'title'),
    COALESCE(v_restored.version::INTEGER, -1), v_event_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Undo one applied digest item atomically
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.undo_group_digest_item(
  p_item_id UUID,
  p_requester_whatsapp TEXT
)
RETURNS TABLE (ref BIGINT, kind TEXT, action TEXT, title TEXT, status TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_item public.group_digest_items%ROWTYPE;
  v_before public.contacts%ROWTYPE;
  v_after public.contacts%ROWTYPE;
  v_request_key TEXT := 'digest-undo:' || p_item_id::TEXT;
  v_apply_key TEXT := 'digest:' || p_item_id::TEXT;
  v_phone TEXT := btrim(COALESCE(p_requester_whatsapp, ''));
BEGIN
  IF v_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'Invalid digest undo request' USING ERRCODE = '22023';
  END IF;

  SELECT items.* INTO v_item FROM public.group_digest_items AS items
  WHERE items.id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Digest item not found' USING ERRCODE = 'P0002'; END IF;
  IF v_item.status = 'undone' THEN
    RETURN QUERY SELECT v_item.ref, v_item.kind, v_item.action, v_item.title, v_item.status;
    RETURN;
  END IF;
  IF v_item.status <> 'applied' THEN
    RAISE EXCEPTION 'Only applied digest items can be undone' USING ERRCODE = 'P0001';
  END IF;

  IF v_item.action IN ('contact_create', 'contact_enrich') THEN
    SELECT contacts.* INTO v_before FROM public.contacts AS contacts
    WHERE contacts.id = v_item.contact_id AND contacts.is_deleted = FALSE FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002'; END IF;
    IF EXISTS (
      SELECT 1 FROM public.provider_change_events AS events
      WHERE events.contact_id = v_item.contact_id
        AND events.changed_at > v_item.decided_at
        AND events.twilio_message_sid IS DISTINCT FROM v_apply_key
    ) OR EXISTS (
      SELECT 1 FROM public.provider_deletion_events AS deletions
      WHERE deletions.contact_id = v_item.contact_id
        AND deletions.deleted_at > v_item.decided_at
    ) THEN
      RAISE EXCEPTION 'Provider changed after the digest' USING ERRCODE = '40001';
    END IF;

    IF v_item.action = 'contact_create' THEN
      UPDATE public.contacts AS contacts SET is_deleted = TRUE
      WHERE contacts.id = v_item.contact_id RETURNING contacts.* INTO v_after;
    ELSE
      UPDATE public.contacts AS contacts SET
        subtitle = COALESCE(v_item.payload #>> '{before,subtitle}', contacts.subtitle),
        category = COALESCE(v_item.payload #>> '{before,category}', contacts.category),
        website_url = CASE WHEN v_item.payload->'before' ? 'website_url'
          THEN v_item.payload #>> '{before,website_url}' ELSE contacts.website_url END
      WHERE contacts.id = v_item.contact_id RETURNING contacts.* INTO v_after;
    END IF;

    INSERT INTO public.provider_change_events (
      contact_id, action_type, requester_whatsapp, requester_name,
      verification_method, twilio_message_sid, before_snapshot, after_snapshot
    ) VALUES (
      v_item.contact_id, 'provider_update', v_phone, 'Machu digest undo',
      'group_digest', v_request_key, to_jsonb(v_before) - 'phone_normalized',
      to_jsonb(v_after) - 'phone_normalized'
    ) ON CONFLICT (twilio_message_sid, contact_id, action_type)
      WHERE twilio_message_sid IS NOT NULL DO NOTHING;
  ELSIF v_item.action IN ('wiki_update', 'wiki_create') THEN
    PERFORM 1 FROM public.undo_wiki_change_event(
      v_item.wiki_event_id, v_phone, 'Machu digest undo', v_request_key
    );
  ELSE
    RAISE EXCEPTION 'Digest item cannot be undone' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.group_digest_items AS items
  SET status = 'undone', decided_at = now(), decided_by = v_phone
  WHERE items.id = v_item.id;

  RETURN QUERY SELECT v_item.ref, v_item.kind, v_item.action, v_item.title, 'undone'::TEXT;
END;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.upsert_whatsapp_group(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_group_message(TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.edit_group_message(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_group_message(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_listener_status(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_group_digest_run(DATE, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_group_messages(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_inbound_provider_contact(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_inbound_provider_contact(UUID, JSONB, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.undo_wiki_change_event(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.undo_group_digest_item(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_audited_wiki_write(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_whatsapp_group(TEXT, TEXT) TO machu_listener, service_role;
GRANT EXECUTE ON FUNCTION public.record_group_message(TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, JSONB, TEXT) TO machu_listener, service_role;
GRANT EXECUTE ON FUNCTION public.edit_group_message(TEXT, TEXT, TEXT) TO machu_listener, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_group_message(TEXT, TEXT) TO machu_listener, service_role;
GRANT EXECUTE ON FUNCTION public.record_listener_status(TEXT, TEXT) TO machu_listener, service_role;
GRANT EXECUTE ON FUNCTION public.claim_group_digest_run(DATE, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_group_messages(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_inbound_provider_contact(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_inbound_provider_contact(UUID, JSONB, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.undo_wiki_change_event(UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.undo_group_digest_item(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_audited_wiki_write(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, UUID, TEXT) TO service_role;

COMMENT ON TABLE public.whatsapp_groups IS
  'WhatsApp groups the Machu listener belongs to. Messages are recorded only after an administrator enables a group.';
COMMENT ON TABLE public.group_messages IS
  'Private, short-lived raw group messages for the daily digest. Sender identity is an HMAC; rows are purged after the retention window.';
COMMENT ON TABLE public.group_digest_items IS
  'Private ledger of every digest decision, its evidence, and the resulting directory or wiki change.';

NOTIFY pgrst, 'reload schema';
