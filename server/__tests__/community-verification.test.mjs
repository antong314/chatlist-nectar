import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommunityVerificationService,
  VerificationHttpError,
  normalizeE164,
} from '../community-verification.mjs';

const providerId = '7bf39fa3-2c3e-4248-8ef4-6377274e44d1';
const actionId = '7a279684-13b7-4df4-b0e0-ac68d41cd656';

const builder = (result) => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    in: () => chain,
    is: () => chain,
    insert: () => chain,
    update: () => chain,
    single: async () => result,
    maybeSingle: async () => result,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
};

test('requires and canonicalizes an international WhatsApp number', () => {
  assert.equal(normalizeE164('00506 8718-4331'), '+50687184331');
  assert.equal(normalizeE164('+1 (520) 447-3525'), '+15204473525');
  assert.throws(
    () => normalizeE164('8718 4331'),
    (error) => error instanceof VerificationHttpError && error.status === 400,
  );
});

test('starts a WhatsApp Verify action with only a hashed browser token in storage', async () => {
  const calls = [];
  const results = [
    { count: 0, error: null },
    { count: 0, error: null },
    { data: { id: actionId, expires_at: '2026-08-04T15:10:00.000Z' }, error: null },
    { error: null },
  ];
  const supabase = {
    from(table) {
      calls.push(table);
      return builder(results.shift());
    },
  };
  const twilioClient = {
    verify: { v2: { services: () => ({
      verifications: { create: async (input) => {
        assert.deepEqual(input, {
          to: '+50687184331',
          channel: 'whatsapp',
          customFriendlyName: 'Machu',
        });
        return { sid: 'VEaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' };
      } },
    }) } },
  };
  const service = new CommunityVerificationService({
    supabase,
    twilioClient,
    verifyServiceSid: 'VAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    signingSecret: 'test-signing-secret',
  });

  const result = await service.start({
    actionType: 'provider_review',
    phone: '00506 8718 4331',
    payload: { providerId, rating: 5, imageCount: 0 },
    requestIp: '192.0.2.1',
  });

  assert.equal(result.actionId, actionId);
  assert.equal(result.phone, '+50687184331');
  assert.match(result.actionToken, /^[A-Za-z0-9_-]{32,128}$/);
  assert.deepEqual(calls, [
    'community_verification_actions',
    'community_verification_actions',
    'community_verification_actions',
    'community_verification_actions',
  ]);
});

test('accepts an approved Twilio code and completes a no-photo review', async () => {
  const action = {
    id: actionId,
    action_type: 'provider_review',
    requester_whatsapp: '+50687184331',
    payload: { providerId, rating: 5, imageCount: 0 },
    status: 'sent',
    check_attempts: 0,
    consumed_at: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
  const twilioClient = {
    verify: { v2: { services: () => ({
      verificationChecks: { create: async (input) => {
        assert.deepEqual(input, { to: '+50687184331', code: '123456' });
        return { status: 'approved' };
      } },
    }) } },
  };
  const service = new CommunityVerificationService({
    supabase: { from: () => builder({ error: null }) },
    twilioClient,
    verifyServiceSid: 'VAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    signingSecret: 'test-signing-secret',
  });
  service.loadAction = async () => action;
  service.markVerified = async () => ({ ...action, status: 'verified', verified_at: new Date().toISOString() });
  service.completeReview = async ({ action: verifiedAction, imagePaths }) => {
    assert.equal(verifiedAction.status, 'verified');
    assert.deepEqual(imagePaths, []);
    return { status: 'approved', actionType: 'provider_review' };
  };

  assert.deepEqual(await service.check({
    actionId,
    actionToken: 'verification_action_token_12345678901234567890',
    code: '123456',
  }), { status: 'approved', actionType: 'provider_review' });
});
