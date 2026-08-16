import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;
const ACTION_SECRET_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const INBOUND_APPROVAL_PATTERN = /(?:^|\s)VERIFY\s+([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})(?:\s|$)/i;
const REVIEW_IMAGE_PATH_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|jpeg|png|webp)$/i;
const PROVIDER_IMAGE_PATH_PATTERN = /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|jpeg|png|webp)$/i;
const DELETION_REASONS = new Set(['outdated', 'duplicate', 'closed', 'incorrect', 'other']);
const PROVIDER_IMAGE_CHANGES = new Set(['none', 'keep', 'remove', 'replace']);
const PROVIDER_IMAGE_EXTENSIONS = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);
const PROVIDER_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const ACTION_TTL_MINUTES = 10;
const VERIFIED_SESSION_TTL_DAYS = 30;
const PHONE_ATTEMPTS_PER_HOUR = 5;
const IP_ATTEMPTS_PER_HOUR = 20;

export class VerificationHttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'VerificationHttpError';
    this.status = status;
  }
}

const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');
const randomToken = () => randomBytes(32).toString('base64url');
const compactText = (value, maxLength) => {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length > maxLength) throw new VerificationHttpError(400, 'One or more fields are too long.');
  return normalized;
};

const normalizeMultilineText = (value, maxLength) => {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new VerificationHttpError(400, 'Enter valid review details.');
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  if (normalized.length > maxLength) throw new VerificationHttpError(400, `Review must be ${maxLength} characters or fewer.`);
  return normalized || null;
};

const normalizeOptionalUrl = (value) => {
  const normalized = compactText(value ?? '', 2048);
  if (!normalized) return null;
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new VerificationHttpError(400, 'Enter valid provider links.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new VerificationHttpError(400, 'Provider links must use http or https.');
  }
  return parsed.toString();
};

export const normalizeE164 = (value) => {
  let normalized = String(value ?? '').trim().replace(/[\s().-]+/g, '');
  if (normalized.startsWith('00')) normalized = `+${normalized.slice(2)}`;
  if (!E164_PATTERN.test(normalized)) {
    throw new VerificationHttpError(400, 'Enter your WhatsApp number with country code, for example +506 8888 8888.');
  }
  return normalized;
};

const requireUuid = (value, message) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) throw new VerificationHttpError(400, message);
  return normalized;
};

const normalizeActionPayload = (actionType, payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new VerificationHttpError(400, 'Enter valid action details.');
  }

  if (actionType === 'provider_delete') {
    const providerId = requireUuid(payload.providerId, 'A valid provider is required.');
    const providerNameConfirmation = compactText(payload.providerNameConfirmation, 160);
    const reason = compactText(payload.reason, 32).toLowerCase();
    if (!providerNameConfirmation || !DELETION_REASONS.has(reason)) {
      throw new VerificationHttpError(400, 'Complete the provider removal details.');
    }
    return { providerId, providerNameConfirmation, reason };
  }

  if (actionType === 'provider_create' || actionType === 'provider_update') {
    const providerId = actionType === 'provider_update'
      ? requireUuid(payload.providerId, 'A valid provider is required.')
      : null;
    const name = compactText(payload.name, 160);
    const category = compactText(payload.category, 80);
    const description = normalizeMultilineText(payload.description, 2000);
    const providerPhone = normalizeE164(payload.providerPhone);
    const website = normalizeOptionalUrl(payload.website);
    const mapUrl = normalizeOptionalUrl(payload.mapUrl);
    const imageChange = compactText(payload.imageChange, 16).toLowerCase();
    const allowedImageChanges = actionType === 'provider_create'
      ? new Set(['none', 'replace'])
      : new Set(['keep', 'remove', 'replace']);
    if (!name || !category || !description || !PROVIDER_IMAGE_CHANGES.has(imageChange)
      || !allowedImageChanges.has(imageChange)) {
      throw new VerificationHttpError(400, 'Complete the provider details.');
    }
    return {
      ...(providerId ? { providerId } : {}),
      name,
      category,
      description,
      providerPhone,
      website,
      mapUrl,
      imageChange,
    };
  }

  if (actionType === 'provider_review') {
    const providerId = requireUuid(payload.providerId, 'A valid provider is required.');
    const rating = Number(payload.rating);
    const reviewerName = compactText(payload.reviewerName ?? '', 80) || null;
    const comment = normalizeMultilineText(payload.comment, 1000);
    const imageCount = Number(payload.imageCount ?? 0);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new VerificationHttpError(400, 'Choose a rating from 1 to 5 stars.');
    }
    if (!Number.isInteger(imageCount) || imageCount < 0 || imageCount > 4) {
      throw new VerificationHttpError(400, 'A review can include at most 4 images.');
    }
    return { providerId, rating, comment, reviewerName, imageCount };
  }

  throw new VerificationHttpError(400, 'Choose a valid verification action.');
};

