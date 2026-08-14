import type {
  VerificationActionType,
  VerificationApproval,
  WhatsappVerificationChallenge,
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
  phone: string;
  payload: Record<string, unknown>;
}): Promise<WhatsappVerificationChallenge> => postJson('/bot/verify/start', input);

export const checkWhatsappVerification = async (
  challenge: Pick<WhatsappVerificationChallenge, 'actionId' | 'actionToken'>,
  code: string,
): Promise<VerificationApproval & Record<string, unknown>> => postJson('/bot/verify/check', {
  actionId: challenge.actionId,
  actionToken: challenge.actionToken,
  code,
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
