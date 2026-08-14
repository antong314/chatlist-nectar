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

test('normalizes and binds provider edits to the verification action payload', async () => {
  let insertedAction;
  const results = [
    { count: 0, error: null },
    { count: 0, error: null },
    { data: { id: actionId, expires_at: '2026-08-04T15:10:00.000Z' }, error: null },
    { error: null },
  ];
  const supabase = {
    from() {
      const chain = builder(results.shift());
      chain.insert = (value) => {
        insertedAction = value;
        return chain;
      };
      return chain;
    },
  };
  const twilioClient = {
    verify: { v2: { services: () => ({
      verifications: { create: async () => ({ sid: 'VEaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }) },
    }) } },
  };
  const service = new CommunityVerificationService({
    supabase,
    twilioClient,
    verifyServiceSid: 'VAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    signingSecret: 'test-signing-secret',
  });

  await service.start({
    actionType: 'provider_update',
    phone: '+506 8777 1234',
    payload: {
      providerId,
      name: '  Efra   Mechanic ',
      category: 'Mechanic',
      description: ' Mobile repairs. ',
      providerPhone: '00506 8888 1212',
      website: 'https://example.com',
      mapUrl: null,
      imageChange: 'keep',
    },
    requestIp: '192.0.2.2',
  });

  assert.equal(insertedAction.action_type, 'provider_update');
  assert.equal(insertedAction.requester_whatsapp, '+50687771234');
  assert.deepEqual(insertedAction.payload, {
    providerId,
    name: 'Efra Mechanic',
    category: 'Mechanic',
    description: 'Mobile repairs.',
    providerPhone: '+50688881212',
    website: 'https://example.com/',
    mapUrl: null,
    imageChange: 'keep',
  });
});

test('completes a verified provider write through the service-only RPC', async () => {
  const imagePath = `${actionId}/11111111-1111-4111-8111-111111111111.jpg`;
  let rpcArguments;
  const service = new CommunityVerificationService({
    supabase: {
      rpc: async (name, args) => {
        assert.equal(name, 'complete_verified_provider_write');
        rpcArguments = args;
        return {
          data: {
            id: providerId,
            title: 'Efra Mechanic',
            subtitle: 'Mobile repairs.',
            category: 'Mechanic',
            phone_number: '+50688881212',
            website_url: null,
            map_url: null,
            image_url: `https://example.supabase.co/storage/v1/object/public/contact-images/${imagePath}`,
            previous_image_url: null,
          },
          error: null,
        };
      },
      storage: {
        from: () => ({
          getPublicUrl: (path) => ({
            data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/contact-images/${path}` },
          }),
        }),
      },
    },
    twilioClient: {},
    verifyServiceSid: 'VAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    signingSecret: 'test-signing-secret',
  });
  service.loadAction = async () => ({
    id: actionId,
    action_type: 'provider_create',
    status: 'verified',
    consumed_at: null,
    payload: { imageChange: 'replace' },
  });

  const result = await service.completeProviderWrite({
    actionId,
    actionToken: 'verification_action_token_12345678901234567890',
    imagePath,
  });

  assert.deepEqual(rpcArguments, {
    p_action_id: actionId,
    p_image_path: imagePath,
    p_image_url: `https://example.supabase.co/storage/v1/object/public/contact-images/${imagePath}`,
  });
  assert.equal(result.actionType, 'provider_create');
  assert.equal(result.provider.id, providerId);
  assert.equal('previous_image_url' in result.provider, false);
});

test('uploads a provider logo only for a verified replacement action', async () => {
  let uploaded;
  const service = new CommunityVerificationService({
    supabase: {
      storage: {
        from: (bucket) => {
          assert.equal(bucket, 'contact-images');
          return {
            upload: async (path, bytes, options) => {
              uploaded = { path, bytes, options };
              return { error: null };
            },
          };
        },
      },
    },
    twilioClient: {},
    verifyServiceSid: 'VAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    signingSecret: 'test-signing-secret',
  });
  service.loadAction = async () => ({
    id: actionId,
    action_type: 'provider_update',
    status: 'verified',
    consumed_at: null,
    payload: { imageChange: 'replace' },
  });
  const bytes = Buffer.from('logo');

  const result = await service.uploadProviderLogo({
    actionId,
    actionToken: 'verification_action_token_12345678901234567890',
    contentType: 'image/png',
    bytes,
  });

  assert.match(result.imagePath, new RegExp(`^${actionId}/[0-9a-f-]{36}\\.png$`));
  assert.equal(uploaded.path, result.imagePath);
  assert.equal(uploaded.bytes, bytes);
  assert.deepEqual(uploaded.options, { contentType: 'image/png', upsert: false });
});
