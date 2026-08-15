export interface WhatsappVerificationChallenge {
  actionId: string;
  actionToken: string;
  expiresAt: string;
  phone: string;
  requiresWhatsappApproval: boolean;
  verificationMethod: 'whatsapp_inbound' | 'trusted_session';
  whatsappUrl: string | null;
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

export interface VerifiedWhatsappSession {
  authenticated: boolean;
  phoneEnding?: string;
  expiresAt?: string;
}

export type VerificationActionType =
  | 'provider_create'
  | 'provider_update'
  | 'provider_delete'
  | 'provider_review';
