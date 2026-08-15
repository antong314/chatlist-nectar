import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommunityVerificationService,
  VerificationHttpError,
  normalizeE164,
} from '../community-verification.mjs';

const providerId = '7bf39fa3-2c3e-4248-8ef4-6377274e44d1';
const actionId = '7a279684-13b7-4df4-b0e0-ac68d41cd656';
const sessionId = '315dfdb8-454c-4318-a08a-19a44b5f6005';

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

test('starts an inbound WhatsApp approval with separate browser and message tokens', async () => {
  const calls = [];
  let insertedAction;
  const results = [
    { count: 0, error: null },
    { data: { id: actionId, expires_at: '2026-08-04T15:10:00.000Z' }, error: null },
  ];
  const supabase = {
    from(table) {
      calls.push(table);
      const chain = builder(results.shift());
      chain.insert = (value) => {
        insertedAction = value;
        return chain;
      };
      return chain;
    },
  };
  const service = new CommunityVerificationService({
    supabase,
    signingSecret: 'test-signing-secret',
    whatsappFrom: 'whatsapp:+15204473525',
  });

  const result = await service.start({
    actionType: 'provider_review',
    payload: { providerId, rating: 5, imageCount: 0 },
    requestIp: '192.0.2.1',
  });

  assert.equal(result.actionId, actionId);
  assert.equal('phone' in result, false);
  assert.equal(result.requiresWhatsappApproval, true);
  assert.equal(result.verificationMethod, 'whatsapp_inbound');
  assert.match(result.actionToken, /^[A-Za-z0-9_-]{32,128}$/);
  assert.match(result.whatsappUrl, /^https:\/\/wa\.me\/15204473525\?text=/);
  assert.match(decodeURIComponent(result.whatsappUrl), /VERIFY 7a279684-13b7-4df4-b0e0-ac68d41cd656\.[A-Za-z0-9_-]{43}/);
  assert.equal(insertedAction.requester_whatsapp, null);
  assert.deepEqual(calls, [
    'community_verification_actions',
    'community_verification_actions',
  ]);
});

test('starts an already-verified action from the trusted device phone', async () => {
  let insertedAction;
  const results = [
    { count: 0, error: null },
    { count: 0, error: null },
    { data: { id: actionId, expires_at: '2026-08-15T01:10:00.000Z' }, error: null },
  ];
  const service = new CommunityVerificationService({
    supabase: {
      from() {
        const chain = builder(results.shift());
        chain.insert = (value) => {
          insertedAction = value;
          return chain;
        };
        return chain;
      },
    },
    signingSecret: 'test-signing-secret',
    whatsappFrom: '+15204473525',
  });

  const result = await service.start({
    actionType: 'provider_review',
    payload: { providerId, rating: 4, imageCount: 0 },
    requestIp: '192.0.2.3',
    verifiedSession: {
      id: sessionId,
      verified_whatsapp: '+50687771234',
    },
  });

  assert.equal('phone' in result, false);
  assert.equal(result.requiresWhatsappApproval, false);
  assert.equal(result.verificationMethod, 'trusted_session');
  assert.equal(result.whatsappUrl, null);
  assert.equal(insertedAction.requester_whatsapp, '+50687771234');
  assert.equal(insertedAction.verification_method, 'trusted_session');
  assert.equal(insertedAction.status, 'verified');
  assert.equal(insertedAction.trusted_session_id, sessionId);
  assert.match(insertedAction.verified_at, /^\d{4}-\d{2}-\d{2}T/);
});

test('stores only a hash for a remembered device and returns only masked identity publicly', async () => {
  let insertedSession;
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const session = {
    id: sessionId,
    verified_whatsapp: '+50687771234',
    expires_at: expiresAt,
    revoked_at: null,
  };
  const results = [
    { data: session, error: null },
    { error: null },
  ];
  const service = new CommunityVerificationService({
    supabase: {
      from() {
        const result = results.shift() ?? { data: { ...session, expires_at: expiresAt }, error: null };
        const chain = builder(result);
        chain.insert = (value) => {
          insertedSession = value;
          return chain;
        };
        return chain;
      },
    },
    signingSecret: 'test-signing-secret',
    whatsappFrom: '+15204473525',
  });

  const loaded = await service.getVerifiedSession('trusted_device_token_123456789012345678901');
  assert.equal(loaded.verified_whatsapp, '+50687771234');
  assert.deepEqual(service.publicSession(loaded), {
    authenticated: true,
    phoneEnding: '1234',
    expiresAt,
  });

  service.loadAction = async () => ({
    id: actionId,
    status: 'verified',
    requester_whatsapp: '+50687771234',
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  });
  const issued = await service.createVerifiedSessionForAction({ actionId, actionToken: 'unused' });
  assert.match(issued.sessionToken, /^[A-Za-z0-9_-]{32,128}$/);
  assert.notEqual(insertedSession.token_hash, issued.sessionToken);
  assert.match(insertedSession.token_hash, /^[0-9a-f]{64}$/);
  assert.equal(insertedSession.verified_whatsapp, '+50687771234');
  assert.equal(insertedSession.source_action_id, actionId);
});

