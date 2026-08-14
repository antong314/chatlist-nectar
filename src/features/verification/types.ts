export interface WhatsappVerificationChallenge {
  actionId: string;
  actionToken: string;
  expiresAt: string;
  phone: string;
}

export interface VerificationApproval {
  status: 'approved';
  actionType: VerificationActionType;
  requiresCompletion?: boolean;
}

export type VerificationActionType =
  | 'provider_create'
  | 'provider_update'
  | 'provider_delete'
  | 'provider_review';
