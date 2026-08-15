import type {
  VerificationActionType,
  VerificationApproval,
  VerifiedWhatsappSession,
  WhatsappVerificationChallenge,
  WhatsappVerificationStatus,
} from './types';

const postJson = async <T>(url: string, body: unknown): Promise<T> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error
      : 'WhatsApp verification is temporarily unavailable. Please try again.';
    throw new Error(message);
  }
  return data as T;
};

export const startWhatsappVerification = async (input: {
  actionType: VerificationActionType;
  phone?: string;
  payload: Record<string, unknown>;
}): Promise<WhatsappVerificationChallenge> => postJson('/bot/verify/start', input);

export const getVerifiedWhatsappSession = async (): Promise<VerifiedWhatsappSession> => {
  const response = await fetch('/bot/verify/session', { cache: 'no-store' });
  if (!response.ok) throw new Error('We could not check this device’s WhatsApp verification.');
  return response.json() as Promise<VerifiedWhatsappSession>;
};

export const forgetVerifiedWhatsappSession = async (): Promise<void> => {
  const response = await fetch('/bot/verify/session/forget', { method: 'POST' });
  if (!response.ok) throw new Error('We could not forget the verified WhatsApp number.');
};

export const checkWhatsappVerification = async (
  challenge: Pick<WhatsappVerificationChallenge, 'actionId' | 'actionToken'>,
): Promise<VerificationApproval & Record<string, unknown>> => postJson('/bot/verify/check', {
  actionId: challenge.actionId,
  actionToken: challenge.actionToken,
});

export const getWhatsappVerificationStatus = async (
  challenge: Pick<WhatsappVerificationChallenge, 'actionId' | 'actionToken'>,
): Promise<WhatsappVerificationStatus> => postJson('/bot/verify/status', {
  actionId: challenge.actionId,
  actionToken: challenge.actionToken,
});

export const completeVerifiedReview = async (
  challenge: Pick<WhatsappVerificationChallenge, 'actionId' | 'actionToken'>,
  imagePaths: string[],
): Promise<VerificationApproval & Record<string, unknown>> => postJson('/bot/verify/review/complete', {
  actionId: challenge.actionId,
  actionToken: challenge.actionToken,
  imagePaths,
});

export const completeVerifiedProviderWrite = async (
  challenge: Pick<WhatsappVerificationChallenge, 'actionId' | 'actionToken'>,
  imagePath: string | null,
): Promise<VerificationApproval & { provider: Record<string, unknown> }> => postJson(
  '/bot/verify/provider/complete',
  {
    actionId: challenge.actionId,
    actionToken: challenge.actionToken,
    imagePath,
  },
);

export const uploadVerifiedProviderLogo = async (
  challenge: Pick<WhatsappVerificationChallenge, 'actionId' | 'actionToken'>,
  file: File,
): Promise<string> => {
  const response = await fetch('/bot/verify/provider/logo', {
    method: 'POST',
    headers: {
      'Content-Type': file.type,
      'X-Verification-Action-Id': challenge.actionId,
      'X-Verification-Action-Token': challenge.actionToken,
    },
    body: file,
  });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error
      : 'The provider logo could not be uploaded. Please try again.';
    throw new Error(message);
  }
  if (!data || typeof data !== 'object' || !('imagePath' in data) || typeof data.imagePath !== 'string') {
    throw new Error('The provider logo upload returned an invalid response.');
  }
  return data.imagePath;
};
