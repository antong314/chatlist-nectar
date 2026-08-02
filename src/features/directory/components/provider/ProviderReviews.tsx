import React from 'react';
import { MessageSquareText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StarRating } from './StarRating';

export interface ProviderReviewView {
  id: string;
  rating: number;
  comment?: string | null;
  reviewerName?: string | null;
  createdAt: string;
}

interface ProviderReviewsProps {
  averageRating: number;
  isLoading?: boolean;
  reviews: ProviderReviewView[];
}

const formatReviewDate = (date: string) => {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '';

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    year: 'numeric',
  }).format(parsed);
};

export function ProviderReviews({ averageRating, isLoading = false, reviews }: ProviderReviewsProps) {
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-primary">Community reviews</p>
            <CardTitle className="text-xl">What neighbors say</CardTitle>
          </div>
          {reviews.length > 0 && (
            <div className="text-right">
              <p className="text-2xl font-bold text-gray-900">{averageRating.toFixed(1)}</p>
              <StarRating size="sm" value={averageRating} />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div aria-label="Loading reviews" className="space-y-4" role="status">
            {[1, 2].map((item) => (
              <div className="animate-pulse border-t py-5 first:border-t-0 first:pt-0" key={item}>
                <div className="mb-3 h-4 w-28 rounded bg-gray-200" />
                <div className="h-4 w-full rounded bg-gray-100" />
              </div>
            ))}
          </div>
        ) : reviews.length === 0 ? (
          <div className="rounded-xl bg-stone-50 px-5 py-8 text-center">
            <MessageSquareText aria-hidden="true" className="mx-auto mb-3 h-7 w-7 text-primary" />
            <p className="font-semibold text-gray-900">No reviews yet</p>
            <p className="mt-1 text-sm text-gray-600">Be the first neighbor to share an experience.</p>
          </div>
        ) : (
          <ol>
            {reviews.map((review) => (
              <li className="border-t py-5 first:border-t-0 first:pt-0 last:pb-0" key={review.id}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-gray-900">{review.reviewerName?.trim() || 'Anonymous neighbor'}</p>
                    <StarRating size="sm" value={review.rating} />
                  </div>
                  <time className="shrink-0 text-xs text-gray-500" dateTime={review.createdAt}>
                    {formatReviewDate(review.createdAt)}
                  </time>
                </div>
                {review.comment && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">{review.comment}</p>}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
