import { useEffect, useMemo, useState } from 'react';
import type { ProviderReviewSummary } from '../types';

export type ProviderReviewSummaries = Record<string, ProviderReviewSummary>;

/**
 * Loads every requested provider's aggregate in one RPC call.
 *
 * Review scores are supplemental directory data: an unavailable review
 * migration must never prevent the provider directory itself from rendering.
 */
export const useProviderReviewSummaries = (
  providerIds: string[],
): ProviderReviewSummaries => {
  const providerIdsKey = useMemo(
    () => JSON.stringify(Array.from(new Set(providerIds.filter(Boolean))).sort()),
    [providerIds],
  );
  const [summaries, setSummaries] = useState<ProviderReviewSummaries>({});

  useEffect(() => {
    const requestedProviderIds = JSON.parse(providerIdsKey) as string[];
    let isCurrentRequest = true;

    if (requestedProviderIds.length === 0) {
      setSummaries({});
      return () => {
        isCurrentRequest = false;
      };
    }

    // Keep the optional review service out of the initial directory module
    // graph. This also lets older deployments render while the review
    // migration and client chunk are still unavailable.
    void import('../api/reviewsApi')
      .then(({ getProviderReviewSummaries }) => (
        getProviderReviewSummaries(requestedProviderIds)
      ))
      .then((nextSummaries) => {
        if (isCurrentRequest) setSummaries(nextSummaries);
      })
      .catch(() => {
        // The directory can be deployed before the review SQL migration.
        // In that case, cards simply omit scores until the RPC is available.
        if (isCurrentRequest) setSummaries({});
      });

    return () => {
      isCurrentRequest = false;
    };
  }, [providerIdsKey]);

  return summaries;
};
