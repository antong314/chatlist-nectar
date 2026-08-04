import { createHash, createHmac, randomBytes } from 'node:crypto';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;
const ACTION_SECRET_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const CODE_PATTERN = /^[0-9]{4,10}$/;
const REVIEW_IMAGE_PATH_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|jpeg|png|webp)$/i;
const DELETION_REASONS = new Set(['outdated', 'duplicate', 'closed', 'incorrect', 'other']);
const ACTION_TTL_MINUTES = 10;
const PHONE_ATTEMPTS_PER_HOUR = 5;
const IP_ATTEMPTS_PER_HOUR = 20;
const MAX_CODE_CHECKS = 5;

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
  constructor({ supabase, twilioClient, verifyServiceSid, signingSecret }) {
    this.supabase = supabase;
    this.twilioClient = twilioClient;
    this.verifyServiceSid = verifyServiceSid;
    this.signingSecret = signingSecret;
  }

  ipHash(ip) {
    if (!ip) return null;
    return createHmac('sha256', this.signingSecret).update(String(ip)).digest('hex');
  }

  async assertRateLimit(phone, requestIpHash) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const phoneQuery = this.supabase
      .from('community_verification_actions')
      .select('id', { count: 'exact', head: true })
      .eq('requester_whatsapp', phone)
      .gte('created_at', oneHourAgo);
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
      throw new VerificationHttpError(429, 'Too many codes were requested. Please wait and try again later.');
    }
  }

  async start({ actionType, phone: phoneInput, payload, requestIp }) {
    const phone = normalizeE164(phoneInput);
    const normalizedPayload = normalizeActionPayload(actionType, payload);
    const requestIpHash = this.ipHash(requestIp);
    await this.assertRateLimit(phone, requestIpHash);

    const clientSecret = randomToken();
    const expiresAt = new Date(Date.now() + ACTION_TTL_MINUTES * 60 * 1000).toISOString();
    const { data: action, error: insertError } = await this.supabase
      .from('community_verification_actions')
      .insert({
        action_type: actionType,
        requester_whatsapp: phone,
        payload: normalizedPayload,
        client_secret_hash: sha256(clientSecret),
        request_ip_hash: requestIpHash,
        expires_at: expiresAt,
      })
      .select('id, expires_at')
      .single();
    if (insertError || !action) throw databaseError('Verification is temporarily unavailable.', insertError);

    try {
      const verification = await this.twilioClient.verify.v2
        .services(this.verifyServiceSid)
        .verifications.create({
          to: phone,
          channel: 'whatsapp',
          customFriendlyName: 'Machu',
        });
      const { error: updateError } = await this.supabase
        .from('community_verification_actions')
        .update({ status: 'sent', twilio_verification_sid: verification.sid })
        .eq('id', action.id)
        .eq('status', 'pending');
      if (updateError) throw updateError;
    } catch (error) {
      await this.supabase
        .from('community_verification_actions')
        .update({ status: 'failed' })
        .eq('id', action.id);
      console.error('Twilio Verify start failed:', error);
      throw new VerificationHttpError(502, 'WhatsApp could not deliver a code right now. Please try again shortly.');
    }

    return {
      actionId: action.id,
      actionToken: clientSecret,
      expiresAt: action.expires_at,
      phone,
    };
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
      throw new VerificationHttpError(410, 'This code has expired. Request a new one.');
    }
    return action;
  }

  async markVerified(action) {
    const verifiedAt = new Date().toISOString();
    const { data, error } = await this.supabase
      .from('community_verification_actions')
      .update({ status: 'verified', verified_at: verifiedAt })
      .eq('id', action.id)
      .in('status', ['sent', 'verified'])
      .is('consumed_at', null)
      .select('*')
      .single();
    if (error || !data) throw databaseError('Verification could not be completed.', error);
    return data;
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

  async check({ actionId, actionToken, code: codeInput }) {
    let action = await this.loadAction(actionId, actionToken);
    if (action.status === 'completed' || action.consumed_at) {
      throw new VerificationHttpError(409, 'This verified action was already completed.');
    }
    if (!['sent', 'verified'].includes(action.status)) {
      throw new VerificationHttpError(409, 'Request a new WhatsApp code.');
    }

    if (action.status !== 'verified') {
      const code = String(codeInput ?? '').trim();
      if (!CODE_PATTERN.test(code)) throw new VerificationHttpError(400, 'Enter the numeric code sent to WhatsApp.');
      if (action.check_attempts >= MAX_CODE_CHECKS) {
        throw new VerificationHttpError(429, 'Too many incorrect codes. Request a new one.');
      }
      await this.supabase
        .from('community_verification_actions')
        .update({ check_attempts: action.check_attempts + 1 })
        .eq('id', action.id);

      let check;
      try {
        check = await this.twilioClient.verify.v2
          .services(this.verifyServiceSid)
          .verificationChecks.create({ to: action.requester_whatsapp, code });
      } catch (error) {
        console.error('Twilio Verify check failed:', error);
        throw new VerificationHttpError(400, 'That code is incorrect or expired. Please try again.');
      }
      if (check.status !== 'approved') {
        throw new VerificationHttpError(400, 'That code is incorrect or expired. Please try again.');
      }
      action = await this.markVerified(action);
    }

    if (action.action_type === 'provider_delete') return this.completeDeletion(action);
    if (action.action_type === 'provider_review' && Number(action.payload?.imageCount ?? 0) === 0) {
      return this.completeReview({ action, imagePaths: [] });
    }
    return { status: 'approved', actionType: action.action_type, requiresCompletion: true };
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
