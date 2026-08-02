import { useCallback, useState } from 'react';
import { submitProviderReview } from '../api';
import { ProviderReview, SubmitReviewInput } from '../types';

export interface UseSubmitReviewOptions {
  onSuccess?: (review: ProviderReview) => void | Promise<void>;
}

export interface UseSubmitReviewResult {
  submitReview: (input: SubmitReviewInput) => Promise<ProviderReview>;
  isSubmitting: boolean;
  error: Error | null;
}

export const useSubmitReview = (
  options: UseSubmitReviewOptions = {},
): UseSubmitReviewResult => {
  const { onSuccess } = options;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const submitReview = useCallback(async (input: SubmitReviewInput) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const review = await submitProviderReview(input);
      await onSuccess?.(review);
      return review;
    } catch (caughtError) {
      const nextError = caughtError instanceof Error
        ? caughtError
        : new Error('Unable to submit your review.');
      setError(nextError);
      throw nextError;
    } finally {
      setIsSubmitting(false);
    }
  }, [onSuccess]);

  return { submitReview, isSubmitting, error };
};
