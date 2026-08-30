-- The legacy wiki stores serialized BlockNote JSON as a JSONB string scalar.
-- Recreate the two wiki mutation functions with explicit conversions so their
-- writes and return types match that established representation.

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
