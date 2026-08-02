export type ReviewRating = 1 | 2 | 3 | 4 | 5;

export interface ProviderReview {
  id: string;
  providerId: string;
  rating: ReviewRating;
  comment: string | null;
  reviewerName: string | null;
  createdAt: string;
}

export type RatingCounts = Record<ReviewRating, number>;

export interface ProviderReviewSummary {
  providerId: string;
  averageRating: number;
  reviewCount: number;
  ratingCounts: RatingCounts;
}

export interface SubmitReviewInput {
  providerId: string;
  // Kept as a number so star controls can pass their natural state value.
  // Runtime validation narrows this to ReviewRating before persistence.
  rating: number;
  reviewerWhatsapp: string;
  comment?: string | null;
  reviewerName?: string | null;
}

export interface GetProviderReviewsOptions {
  limit?: number;
  offset?: number;
}
