export interface WhatsappVerificationChallenge {
  actionId: string;
  actionToken: string;
  expiresAt: string;
  phone: string;
  whatsappUrl: string;
}

export interface WhatsappVerificationStatus {
  status: 'waiting' | 'verified' | 'completed';
  expiresAt: string;
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
