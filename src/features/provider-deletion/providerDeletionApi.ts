import { supabase } from '@/lib/supabase';
import {
  PROVIDER_DELETION_REASONS,
  RequestProviderDeletionInput,
  RequestProviderDeletionResult,
  UndoProviderDeletionInput,
} from './types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const readInvocationError = async (
  error: unknown,
  data: unknown,
  fallback: string,
): Promise<Error> => {
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
    return new Error(data.error);
  }

  if (error && typeof error === 'object' && 'context' in error && error.context instanceof Response) {
    try {
      const responseBody = await error.context.clone().json() as { error?: unknown };
      if (typeof responseBody.error === 'string') return new Error(responseBody.error);
    } catch {
      // Fall through to the stable user-facing error below.
    }
  }

  return new Error(fallback);
};

const requireUuid = (value: string, message: string): string => {
  const normalized = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) throw new Error(message);
  return normalized;
};

export const requestProviderDeletion = async (
  input: RequestProviderDeletionInput,
): Promise<RequestProviderDeletionResult> => {
  const providerId = requireUuid(input.providerId, 'A valid provider is required.');
  const providerNameConfirmation = input.providerNameConfirmation.trim();
  const requesterWhatsapp = input.requesterWhatsapp.trim();
  const communityCode = input.communityCode.trim();

  if (!providerNameConfirmation) throw new Error('Type the provider name to confirm removal.');
  if (!PROVIDER_DELETION_REASONS.includes(input.reason)) {
    throw new Error('Select a valid reason for removing this provider.');
  }
  if (!requesterWhatsapp) throw new Error('Enter your WhatsApp number.');
  if (!communityCode) throw new Error('Enter the community code.');

  const { data, error } = await supabase.functions.invoke('provider-deletion', {
    body: {
      action: 'delete',
      providerId,
      providerNameConfirmation,
      reason: input.reason,
      requesterWhatsapp,
      communityCode,
    },
  });

  if (error) {
    throw await readInvocationError(
      error,
      data,
      'We could not remove this provider right now. Please try again.',
    );
  }

  const result = data as Partial<RequestProviderDeletionResult> | null;
  if (!result || !UUID_PATTERN.test(result.eventId ?? '')
    || typeof result.undoToken !== 'string' || !result.undoToken
    || typeof result.undoExpiresAt !== 'string' || !result.undoExpiresAt) {
    throw new Error('The provider was removed, but undo information was unavailable. Refresh the directory.');
  }

  return {
    eventId: result.eventId!,
    undoToken: result.undoToken,
    undoExpiresAt: result.undoExpiresAt,
  };
};

export const undoProviderDeletion = async (
  input: UndoProviderDeletionInput,
): Promise<void> => {
  const eventId = requireUuid(input.eventId, 'This undo link is invalid.');
  const undoToken = input.undoToken.trim();
  if (!undoToken) throw new Error('This undo link is invalid.');

  const { data, error } = await supabase.functions.invoke('provider-deletion', {
    body: { action: 'undo', eventId, undoToken },
  });

  if (error) {
    throw await readInvocationError(
      error,
      data,
      'We could not restore this provider. The undo window may have expired.',
    );
  }
};
