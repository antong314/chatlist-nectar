export interface WhatsappVerificationChallenge {
  actionId: string;
  actionToken: string;
  expiresAt: string;
  phone: string;
}

export interface VerificationApproval {
  status: 'approved';
  actionType: 'provider_delete' | 'provider_review';
  requiresCompletion?: boolean;
}

