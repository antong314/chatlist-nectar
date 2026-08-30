import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  completeVerifiedWikiWrite,
  startWhatsappVerification,
} from '@/features/verification';

const migration = readFileSync(resolve(
  process.cwd(),
  'supabase/migrations/20260830193000_machu_wiki_and_inbound_audit.sql',
), 'utf8');

const jsonResponse = (body: unknown, status = 200) => Promise.resolve(new Response(
  JSON.stringify(body),
  { status, headers: { 'Content-Type': 'application/json' } },
));

describe('audited wiki write security', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as typeof fetch;
  });

  test('keeps public wiki reads while forcing writes through private audited RPCs', () => {
    expect(migration).toMatch(/REVOKE INSERT, UPDATE, DELETE ON TABLE public\.wiki_pages FROM anon, authenticated/i);
    expect(migration).toMatch(/CREATE TABLE public\.wiki_change_events[\s\S]*requester_whatsapp TEXT NOT NULL/i);
    expect(migration).toMatch(/REVOKE ALL ON TABLE public\.wiki_change_events FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/complete_verified_wiki_write[\s\S]*FOR UPDATE/i);
    expect(migration).toMatch(/status = 'completed', consumed_at = now\(\), result_id = applied\.id/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.complete_verified_wiki_write\(UUID\)[\s\S]*FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.complete_verified_wiki_write\(UUID\)[\s\S]*TO service_role/i);
  });

  test('binds wiki content to a WhatsApp verification challenge', async () => {
    fetchMock.mockReturnValue(jsonResponse({
      actionId: '7a279684-13b7-4df4-b0e0-ac68d41cd656',
      actionToken: 'verification_action_token_12345678901234567890',
      expiresAt: '2026-08-30T12:10:00.000Z',
      requiresWhatsappApproval: true,
    }));
    const payload = {
      slug: 'food-stores',
      title: 'Food Stores',
      category: 'Shopping',
      content: '[]',
      expectedVersion: 3,
    };

    await startWhatsappVerification({ actionType: 'wiki_update', payload });

    expect(fetchMock).toHaveBeenCalledWith('/bot/verify/start', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ actionType: 'wiki_update', payload }),
    }));
  });

  test('completes wiki changes through the dedicated endpoint', async () => {
    const challenge = {
      actionId: '7a279684-13b7-4df4-b0e0-ac68d41cd656',
      actionToken: 'verification_action_token_12345678901234567890',
    };
    fetchMock.mockReturnValue(jsonResponse({
      status: 'approved',
      actionType: 'wiki_update',
      page: { id: '7bf39fa3-2c3e-4248-8ef4-6377274e44d1', slug: 'food-stores' },
    }));

    await completeVerifiedWikiWrite(challenge);

    expect(fetchMock).toHaveBeenCalledWith('/bot/verify/wiki/complete', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(challenge),
    }));
  });
});
