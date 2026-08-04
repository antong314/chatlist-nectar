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

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

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
  if (!supabaseUrl || !serviceRoleKey) {
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
    return json(410, {
      error: 'Provider removal now requires an individual WhatsApp confirmation code.',
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
