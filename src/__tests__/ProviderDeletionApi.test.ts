import { supabase } from '@/lib/supabase';
import {
  requestProviderDeletion,
  startProviderDeletionVerification,
  undoProviderDeletion,
} from '@/features/provider-deletion';

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
      phone: '+50688881212',
    }));

    await expect(startProviderDeletionVerification({
      providerId,
      providerNameConfirmation: '  Efra Mechanic  ',
      reason: 'closed',
      requesterWhatsapp: ' +506 8888 1212 ',
    })).resolves.toEqual(expect.objectContaining({ actionId, actionToken }));

    expect(fetchMock).toHaveBeenCalledWith('/bot/verify/start', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        actionType: 'provider_delete',
        phone: '+506 8888 1212',
        payload: {
          providerId,
          providerNameConfirmation: 'Efra Mechanic',
          reason: 'closed',
        },
      }),
    }));
  });

  test('checks the one-time code and returns short-lived undo data', async () => {
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
      code: '123456',
    })).resolves.toEqual({
      eventId,
      undoToken: 'random_undo_token_12345678901234567890',
      undoExpiresAt: '2026-08-04T14:02:00.000Z',
    });

    expect(fetchMock).toHaveBeenCalledWith('/bot/verify/check', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ actionId, actionToken, code: '123456' }),
    }));
  });

  test('surfaces safe verification errors', async () => {
    fetchMock.mockReturnValue(jsonResponse({ error: 'That code is incorrect or expired. Please try again.' }, 400));
    await expect(requestProviderDeletion({ providerId, actionId, actionToken, code: '000000' }))
      .rejects.toThrow('incorrect or expired');
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
      requesterWhatsapp: '+50688881212',
    })).rejects.toThrow('valid provider');
    await expect(undoProviderDeletion({ eventId, undoToken: '   ' }))
      .rejects.toThrow('undo link is invalid');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });
});
