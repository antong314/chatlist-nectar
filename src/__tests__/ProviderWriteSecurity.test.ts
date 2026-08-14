import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  completeVerifiedProviderWrite,
  startWhatsappVerification,
  uploadVerifiedProviderLogo,
} from '@/features/verification';

const migration = readFileSync(resolve(
  process.cwd(),
  'supabase/migrations/20260814120000_verified_provider_writes.sql',
), 'utf8');

const jsonResponse = (body: unknown, status = 200) => Promise.resolve(new Response(
  JSON.stringify(body),
  { status, headers: { 'Content-Type': 'application/json' } },
));

describe('verified provider write security', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as typeof fetch;
  });

  test('removes anonymous contact writes and exposes completion only to service_role', () => {
    expect(migration).toMatch(/DROP POLICY IF EXISTS "Public can add active contacts"/i);
    expect(migration).toMatch(/DROP POLICY IF EXISTS "Public can edit active contacts"/i);
    expect(migration).toMatch(/REVOKE INSERT[\s\S]*ON public\.contacts FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/REVOKE UPDATE[\s\S]*ON public\.contacts FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/pg_catalog\.pg_policies[\s\S]*contact-images[\s\S]*DROP POLICY/i);
    expect(migration).toMatch(/reject_anonymous_contact_image_mutation[\s\S]*auth\.role\(\) IN \('anon', 'authenticated'\)/i);
    expect(migration).toMatch(/complete_verified_provider_write[\s\S]*FOR UPDATE/i);
    expect(migration).toMatch(/status <> 'verified'[\s\S]*consumed_at IS NOT NULL/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.complete_verified_provider_write[\s\S]*FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.complete_verified_provider_write[\s\S]*TO service_role/i);
  });

  test('starts a provider-create challenge with the bound payload', async () => {
    fetchMock.mockReturnValue(jsonResponse({
      actionId: '7a279684-13b7-4df4-b0e0-ac68d41cd656',
      actionToken: 'verification_action_token_12345678901234567890',
      expiresAt: '2026-08-14T12:10:00.000Z',
      phone: '+50687771234',
    }));
    const payload = {
      name: 'Efra Mechanic',
      category: 'Mechanic',
      description: 'Mobile repairs.',
      providerPhone: '+50688881212',
      website: null,
      mapUrl: null,
      imageChange: 'none',
    };

    await startWhatsappVerification({
      actionType: 'provider_create',
      phone: '+50687771234',
      payload,
    });

    expect(fetchMock).toHaveBeenCalledWith('/bot/verify/start', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ actionType: 'provider_create', phone: '+50687771234', payload }),
    }));
  });

  test('completes a verified provider write through the dedicated endpoint', async () => {
    const challenge = {
      actionId: '7a279684-13b7-4df4-b0e0-ac68d41cd656',
      actionToken: 'verification_action_token_12345678901234567890',
    };
    fetchMock.mockReturnValue(jsonResponse({
      status: 'approved',
      actionType: 'provider_update',
      provider: { id: '7bf39fa3-2c3e-4248-8ef4-6377274e44d1' },
    }));

    await completeVerifiedProviderWrite(challenge, null);

    expect(fetchMock).toHaveBeenCalledWith('/bot/verify/provider/complete', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ ...challenge, imagePath: null }),
    }));
  });

  test('uploads provider logos through the verified server action', async () => {
    const challenge = {
      actionId: '7a279684-13b7-4df4-b0e0-ac68d41cd656',
      actionToken: 'verification_action_token_12345678901234567890',
    };
    const logo = new File(['logo'], 'logo.png', { type: 'image/png' });
    fetchMock.mockReturnValue(jsonResponse({
      imagePath: `${challenge.actionId}/11111111-1111-4111-8111-111111111111.png`,
    }));

    await uploadVerifiedProviderLogo(challenge, logo);

    expect(fetchMock).toHaveBeenCalledWith('/bot/verify/provider/logo', {
      method: 'POST',
      headers: {
        'Content-Type': 'image/png',
        'X-Verification-Action-Id': challenge.actionId,
        'X-Verification-Action-Token': challenge.actionToken,
      },
      body: logo,
    });
  });
});
