export const PROVIDER_DELETION_REASONS = [
  'outdated',
  'duplicate',
  'closed',
  'incorrect',
  'other',
] as const;

export type ProviderDeletionReason = (typeof PROVIDER_DELETION_REASONS)[number];

export interface RequestProviderDeletionInput {
  providerId: string;
  providerNameConfirmation: string;
  reason: ProviderDeletionReason;
  requesterWhatsapp: string;
  communityCode: string;
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