test('atomically claims a signed inbound action with the actual sender phone', async () => {
  const action = {
    id: actionId,
    action_type: 'provider_review',
    requester_whatsapp: null,
    payload: { providerId, rating: 5, imageCount: 0 },
    status: 'pending',
    check_attempts: 0,
    consumed_at: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
  const claimedAction = { ...action, requester_whatsapp: '+50687184331', status: 'verified' };
  let verificationUpdate;
  const results = [
    { data: action, error: null },
    { count: 0, error: null },
    { data: { action_type: 'provider_review' }, error: null },
    { data: claimedAction, error: null },
  ];
  const service = new CommunityVerificationService({
    supabase: {
      from: () => {
        const chain = builder(results.shift());
        chain.update = (value) => {
          verificationUpdate = value;
          return chain;
        };
        return chain;
      },
    },
    signingSecret: 'test-signing-secret',
    whatsappFrom: '+15204473525',
  });
  const body = `Please verify\nVERIFY ${service.approvalToken(actionId)}`;

  assert.deepEqual(await service.approveInbound({ body, senderPhone: '50687184331' }), {
    approved: true,
    actionType: 'provider_review',
    alreadyApproved: false,
  });
  assert.equal(verificationUpdate.requester_whatsapp, '+50687184331');
  assert.deepEqual(await service.approveInbound({ body, senderPhone: '50688880000' }), {
    approved: false,
    reason: 'phone',
  });
});

test('rejects an inbound approval whose action signature was changed', async () => {
  const service = new CommunityVerificationService({
    supabase: { from: () => { throw new Error('Invalid signatures must not query the database.'); } },
    signingSecret: 'test-signing-secret',
    whatsappFrom: '+15204473525',
  });
  const token = service.approvalToken(actionId);
  const tamperedToken = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;

  assert.deepEqual(await service.approveInbound({
    body: `VERIFY ${tamperedToken}`,
    senderPhone: '50687184331',
  }), { approved: false, reason: 'invalid' });
});

test('reports waiting and verified states without completing the action', async () => {
  const service = new CommunityVerificationService({
    supabase: { from: () => builder({ error: null }) },
    signingSecret: 'test-signing-secret',
    whatsappFrom: '+15204473525',
  });
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  service.loadAction = async () => ({ status: 'pending', expires_at: expiresAt });
  assert.deepEqual(await service.status({ actionId, actionToken: 'unused' }), {
    status: 'waiting',
    expiresAt,
  });

  service.loadAction = async () => ({ status: 'verified', expires_at: expiresAt });
  assert.deepEqual(await service.status({ actionId, actionToken: 'unused' }), {
    status: 'verified',
    expiresAt,
  });
});

test('completes a no-photo review only after inbound approval', async () => {
  const action = {
    id: actionId,
    action_type: 'provider_review',
    requester_whatsapp: '+50687184331',
    payload: { providerId, rating: 5, imageCount: 0 },
    status: 'verified',
    consumed_at: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
  const service = new CommunityVerificationService({
    supabase: { from: () => builder({ error: null }) },
    signingSecret: 'test-signing-secret',
    whatsappFrom: '+15204473525',
  });
  service.loadAction = async () => action;
  service.completeReview = async ({ action: verifiedAction, imagePaths }) => {
    assert.equal(verifiedAction.status, 'verified');
    assert.deepEqual(imagePaths, []);
    return { status: 'approved', actionType: 'provider_review' };
  };

  assert.deepEqual(await service.check({
    actionId,
    actionToken: 'verification_action_token_12345678901234567890',
  }), { status: 'approved', actionType: 'provider_review' });
});

test('normalizes and binds provider edits to the verification action payload', async () => {
  let insertedAction;
  const results = [
    { count: 0, error: null },
    { data: { id: actionId, expires_at: '2026-08-04T15:10:00.000Z' }, error: null },
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
  const service = new CommunityVerificationService({
    supabase,
    signingSecret: 'test-signing-secret',
    whatsappFrom: '+15204473525',
  });

  await service.start({
    actionType: 'provider_update',
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
  assert.equal(insertedAction.requester_whatsapp, null);
  assert.equal(insertedAction.verification_method, 'whatsapp_inbound');
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
    signingSecret: 'test-signing-secret',
    whatsappFrom: '+15204473525',
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
    signingSecret: 'test-signing-secret',
    whatsappFrom: '+15204473525',
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
