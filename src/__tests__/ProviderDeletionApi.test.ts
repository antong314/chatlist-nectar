import { supabase } from '@/lib/supabase';
import {
  requestProviderDeletion,
  undoProviderDeletion,
} from '@/features/provider-deletion';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: jest.fn() },
  },
}));

const invoke = supabase.functions.invoke as jest.Mock;
const providerId = '7bf39fa3-2c3e-4248-8ef4-6377274e44d1';
const eventId = '19062aaa-7850-4d70-8cb6-00d320bf3334';

describe('provider deletion API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('sends the exact deletion contract and returns short-lived undo data', async () => {
    invoke.mockResolvedValue({
      data: {
        eventId,
        undoToken: 'random_undo_token_12345678901234567890',
        undoExpiresAt: '2026-08-02T23:32:00.000Z',
      },
      error: null,
    });

    await expect(requestProviderDeletion({
      providerId,
      providerNameConfirmation: '  Efra Mechanic  ',
      reason: 'closed',
      requesterWhatsapp: ' +506 8888 1212 ',
      communityCode: ' AbC-234-XyZ ',
    })).resolves.toEqual({
      eventId,
      undoToken: 'random_undo_token_12345678901234567890',
      undoExpiresAt: '2026-08-02T23:32:00.000Z',
    });

    expect(invoke).toHaveBeenCalledWith('provider-deletion', {
      body: {
        action: 'delete',
        providerId,
        providerNameConfirmation: 'Efra Mechanic',
        reason: 'closed',
        requesterWhatsapp: '+506 8888 1212',
        communityCode: 'AbC-234-XyZ',
      },
    });
  });

  test('sends only the event and single-use token for undo', async () => {
    invoke.mockResolvedValue({ data: { undone: true }, error: null });

    await expect(undoProviderDeletion({
      eventId,
      undoToken: ' random_undo_token_12345678901234567890 ',
    })).resolves.toBeUndefined();

    expect(invoke).toHaveBeenCalledWith('provider-deletion', {
      body: {
        action: 'undo',
        eventId,
        undoToken: 'random_undo_token_12345678901234567890',
      },
    });
  });

  test('surfaces safe Edge Function errors without leaking request fields', async () => {
    invoke.mockResolvedValue({
      data: { error: 'The community code is incorrect.' },
      error: new Error('Edge Function returned a non-2xx status code'),
    });

    await expect(requestProviderDeletion({
      providerId,
      providerNameConfirmation: 'Efra Mechanic',
      reason: 'incorrect',
      requesterWhatsapp: '+50688881212',
      communityCode: 'wrong-code',
    })).rejects.toThrow('The community code is incorrect.');
  });

  test('rejects malformed input before invoking the privileged function', async () => {
    await expect(requestProviderDeletion({
      providerId: 'not-a-uuid',
      providerNameConfirmation: 'Efra Mechanic',
      reason: 'other',
      requesterWhatsapp: '+50688881212',
      communityCode: 'ABC-234-XYZ',
    })).rejects.toThrow('valid provider');

    await expect(undoProviderDeletion({ eventId, undoToken: '   ' }))
      .rejects.toThrow('undo link is invalid');
    expect(invoke).not.toHaveBeenCalled();
  });
});
