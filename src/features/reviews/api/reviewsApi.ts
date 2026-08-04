import { supabase } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import {
  GetProviderReviewsOptions,
  ProviderReview,
  ProviderReviewSummary,
  RatingCounts,
  ReviewRating,
} from '../types';
import {
  normalizeProviderId,
  REVIEW_IMAGE_ALLOWED_MIME_TYPES,
  REVIEW_PAGE_MAX_SIZE,
  validateReviewImageFiles,
} from '../validation';

// The shared Supabase module is the source of truth for client creation.
// Avoid reading `import.meta.env` again here so this API can be isolated or
// mocked by non-Vite test runners.
const isSupabaseConfigured = typeof supabase?.rpc === 'function';
const isReviewStorageConfigured = typeof supabase?.storage?.from === 'function';
export const REVIEW_IMAGES_BUCKET = 'review-images';

interface PublicReviewRow {
  id: string;
  contact_id: string;
  rating: number;
  comment: string | null;
  reviewer_name: string | null;
  created_at: string;
  image_paths: string[] | null;
}

interface ReviewSummaryRow {
  contact_id: string;
  average_rating: number | string | null;
  review_count: number | string | null;
  rating_counts: Partial<Record<string, number | string>> | null;
}

const emptyRatingCounts = (): RatingCounts => ({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });

export const emptyProviderReviewSummary = (providerId: string): ProviderReviewSummary => ({
  providerId,
  averageRating: 0,
  reviewCount: 0,
  ratingCounts: emptyRatingCounts(),
});

const toReviewRating = (rating: number): ReviewRating => {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error('The reviews service returned an invalid rating.');
  }
  return rating as ReviewRating;
};

const getReviewImagePublicUrl = (storagePath: string): string => {
  if (!isReviewStorageConfigured) return '';
  return supabase.storage.from(REVIEW_IMAGES_BUCKET).getPublicUrl(storagePath).data.publicUrl || '';
};

const mapReview = (row: PublicReviewRow): ProviderReview => {
  const imagePaths = (row.image_paths ?? []).filter(
    (storagePath): storagePath is string => typeof storagePath === 'string' && storagePath.length > 0,
  );

  return {
    id: row.id,
    providerId: row.contact_id,
    rating: toReviewRating(Number(row.rating)),
    comment: row.comment,
    reviewerName: row.reviewer_name,
    createdAt: row.created_at,
    imagePaths,
    imageUrls: imagePaths.map(getReviewImagePublicUrl).filter(Boolean),
  };
};

const mapSummary = (row: ReviewSummaryRow): ProviderReviewSummary => {
  const counts = emptyRatingCounts();
  ([1, 2, 3, 4, 5] as ReviewRating[]).forEach((rating) => {
    counts[rating] = Number(row.rating_counts?.[String(rating)] ?? 0);
  });

  return {
    providerId: row.contact_id,
    averageRating: Number(row.average_rating ?? 0),
    reviewCount: Number(row.review_count ?? 0),
    ratingCounts: counts,
  };
};

const databaseError = (operation: string, error: { message?: string } | null): Error =>
  new Error(error?.message || `Unable to ${operation}. Please try again.`);

const REVIEW_IMAGE_EXTENSIONS: Record<(typeof REVIEW_IMAGE_ALLOWED_MIME_TYPES)[number], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Uploads already-validated image blobs and returns ordered Storage object
 * paths for the verified review completion endpoint. The database stores these
 * paths, never bytes.
 */
export const uploadReviewImages = async (
  providerId: string,
  files: File[],
): Promise<string[]> => {
  const normalizedProviderId = normalizeProviderId(providerId);
  const validatedFiles = validateReviewImageFiles(files);
  if (validatedFiles.length === 0) return [];
  if (!isReviewStorageConfigured) {
    throw new Error('Review images cannot be uploaded because storage is not configured.');
  }

  // Validate the complete selection before starting any network upload.
  const uploads = validatedFiles.map((file) => {
    const extension = REVIEW_IMAGE_EXTENSIONS[file.type as keyof typeof REVIEW_IMAGE_EXTENSIONS];
    const storagePath = `${normalizedProviderId}/${uuidv4()}.${extension}`;
    return { file, storagePath };
  });

  await Promise.all(uploads.map(async ({ file, storagePath }) => {
    const { error } = await supabase.storage
      .from(REVIEW_IMAGES_BUCKET)
      .upload(storagePath, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: false,
      });

    if (error) throw databaseError('upload a review image', error);
  }));

  return uploads.map(({ storagePath }) => storagePath);
};

export const getProviderReviews = async (
  providerId: string,
  options: GetProviderReviewsOptions = {},
): Promise<ProviderReview[]> => {
  if (!isSupabaseConfigured) return [];

  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 20), 1), REVIEW_PAGE_MAX_SIZE);
  const offset = Math.max(Math.trunc(options.offset ?? 0), 0);
  const { data, error } = await supabase.rpc('get_provider_reviews', {
    p_contact_id: providerId,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) throw databaseError('load reviews', error);
  return ((data ?? []) as PublicReviewRow[]).map(mapReview);
};

export const getProviderReviewSummary = async (
  providerId: string,
): Promise<ProviderReviewSummary> => {
  if (!isSupabaseConfigured) return emptyProviderReviewSummary(providerId);

  const { data, error } = await supabase.rpc('get_provider_review_summary', {
    p_contact_id: providerId,
  });

  if (error) throw databaseError('load the review summary', error);
  const row = (data as ReviewSummaryRow[] | null)?.[0];
  return row ? mapSummary(row) : emptyProviderReviewSummary(providerId);
};

export const getProviderReviewSummaries = async (
  providerIds?: string[],
): Promise<Record<string, ProviderReviewSummary>> => {
  const uniqueProviderIds = providerIds ? Array.from(new Set(providerIds)) : undefined;
  if (uniqueProviderIds?.length === 0) return {};
  if (!isSupabaseConfigured) {
    return Object.fromEntries(
      (uniqueProviderIds ?? []).map((providerId) => [providerId, emptyProviderReviewSummary(providerId)]),
    );
  }

  const { data, error } = await supabase.rpc('get_provider_review_summaries', {
    p_contact_ids: uniqueProviderIds ?? null,
  });

  if (error) throw databaseError('load review summaries', error);

  const summaries = Object.fromEntries(
    ((data ?? []) as ReviewSummaryRow[]).map((row) => {
      const summary = mapSummary(row);
      return [summary.providerId, summary];
    }),
  );

  uniqueProviderIds?.forEach((providerId) => {
    summaries[providerId] ??= emptyProviderReviewSummary(providerId);
  });
  return summaries;
};
