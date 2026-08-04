import { ReviewRating, SubmitReviewInput } from './types';

export const REVIEW_COMMENT_MAX_LENGTH = 1000;
export const REVIEWER_NAME_MAX_LENGTH = 80;
export const REVIEW_PAGE_MAX_SIZE = 100;
export const REVIEW_IMAGE_MAX_COUNT = 4;
export const REVIEW_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const REVIEW_IMAGE_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WHATSAPP_PATTERN = /^\+[1-9][0-9]{7,14}$/;
const REVIEW_IMAGE_PATH_SUFFIX_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$/;

export type ReviewField = 'providerId' | 'rating' | 'comment' | 'reviewerName' | 'reviewerWhatsapp' | 'imagePaths' | 'images';

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
      'Enter your WhatsApp number with country code, for example +506 8888 8888.',
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
  imagePaths: string[];
}

export const normalizeProviderId = (value: string): string => {
  const providerId = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(providerId)) {
    throw new ReviewValidationError('providerId', 'A valid provider is required.');
  }
  return providerId;
};

export const normalizeReviewImagePaths = (
  providerId: string,
  paths: string[] | null | undefined,
): string[] => {
  const normalizedProviderId = normalizeProviderId(providerId);
  const normalizedPaths = (paths ?? []).map((path) => path.trim());

  if (normalizedPaths.length > REVIEW_IMAGE_MAX_COUNT) {
    throw new ReviewValidationError(
      'imagePaths',
      `A review can include at most ${REVIEW_IMAGE_MAX_COUNT} images.`,
    );
  }

  if (new Set(normalizedPaths).size !== normalizedPaths.length) {
    throw new ReviewValidationError('imagePaths', 'Review image paths must be unique.');
  }

  const hasInvalidPath = normalizedPaths.some((path) => {
    const [pathProviderId, fileName, extraSegment] = path.split('/');
    return Boolean(extraSegment)
      || pathProviderId !== normalizedProviderId
      || !REVIEW_IMAGE_PATH_SUFFIX_PATTERN.test(fileName ?? '');
  });

  if (hasInvalidPath) {
    throw new ReviewValidationError(
      'imagePaths',
      'Review images must use the provider/image path format and an allowed extension.',
    );
  }

  return normalizedPaths;
};

export const validateReviewImageFiles = (files: File[]): File[] => {
  const validatedFiles = [...files];

  if (validatedFiles.length > REVIEW_IMAGE_MAX_COUNT) {
    throw new ReviewValidationError(
      'images',
      `A review can include at most ${REVIEW_IMAGE_MAX_COUNT} images.`,
    );
  }

  validatedFiles.forEach((file) => {
    if (!(REVIEW_IMAGE_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
      throw new ReviewValidationError(
        'images',
        'Review images must be JPEG, PNG, or WebP files.',
      );
    }

    if (file.size > REVIEW_IMAGE_MAX_BYTES) {
      throw new ReviewValidationError('images', 'Each review image must be 5 MiB or smaller.');
    }
  });

  return validatedFiles;
};

export const normalizeSubmitReviewInput = (input: SubmitReviewInput): NormalizedSubmitReviewInput => {
  const providerId = normalizeProviderId(input.providerId);

  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new ReviewValidationError('rating', 'Choose a rating from 1 to 5 stars.');
  }

  return {
    providerId,
    rating: input.rating as ReviewRating,
    reviewerWhatsapp: normalizeWhatsappNumber(input.reviewerWhatsapp),
    comment: normalizeReviewComment(input.comment),
    reviewerName: normalizeReviewerName(input.reviewerName),
    imagePaths: normalizeReviewImagePaths(providerId, input.imagePaths),
  };
};
