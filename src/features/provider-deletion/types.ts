export const PROVIDER_DELETION_REASONS = [
  'outdated',
  'duplicate',
  'closed',
  'incorrect',
  'other',
] as const;

export type ProviderDeletionReason = (typeof PROVIDER_DELETION_REASONS)[number];

export interface StartProviderDeletionVerificationInput {
  providerId: string;
  providerNameConfirmation: string;
  reason: ProviderDeletionReason;
  requesterWhatsapp?: string;
}

export interface RequestProviderDeletionInput {
  providerId: string;
  actionId: string;
  actionToken: string;
}

export interface RequestProviderDeletionResult {
  eventId: string;
  undoToken: string;
  undoExpiresAt: string;
}

export interface UndoProviderDeletionInput {
  eventId: string;
  undoToken: string;
}