const databaseError = (message, error) => {
  console.error(message, error);
  return new VerificationHttpError(500, message);
};

const firstRow = (data) => Array.isArray(data) ? data[0] : data;

export class CommunityVerificationService {
  constructor({ supabase, signingSecret, whatsappFrom }) {
    this.supabase = supabase;
    this.signingSecret = signingSecret;
    this.whatsappFrom = normalizeE164(String(whatsappFrom ?? '').replace(/^whatsapp:/i, ''));
  }

  approvalSignature(actionId) {
    return createHmac('sha256', this.signingSecret)
      .update(`whatsapp-approval:${actionId}`)
      .digest('base64url');
  }

  approvalToken(actionId) {
    return `${actionId}.${this.approvalSignature(actionId)}`;
  }

  approvalUrl(actionId) {
    const message = [
      'Hi Machu! Please verify my San Mateo Love request.',
      '',
      `VERIFY ${this.approvalToken(actionId)}`,
    ].join('\n');
    return `https://wa.me/${this.whatsappFrom.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
  }

  hasValidApprovalSignature(actionId, signature) {
    const expected = this.approvalSignature(actionId);
    const actualBytes = Buffer.from(String(signature));
    const expectedBytes = Buffer.from(expected);
    return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
  }

  ipHash(ip) {
    if (!ip) return null;
    return createHmac('sha256', this.signingSecret).update(String(ip)).digest('hex');
  }

  async assertRateLimit(phone, requestIpHash) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const phoneQuery = phone
      ? this.supabase
          .from('community_verification_actions')
          .select('id', { count: 'exact', head: true })
          .eq('requester_whatsapp', phone)
          .gte('created_at', oneHourAgo)
      : Promise.resolve({ count: 0, error: null });
    const ipQuery = requestIpHash
      ? this.supabase
          .from('community_verification_actions')
          .select('id', { count: 'exact', head: true })
          .eq('request_ip_hash', requestIpHash)
          .gte('created_at', oneHourAgo)
      : Promise.resolve({ count: 0, error: null });
    const [phoneResult, ipResult] = await Promise.all([phoneQuery, ipQuery]);
    if (phoneResult.error || ipResult.error) {
      throw databaseError('Verification is temporarily unavailable.', phoneResult.error || ipResult.error);
    }
    if ((phoneResult.count ?? 0) >= PHONE_ATTEMPTS_PER_HOUR || (ipResult.count ?? 0) >= IP_ATTEMPTS_PER_HOUR) {
      throw new VerificationHttpError(429, 'Too many verification requests were started. Please wait and try again later.');
    }
  }

  async start({ actionType, payload, requestIp, verifiedSession = null }) {
    const phone = verifiedSession?.verified_whatsapp
      ? normalizeE164(verifiedSession.verified_whatsapp)
      : null;
    const normalizedPayload = normalizeActionPayload(actionType, payload);
    const requestIpHash = this.ipHash(requestIp);
    await this.assertRateLimit(phone, requestIpHash);

    const clientSecret = randomToken();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + ACTION_TTL_MINUTES * 60 * 1000).toISOString();
    const usesTrustedSession = Boolean(verifiedSession?.verified_whatsapp);
    // Trusted actions are verified at creation. Keep both timestamps identical
    // so the database's verified_at >= created_at invariant cannot be broken by
    // clock skew between the application host and Postgres.
    const verifiedAt = usesTrustedSession ? createdAt.toISOString() : null;
    const { data: action, error: insertError } = await this.supabase
      .from('community_verification_actions')
      .insert({
        action_type: actionType,
        requester_whatsapp: phone,
        payload: normalizedPayload,
        verification_method: usesTrustedSession ? 'trusted_session' : 'whatsapp_inbound',
        client_secret_hash: sha256(clientSecret),
        request_ip_hash: requestIpHash,
        expires_at: expiresAt,
        status: usesTrustedSession ? 'verified' : 'pending',
        verified_at: verifiedAt,
        ...(usesTrustedSession ? { created_at: verifiedAt } : {}),
        trusted_session_id: usesTrustedSession ? verifiedSession.id : null,
      })
      .select('id, expires_at')
      .single();
    if (insertError || !action) throw databaseError('Verification is temporarily unavailable.', insertError);

    return {
      actionId: action.id,
      actionToken: clientSecret,
      expiresAt: action.expires_at,
      requiresWhatsappApproval: !usesTrustedSession,
      verificationMethod: usesTrustedSession ? 'trusted_session' : 'whatsapp_inbound',
      whatsappUrl: usesTrustedSession ? null : this.approvalUrl(action.id),
    };
  }

  async getVerifiedSession(sessionTokenInput) {
    const sessionToken = String(sessionTokenInput ?? '').trim();
    if (!ACTION_SECRET_PATTERN.test(sessionToken)) return null;

    const { data: session, error } = await this.supabase
      .from('community_verified_sessions')
      .select('id, verified_whatsapp, expires_at, revoked_at')
      .eq('token_hash', sha256(sessionToken))
      .maybeSingle();
    if (error) throw databaseError('Verified WhatsApp session is temporarily unavailable.', error);
    if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) return null;

    const { error: touchError } = await this.supabase
      .from('community_verified_sessions')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', session.id)
      .is('revoked_at', null);
    if (touchError) throw databaseError('Verified WhatsApp session is temporarily unavailable.', touchError);
    return session;
  }

  async createVerifiedSessionForAction({ actionId, actionToken }) {
    const action = await this.loadAction(actionId, actionToken);
    if (!['verified', 'completed'].includes(action.status)) {
      throw new VerificationHttpError(409, 'Approve this request with Machu before trusting this device.');
    }

    const sessionToken = randomToken();
    const expiresAt = new Date(
      Date.now() + VERIFIED_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { data: session, error } = await this.supabase
      .from('community_verified_sessions')
      .insert({
        token_hash: sha256(sessionToken),
        verified_whatsapp: action.requester_whatsapp,
        source_action_id: action.id,
        expires_at: expiresAt,
      })
      .select('id, verified_whatsapp, expires_at')
      .single();
    if (error || !session) throw databaseError('This device could not be remembered.', error);
    return { sessionToken, session };
  }

  async revokeVerifiedSession(sessionTokenInput) {
    const sessionToken = String(sessionTokenInput ?? '').trim();
    if (!ACTION_SECRET_PATTERN.test(sessionToken)) return;
    const { error } = await this.supabase
      .from('community_verified_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token_hash', sha256(sessionToken))
      .is('revoked_at', null);
    if (error) throw databaseError('This device could not be forgotten.', error);
  }

  publicSession(session) {
    if (!session) return { authenticated: false };
    return {
      authenticated: true,
      phoneEnding: String(session.verified_whatsapp).slice(-4),
      expiresAt: session.expires_at,
    };
  }

  async approveInbound({ body, senderPhone: senderPhoneInput }) {
    const match = String(body ?? '').match(INBOUND_APPROVAL_PATTERN);
    if (!match) return null;

    const actionId = match[1].toLowerCase();
    if (!UUID_PATTERN.test(actionId) || !this.hasValidApprovalSignature(actionId, match[2])) {
      return { approved: false, reason: 'invalid' };
    }

    let senderPhone = String(senderPhoneInput ?? '').trim().replace(/^whatsapp:/i, '');
    if (/^[1-9][0-9]{7,14}$/.test(senderPhone)) senderPhone = `+${senderPhone}`;
    try {
      senderPhone = normalizeE164(senderPhone);
    } catch {
      return { approved: false, reason: 'sender' };
    }

    const { data: action, error } = await this.supabase
      .from('community_verification_actions')
      .select('*')
      .eq('id', actionId)
      .maybeSingle();
    if (error) throw databaseError('WhatsApp approval is temporarily unavailable.', error);
    if (!action) return { approved: false, reason: 'invalid' };
    if (new Date(action.expires_at).getTime() <= Date.now()) {
      await this.supabase
        .from('community_verification_actions')
        .update({ status: 'expired' })
        .eq('id', action.id)
        .is('consumed_at', null);
      return { approved: false, reason: 'expired' };
    }
    if (action.requester_whatsapp && action.requester_whatsapp !== senderPhone) {
      return { approved: false, reason: 'phone' };
    }
    if (action.status === 'completed' || action.consumed_at) {
      if (!action.requester_whatsapp) return { approved: false, reason: 'unavailable' };
      return { approved: true, actionType: action.action_type, alreadyApproved: true };
    }
    if (action.status === 'verified') {
      if (!action.requester_whatsapp) return { approved: false, reason: 'unavailable' };
      return { approved: true, actionType: action.action_type, alreadyApproved: true };
    }
    if (action.status !== 'pending') return { approved: false, reason: 'unavailable' };

    if (!action.requester_whatsapp) {
      try {
        await this.assertRateLimit(senderPhone, null);
      } catch (rateLimitError) {
        if (rateLimitError instanceof VerificationHttpError && rateLimitError.status === 429) {
          return { approved: false, reason: 'rate_limit' };
        }
        throw rateLimitError;
      }
    }

    const verifiedAt = new Date().toISOString();
    let verificationUpdate = this.supabase
      .from('community_verification_actions')
      .update({
        status: 'verified',
        verified_at: verifiedAt,
        requester_whatsapp: senderPhone,
      })
      .eq('id', action.id)
      .eq('status', 'pending')
      .is('consumed_at', null);
    verificationUpdate = action.requester_whatsapp
      ? verificationUpdate.eq('requester_whatsapp', senderPhone)
      : verificationUpdate.is('requester_whatsapp', null);
    const { data: verified, error: updateError } = await verificationUpdate
      .select('action_type')
      .maybeSingle();
    if (updateError) throw databaseError('WhatsApp approval could not be completed.', updateError);
    if (!verified) return { approved: false, reason: 'unavailable' };
    return { approved: true, actionType: verified.action_type, alreadyApproved: false };
  }

  async loadAction(actionIdInput, actionTokenInput) {
    const actionId = requireUuid(actionIdInput, 'This verification request is invalid.');
    const actionToken = String(actionTokenInput ?? '').trim();
    if (!ACTION_SECRET_PATTERN.test(actionToken)) {
      throw new VerificationHttpError(400, 'This verification request is invalid.');
    }
    const { data: action, error } = await this.supabase
      .from('community_verification_actions')
      .select('*')
      .eq('id', actionId)
      .eq('client_secret_hash', sha256(actionToken))
      .maybeSingle();
    if (error) throw databaseError('Verification is temporarily unavailable.', error);
    if (!action) throw new VerificationHttpError(404, 'This verification request is invalid or expired.');
    if (new Date(action.expires_at).getTime() <= Date.now()) {
      await this.supabase
        .from('community_verification_actions')
        .update({ status: 'expired' })
        .eq('id', action.id)
        .is('consumed_at', null);
      throw new VerificationHttpError(410, 'This verification request has expired. Start a new one.');
    }
    return action;
  }

  async completeDeletion(action) {
    const undoToken = randomToken();
    const { data, error } = await this.supabase.rpc('complete_verified_provider_deletion', {
      p_action_id: action.id,
      p_undo_token_hash: sha256(undoToken),
    });
    if (error) {
      const message = error.message?.includes('name confirmation')
        ? 'The provider name does not match.'
        : error.message?.includes('already removed') || error.code === 'P0002'
          ? 'This provider is no longer available.'
          : 'We could not remove this provider right now.';
      throw new VerificationHttpError(error.code === 'P0002' ? 404 : 400, message);
    }
    const event = firstRow(data);
    if (!event?.event_id || !event?.undo_expires_at) {
      throw new VerificationHttpError(500, 'The provider was removed, but undo information is unavailable.');
    }
    return {
      status: 'approved',
      actionType: action.action_type,
      eventId: event.event_id,
      undoToken,
      undoExpiresAt: event.undo_expires_at,
    };
  }

  async completeProviderWrite({ actionId, actionToken, imagePath: imagePathInput = null }) {
    const action = await this.loadAction(actionId, actionToken);
    if (!['provider_create', 'provider_update'].includes(action.action_type)
      || action.status !== 'verified' || action.consumed_at) {
      throw new VerificationHttpError(409, 'This provider verification is not ready to complete.');
    }

    const imageChange = action.payload?.imageChange;
    const imagePath = imagePathInput == null ? null : String(imagePathInput).trim();
    if (imageChange === 'replace') {
      const match = imagePath?.match(PROVIDER_IMAGE_PATH_PATTERN);
      if (!match || match[1].toLowerCase() !== action.id.toLowerCase()) {
        throw new VerificationHttpError(400, 'The provider logo path is invalid.');
      }
    } else if (imagePath) {
      throw new VerificationHttpError(400, 'This provider action does not include a new logo.');
    }

    const imageUrl = imagePath
      ? this.supabase.storage.from('contact-images').getPublicUrl(imagePath).data.publicUrl
      : null;
    const { data, error } = await this.supabase.rpc('complete_verified_provider_write', {
      p_action_id: action.id,
      p_image_path: imagePath,
      p_image_url: imageUrl,
    });
    if (error) {
      console.error('Verified provider write completion failed:', error);
      if (imagePath) {
        try {
          await this.supabase.storage.from('contact-images').remove([imagePath]);
        } catch (cleanupError) {
          console.warn('Could not remove an uncommitted provider logo:', cleanupError);
        }
      }
      const notFound = error.code === 'P0002' || error.message?.includes('Provider not found');
      throw new VerificationHttpError(notFound ? 404 : 400, notFound
        ? 'This provider is no longer available.'
        : 'The provider could not be saved. Please check the details and try again.');
    }

    const provider = firstRow(data);
    if (!provider?.id) throw new VerificationHttpError(500, 'The provider could not be saved.');

    const previousImageUrl = provider.previous_image_url;
    if (previousImageUrl && previousImageUrl !== provider.image_url) {
      try {
        const marker = '/storage/v1/object/public/contact-images/';
        const markerIndex = previousImageUrl.indexOf(marker);
        if (markerIndex >= 0) {
          const previousPath = decodeURIComponent(previousImageUrl.slice(markerIndex + marker.length));
          if (/^(?:public\/)?[0-9a-f/-]+\.(?:jpg|jpeg|png|webp)$/i.test(previousPath)) {
            await this.supabase.storage.from('contact-images').remove([previousPath]);
          }
        }
      } catch (error) {
        console.warn('Could not remove the previous provider logo:', error);
      }
    }

    const { previous_image_url: _previousImageUrl, ...publicProvider } = provider;
    return { status: 'approved', actionType: action.action_type, provider: publicProvider };
  }

  async uploadProviderLogo({ actionId, actionToken, contentType, bytes }) {
    const action = await this.loadAction(actionId, actionToken);
    if (!['provider_create', 'provider_update'].includes(action.action_type)
      || action.status !== 'verified' || action.consumed_at
      || action.payload?.imageChange !== 'replace') {
      throw new VerificationHttpError(409, 'This provider verification does not allow a logo upload.');
    }
    const extension = PROVIDER_IMAGE_EXTENSIONS.get(String(contentType ?? '').toLowerCase());
    if (!extension) throw new VerificationHttpError(415, 'Logo must be a JPEG, PNG, or WebP image.');
    if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > PROVIDER_IMAGE_MAX_BYTES) {
      throw new VerificationHttpError(400, 'Logo must be a non-empty image no larger than 5 MB.');
    }

    const imagePath = `${action.id}/${randomUUID()}.${extension}`;
    const { error } = await this.supabase.storage.from('contact-images').upload(imagePath, bytes, {
      contentType,
      upsert: false,
    });
    if (error) {
      console.error('Verified provider logo upload failed:', error);
      throw new VerificationHttpError(500, 'The provider logo could not be uploaded. Please try again.');
    }
    return { imagePath };
  }

  async check({ actionId, actionToken }) {
    const action = await this.loadAction(actionId, actionToken);
    if (action.status === 'completed' || action.consumed_at) {
      throw new VerificationHttpError(409, 'This verified action was already completed.');
    }
    if (action.status !== 'verified') {
      throw new VerificationHttpError(409, 'Open WhatsApp and send the prefilled message to Machu first.');
    }

    if (action.action_type === 'provider_delete') return this.completeDeletion(action);
    if (action.action_type === 'provider_review' && Number(action.payload?.imageCount ?? 0) === 0) {
      return this.completeReview({ action, imagePaths: [] });
    }
    if (['provider_create', 'provider_update'].includes(action.action_type)) {
      return { status: 'approved', actionType: action.action_type, requiresCompletion: true };
    }
    return { status: 'approved', actionType: action.action_type, requiresCompletion: true };
  }

  async status({ actionId, actionToken }) {
    const action = await this.loadAction(actionId, actionToken);
    return {
      status: action.status === 'verified' || action.status === 'completed'
        ? action.status
        : 'waiting',
      expiresAt: action.expires_at,
    };
  }

  async completeReview({ action: providedAction, actionId, actionToken, imagePaths = [] }) {
    const action = providedAction ?? await this.loadAction(actionId, actionToken);
    if (action.action_type !== 'provider_review' || action.status !== 'verified' || action.consumed_at) {
      throw new VerificationHttpError(409, 'This review verification is not ready to complete.');
    }
    if (!Array.isArray(imagePaths) || imagePaths.some((path) => typeof path !== 'string' || !REVIEW_IMAGE_PATH_PATTERN.test(path))) {
      throw new VerificationHttpError(400, 'One or more review image paths are invalid.');
    }
    const { data, error } = await this.supabase.rpc('complete_verified_provider_review', {
      p_action_id: action.id,
      p_image_paths: imagePaths,
    });
    if (error) {
      console.error('Verified review completion failed:', error);
      throw new VerificationHttpError(400, 'Your review could not be saved. Please try again.');
    }
    const review = firstRow(data);
    if (!review?.id) throw new VerificationHttpError(500, 'Your review could not be saved.');
    return { status: 'approved', actionType: action.action_type, review };
  }
}

export const verificationJsonError = (error) => {
  if (error instanceof VerificationHttpError) return { status: error.status, message: error.message };
  console.error('Community verification error:', error);
  return { status: 500, message: 'Verification is temporarily unavailable. Please try again.' };
};
