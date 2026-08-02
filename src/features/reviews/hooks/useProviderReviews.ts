import { useCallback, useEffect, useState } from 'react';
import {
  emptyProviderReviewSummary,
  getProviderReviews,
  getProviderReviewSummary,
} from '../api';
import { ProviderReview, ProviderReviewSummary } from '../types';

export interface UseProviderReviewsResult {
  reviews: ProviderReview[];
  summary: ProviderReviewSummary;
  isLoading: boolean;
  error: Error | null;
  reload: () => Promise<void>;
}

export const useProviderReviews = (providerId: string): UseProviderReviewsResult => {
  const [reviews, setReviews] = useState<ProviderReview[]>([]);
  const [summary, setSummary] = useState<ProviderReviewSummary>(
    emptyProviderReviewSummary(providerId),
  );
  const [isLoading, setIsLoading] = useState(Boolean(providerId));
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    if (!providerId) {
      setReviews([]);
      setSummary(emptyProviderReviewSummary(''));
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const [nextReviews, nextSummary] = await Promise.all([
        getProviderReviews(providerId),
        getProviderReviewSummary(providerId),
      ]);
      setReviews(nextReviews);
      setSummary(nextSummary);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError : new Error('Unable to load reviews.'));
    } finally {
      setIsLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { reviews, summary, isLoading, error, reload: load };
};
