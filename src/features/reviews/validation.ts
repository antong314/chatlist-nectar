import { ReviewRating, SubmitReviewInput } from './types';

export const REVIEW_COMMENT_MAX_LENGTH = 1000;
export const REVIEWER_NAME_MAX_LENGTH = 80;
export const REVIEW_PAGE_MAX_SIZE = 100;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WHATSAPP_PATTERN = /^\+?[0-9]{8,15}$/;

export type ReviewField = 'providerId' | 'rating' | 'comment' | 'reviewerName' | 'reviewerWhatsapp';

export class ReviewValidationError extends Error {
  readonly field: ReviewField;

  constructor(field: ReviewField, message: string) {
    super(message);
    this.name = 'ReviewValidationError';
    this.field = field;
  }
}

const normalizeOptionalText = (value?: string | null): string | undefined => {
  const normalized = value?.replace(/\r\n?/g, '\n').trim();
  return normalized || undefined;
};

export const normalizeReviewerName = (value?: string | null): string | undefined => {
  const normalized = normalizeOptionalText(value)?.replace(/\s+/g, ' ');
  if (normalized && normalized.length > REVIEWER_NAME_MAX_LENGTH) {
    throw new ReviewValidationError(
      'reviewerName',
      `Name must be ${REVIEWER_NAME_MAX_LENGTH} characters or fewer.`,
    );
  }
  return normalized;
};

export const normalizeReviewComment = (value?: string | null): string | undefined => {
  const normalized = normalizeOptionalText(value);
  if (normalized && normalized.length > REVIEW_COMMENT_MAX_LENGTH) {
    throw new ReviewValidationError(
      'comment',
      `Review must be ${REVIEW_COMMENT_MAX_LENGTH} characters or fewer.`,
    );
  }
  return normalized;
};

export const normalizeWhatsappNumber = (value: string): string => {
  let normalized = value.trim().replace(/[\s().-]+/g, '');
  if (normalized.startsWith('00')) {
    normalized = `+${normalized.slice(2)}`;
  }
  if (!WHATSAPP_PATTERN.test(normalized)) {
    throw new ReviewValidationError(
      'reviewerWhatsapp',
      'Enter a valid WhatsApp number with 8 to 15 digits.',
    );
  }
  return normalized;
};

export interface NormalizedSubmitReviewInput {
  providerId: string;
  rating: ReviewRating;
  reviewerWhatsapp: string;
  comment?: string;
  reviewerName?: string;
}

export const normalizeSubmitReviewInput = (input: SubmitReviewInput): NormalizedSubmitReviewInput => {
  const providerId = input.providerId.trim();
  if (!UUID_PATTERN.test(providerId)) {
    throw new ReviewValidationError('providerId', 'A valid provider is required.');
  }

  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new ReviewValidationError('rating', 'Choose a rating from 1 to 5 stars.');
  }

  return {
    providerId,
    rating: input.rating as ReviewRating,
    reviewerWhatsapp: normalizeWhatsappNumber(input.reviewerWhatsapp),
    comment: normalizeReviewComment(input.comment),
    reviewerName: normalizeReviewerName(input.reviewerName),
  };
};
