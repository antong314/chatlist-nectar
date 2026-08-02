import { supabase } from '@/lib/supabase';
import {
  GetProviderReviewsOptions,
  ProviderReview,
  ProviderReviewSummary,
  RatingCounts,
  ReviewRating,
  SubmitReviewInput,
} from '../types';
import { normalizeSubmitReviewInput, REVIEW_PAGE_MAX_SIZE } from '../validation';

// The shared Supabase module is the source of truth for client creation.
// Avoid reading `import.meta.env` again here so this API can be isolated or
// mocked by non-Vite test runners.
const isSupabaseConfigured = typeof supabase?.rpc === 'function';

interface PublicReviewRow {
  id: string;
  contact_id: string;
  rating: number;
  comment: string | null;
  reviewer_name: string | null;
  created_at: string;
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

const mapReview = (row: PublicReviewRow): ProviderReview => ({
  id: row.id,
  providerId: row.contact_id,
  rating: toReviewRating(Number(row.rating)),
  comment: row.comment,
  reviewerName: row.reviewer_name,
  createdAt: row.created_at,
});

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

export const submitProviderReview = async (input: SubmitReviewInput): Promise<ProviderReview> => {
  const normalized = normalizeSubmitReviewInput(input);
  if (!isSupabaseConfigured) {
    throw new Error('Reviews cannot be submitted because the database is not configured.');
  }

  const { data, error } = await supabase.rpc('submit_provider_review', {
    p_contact_id: normalized.providerId,
    p_rating: normalized.rating,
    p_reviewer_whatsapp: normalized.reviewerWhatsapp,
    p_comment: normalized.comment ?? null,
    p_reviewer_name: normalized.reviewerName ?? null,
  });

  if (error) throw databaseError('submit your review', error);
  const row = (data as PublicReviewRow[] | null)?.[0];
  if (!row) throw new Error('The review was not saved. Please try again.');
  return mapReview(row);
};
