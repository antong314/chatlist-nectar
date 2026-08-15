import { supabase } from '@/lib/supabase';
import {
  requestProviderDeletion,
  startProviderDeletionVerification,
  undoProviderDeletion,
} from '@/features/provider-deletion';
import {
  forgetVerifiedWhatsappSession,
  getVerifiedWhatsappSession,
} from '@/features/verification';

jest.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

const invoke = supabase.functions.invoke as jest.Mock;
const providerId = '7bf39fa3-2c3e-4248-8ef4-6377274e44d1';
const eventId = '19062aaa-7850-4d70-8cb6-00d320bf3334';
const actionId = '7a279684-13b7-4df4-b0e0-ac68d41cd656';
const actionToken = 'verification_action_token_12345678901234567890';
const fetchMock = jest.fn();

const jsonResponse = (body: unknown, status = 200) => Promise.resolve({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe('provider deletion verification API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as typeof fetch;
  });

  test('starts a WhatsApp verification bound to the deletion details', async () => {
    fetchMock.mockReturnValue(jsonResponse({
      actionId,
      actionToken,
      expiresAt: '2026-08-04T14:10:00.000Z',
      requiresWhatsappApproval: true,
      verificationMethod: 'whatsapp_inbound',
      whatsappUrl: 'https://wa.me/15204473525?text=VERIFY',
    }));

    await expect(startProviderDeletionVerification({
      providerId,
      providerNameConfirmation: '  Efra Mechanic  ',
      reason: 'closed',
    })).resolves.toEqual(expect.objectContaining({ actionId, actionToken }));

    expect(fetchMock).toHaveBeenCalledWith('/bot/verify/start', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        actionType: 'provider_delete',
        payload: {
          providerId,
          providerNameConfirmation: 'Efra Mechanic',
          reason: 'closed',
        },
      }),
    }));
  });

  test('reads and forgets the private trusted-device session', async () => {
    fetchMock
      .mockReturnValueOnce(jsonResponse({
        authenticated: true,
        phoneEnding: '1212',
        expiresAt: '2026-09-14T00:00:00.000Z',
      }))
      .mockReturnValueOnce(jsonResponse({ authenticated: false }));

    await expect(getVerifiedWhatsappSession()).resolves.toEqual(expect.objectContaining({
      authenticated: true,
      phoneEnding: '1212',
    }));
    await expect(forgetVerifiedWhatsappSession()).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/bot/verify/session', { cache: 'no-store' });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/bot/verify/session/forget', { method: 'POST' });
  });

  test('completes an inbound-approved deletion and returns short-lived undo data', async () => {
    fetchMock.mockReturnValue(jsonResponse({
      status: 'approved',
      actionType: 'provider_delete',
      eventId,
      undoToken: 'random_undo_token_12345678901234567890',
      undoExpiresAt: '2026-08-04T14:02:00.000Z',
    }));

    await expect(requestProviderDeletion({
      providerId,
      actionId,
      actionToken,
    })).resolves.toEqual({
      eventId,
      undoToken: 'random_undo_token_12345678901234567890',
      undoExpiresAt: '2026-08-04T14:02:00.000Z',
    });

    expect(fetchMock).toHaveBeenCalledWith('/bot/verify/check', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ actionId, actionToken }),
    }));
  });

  test('surfaces safe verification errors', async () => {
    fetchMock.mockReturnValue(jsonResponse({ error: 'Open WhatsApp and send the prefilled message to Machu first.' }, 409));
    await expect(requestProviderDeletion({ providerId, actionId, actionToken }))
      .rejects.toThrow('send the prefilled message');
  });

  test('sends only the event and single-use token for undo', async () => {
    invoke.mockResolvedValue({ data: { undone: true }, error: null });
    await expect(undoProviderDeletion({
      eventId,
      undoToken: ' random_undo_token_12345678901234567890 ',
    })).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith('provider-deletion', {
      body: { action: 'undo', eventId, undoToken: 'random_undo_token_12345678901234567890' },
    });
  });

  test('rejects malformed input before contacting either backend', async () => {
    await expect(startProviderDeletionVerification({
      providerId: 'not-a-uuid',
      providerNameConfirmation: 'Efra Mechanic',
      reason: 'other',
    })).rejects.toThrow('valid provider');
    await expect(undoProviderDeletion({ eventId, undoToken: '   ' }))
      .rejects.toThrow('undo link is invalid');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });
});
