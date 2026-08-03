import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigins = new Set([
  'https://sanmateo.love',
  'https://www.sanmateo.love',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
]);

const corsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && allowedOrigins.has(origin)
    ? origin
    : 'https://www.sanmateo.love',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
  'Vary': 'Origin',
});

const reasons = new Set(['outdated', 'duplicate', 'closed', 'incorrect', 'other']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const whatsappPattern = /^\+?[0-9]{8,15}$/;
const undoTokenPattern = /^[A-Za-z0-9_-]{32,128}$/;
const textEncoder = new TextEncoder();

const json = (status: number, body: Record<string, unknown>, origin: string | null) => new Response(
  JSON.stringify(body),
  { status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' } },
);

const boundedString = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== 'string' || value.length > maxLength) return null;
  return value.trim();
};

const normalizeWhatsapp = (value: string): string => {
  let normalized = value.trim().replace(/[\s().-]+/g, '');
  if (normalized.startsWith('00')) normalized = `+${normalized.slice(2)}`;
  return normalized;
};

const constantTimeEqual = (left: string, right: string): boolean => {
  const leftBytes = textEncoder.encode(left);
  const rightBytes = textEncoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
};

const randomToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const delayInvalidCode = () => new Promise((resolve) => setTimeout(resolve, 350));

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  if (origin && !allowedOrigins.has(origin)) {
    return json(403, { error: 'Origin is not allowed.' }, null);
  }
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' }, origin);
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return json(415, { error: 'Content-Type must be application/json.' }, origin);
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 16_384) {
    return json(413, { error: 'Request is too large.' }, origin);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim() ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ?? '';
  const configuredCode = Deno.env.get('COMMUNITY_DELETE_CODE')?.trim().toUpperCase() ?? '';
  if (!supabaseUrl || !serviceRoleKey || configuredCode.length < 12) {
    return json(503, { error: 'Provider removal is temporarily unavailable.' }, origin);
  }

  let body: Record<string, unknown>;
  try {
    const requestText = await request.text();
    if (textEncoder.encode(requestText).byteLength > 16_384) {
      return json(413, { error: 'Request is too large.' }, origin);
    }
    const parsedBody: unknown = JSON.parse(requestText);
    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
      return json(400, { error: 'Enter valid provider removal details.' }, origin);
    }
    body = parsedBody as Record<string, unknown>;
  } catch {
    return json(400, { error: 'Enter valid provider removal details.' }, origin);
  }

  const action = boundedString(body.action, 16);
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (action === 'delete') {
    const providerId = boundedString(body.providerId, 64)?.toLowerCase() ?? '';
    const providerNameConfirmation = boundedString(body.providerNameConfirmation, 2_000);
    const reason = boundedString(body.reason, 32)?.toLowerCase() ?? '';
    const requesterWhatsappInput = boundedString(body.requesterWhatsapp, 40);
    const suppliedCode = boundedString(body.communityCode, 128)?.toUpperCase() ?? '';

    if (!constantTimeEqual(suppliedCode, configuredCode)) {
      await delayInvalidCode();
      return json(403, { error: 'The community code is incorrect.' }, origin);
    }
    if (!uuidPattern.test(providerId) || !providerNameConfirmation
      || !reasons.has(reason) || !requesterWhatsappInput) {
      return json(400, { error: 'Complete every required provider removal field.' }, origin);
    }

    const requesterWhatsapp = normalizeWhatsapp(requesterWhatsappInput);
    if (!whatsappPattern.test(requesterWhatsapp)) {
      return json(400, { error: 'Enter a valid WhatsApp number with country code.' }, origin);
    }

    const undoToken = randomToken();
    const undoTokenHash = await sha256Hex(undoToken);
    const { data, error } = await admin.rpc('perform_provider_soft_delete', {
      p_contact_id: providerId,
      p_provider_name_confirmation: providerNameConfirmation,
      p_reason: reason,
      p_requester_whatsapp: requesterWhatsapp,
      p_undo_token_hash: undoTokenHash,
    });

    if (error) {
      const message = error.message.includes('name confirmation')
        ? 'The provider name does not match.'
        : error.message.includes('already removed') || error.code === 'P0002'
          ? 'This provider is no longer available.'
          : 'We could not remove this provider right now.';
      return json(error.code === 'P0002' ? 404 : 400, { error: message }, origin);
    }

    const event = Array.isArray(data) ? data[0] : null;
    if (!event?.event_id || !event?.undo_expires_at) {
      return json(500, { error: 'Provider removal did not return undo information.' }, origin);
    }

    return json(200, {
      eventId: event.event_id,
      undoToken,
      undoExpiresAt: event.undo_expires_at,
    }, origin);
  }

  if (action === 'undo') {
    const eventId = boundedString(body.eventId, 64)?.toLowerCase() ?? '';
    const undoToken = boundedString(body.undoToken, 128) ?? '';
    if (!uuidPattern.test(eventId) || !undoTokenPattern.test(undoToken)) {
      return json(400, { error: 'This undo link is invalid.' }, origin);
    }

    const { error } = await admin.rpc('undo_provider_soft_delete', {
      p_event_id: eventId,
      p_undo_token_hash: await sha256Hex(undoToken),
    });
    if (error) {
      return json(400, { error: 'This undo link is invalid or has expired.' }, origin);
    }
    return json(200, { undone: true }, origin);
  }

  return json(400, { error: 'Choose a valid provider removal action.' }, origin);
});
