-- Require an account-free WhatsApp step-up check for public provider creates
-- and edits. Browsers remain read-only on contacts; the application service
-- completes a short-lived, verified action atomically through this function.

ALTER TABLE public.community_verification_actions
  DROP CONSTRAINT IF EXISTS community_verification_actions_action_type_check;

ALTER TABLE public.community_verification_actions
  ADD CONSTRAINT community_verification_actions_action_type_check
  CHECK (action_type IN (
    'provider_create',
    'provider_update',
    'provider_delete',
    'provider_review'
  ));

DROP POLICY IF EXISTS "Public can add active contacts" ON public.contacts;
DROP POLICY IF EXISTS "Public can edit active contacts" ON public.contacts;

REVOKE INSERT (
  title,
  category,
  subtitle,
  phone_number,
  website_url,
  image_url,
  map_url
) ON public.contacts FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (
  title,
  category,
  subtitle,
  phone_number,
  website_url,
  image_url,
  map_url
) ON public.contacts FROM PUBLIC, anon, authenticated;

-- Logos are now uploaded and removed by the verification service. Remove old
-- bucket-specific browser mutation policies while leaving unrelated buckets
-- (including public review-image uploads) alone.
DO $$
DECLARE
  existing_policy RECORD;
BEGIN
  FOR existing_policy IN
    SELECT policies.policyname
    FROM pg_catalog.pg_policies AS policies
    WHERE policies.schemaname = 'storage'
      AND policies.tablename = 'objects'
      AND policies.cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      AND concat_ws(' ', policies.qual, policies.with_check) ILIKE '%contact-images%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', existing_policy.policyname);
  END LOOP;
END;
$$;

CREATE FUNCTION public.reject_anonymous_contact_image_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, storage, auth
AS $$
DECLARE
  v_bucket_id TEXT := CASE WHEN TG_OP = 'DELETE' THEN OLD.bucket_id ELSE NEW.bucket_id END;
BEGIN
  IF v_bucket_id = 'contact-images'
    AND auth.role() IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'Provider logos require a verified server action'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_anonymous_contact_image_mutation()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS reject_anonymous_contact_image_mutation
  ON storage.objects;
CREATE TRIGGER reject_anonymous_contact_image_mutation
BEFORE INSERT OR UPDATE OR DELETE ON storage.objects
FOR EACH ROW EXECUTE FUNCTION public.reject_anonymous_contact_image_mutation();

CREATE FUNCTION public.complete_verified_provider_write(
  p_action_id UUID,
  p_image_path TEXT DEFAULT NULL,
  p_image_url TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  subtitle TEXT,
  category TEXT,
  phone_number TEXT,
  website_url TEXT,
  map_url TEXT,
  image_url TEXT,
  previous_image_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, storage
AS $$
DECLARE
  v_action public.community_verification_actions%ROWTYPE;
  v_contact public.contacts%ROWTYPE;
  v_previous_image_url TEXT;
  v_image_change TEXT;
  v_next_image_url TEXT;
BEGIN
  SELECT actions.* INTO v_action
  FROM public.community_verification_actions AS actions
  WHERE actions.id = p_action_id
  FOR UPDATE;

  IF NOT FOUND OR v_action.action_type NOT IN ('provider_create', 'provider_update')
    OR v_action.status <> 'verified' OR v_action.consumed_at IS NOT NULL
    OR v_action.expires_at <= now() THEN
    RAISE EXCEPTION 'Verified provider action is unavailable' USING ERRCODE = '22023';
  END IF;

  v_image_change := v_action.payload->>'imageChange';
  IF v_image_change = 'replace' THEN
    IF p_image_path IS NULL
      OR p_image_path !~ (
        '^' || v_action.id::TEXT
        || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
        || '\.(jpg|jpeg|png|webp)$'
      )
      OR p_image_url IS NULL
      OR p_image_url !~ (
        '^https?://[^[:space:]]+/storage/v1/object/public/contact-images/'
        || replace(replace(p_image_path, '.', '\.'), '/', '\/')
        || '$'
      ) THEN
      RAISE EXCEPTION 'A verified provider logo is required' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM storage.objects AS objects
      WHERE objects.bucket_id = 'contact-images' AND objects.name = p_image_path
    ) THEN
      RAISE EXCEPTION 'The verified provider logo was not uploaded' USING ERRCODE = '22023';
    END IF;
    v_next_image_url := p_image_url;
  ELSIF p_image_path IS NOT NULL OR p_image_url IS NOT NULL THEN
    RAISE EXCEPTION 'This provider action does not allow a new logo' USING ERRCODE = '22023';
  END IF;

  IF v_action.action_type = 'provider_create' THEN
    IF v_image_change IS NULL OR v_image_change NOT IN ('none', 'replace') THEN
      RAISE EXCEPTION 'Invalid provider image action' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.contacts AS contacts (
      title,
      category,
      subtitle,
      phone_number,
      website_url,
      map_url,
      image_url,
      is_deleted
    ) VALUES (
      v_action.payload->>'name',
      v_action.payload->>'category',
      v_action.payload->>'description',
      v_action.payload->>'providerPhone',
      NULLIF(v_action.payload->>'website', ''),
      NULLIF(v_action.payload->>'mapUrl', ''),
      v_next_image_url,
      FALSE
    )
    RETURNING contacts.* INTO v_contact;
  ELSE
    IF v_image_change IS NULL OR v_image_change NOT IN ('keep', 'remove', 'replace') THEN
      RAISE EXCEPTION 'Invalid provider image action' USING ERRCODE = '22023';
    END IF;

    SELECT contacts.* INTO v_contact
    FROM public.contacts AS contacts
    WHERE contacts.id = (v_action.payload->>'providerId')::UUID
      AND contacts.is_deleted = FALSE
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
    END IF;

    v_previous_image_url := v_contact.image_url;
    IF v_image_change = 'keep' THEN
      v_next_image_url := v_contact.image_url;
    ELSIF v_image_change = 'remove' THEN
      v_next_image_url := NULL;
    END IF;

    UPDATE public.contacts AS contacts
    SET
      title = v_action.payload->>'name',
      category = v_action.payload->>'category',
      subtitle = v_action.payload->>'description',
      phone_number = v_action.payload->>'providerPhone',
      website_url = NULLIF(v_action.payload->>'website', ''),
      map_url = NULLIF(v_action.payload->>'mapUrl', ''),
      image_url = v_next_image_url
    WHERE contacts.id = v_contact.id
    RETURNING contacts.* INTO v_contact;
  END IF;

  UPDATE public.community_verification_actions AS actions
  SET status = 'completed', consumed_at = now(), result_id = v_contact.id
  WHERE actions.id = v_action.id;

  RETURN QUERY SELECT
    v_contact.id,
    v_contact.title,
    v_contact.subtitle,
    v_contact.category,
    v_contact.phone_number,
    v_contact.website_url,
    v_contact.map_url,
    v_contact.image_url,
    v_previous_image_url;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_verified_provider_write(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_verified_provider_write(UUID, TEXT, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.complete_verified_provider_write(UUID, TEXT, TEXT) IS
  'Atomically creates or updates a provider from an unconsumed WhatsApp-verified action.';
