import React from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StarRatingProps {
  value: number;
  onChange?: (rating: number) => void;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-8 w-8',
};

export function StarRating({
  value,
  onChange,
  label = 'Rating',
  size = 'md',
  disabled = false,
}: StarRatingProps) {
  const roundedValue = Math.round(value);

  if (!onChange) {
    return (
      <div
        aria-label={`${value.toFixed(1)} out of 5 stars`}
        className="flex items-center gap-0.5"
        role="img"
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            aria-hidden="true"
            className={cn(
              sizeClasses[size],
              star <= roundedValue
                ? 'fill-amber-400 text-amber-400'
                : 'fill-transparent text-gray-300',
            )}
            key={star}
          />
        ))}
      </div>
    );
  }

  return (
    <fieldset disabled={disabled}>
      <legend className="mb-2 text-sm font-semibold text-gray-900">{label}</legend>
      <div aria-label={label} className="flex gap-1" role="radiogroup">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            aria-checked={value === star}
            aria-label={`${star} ${star === 1 ? 'star' : 'stars'}`}
            className="rounded-md p-1 text-amber-400 transition hover:scale-105 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 disabled:hover:bg-transparent"
            key={star}
            onClick={() => onChange(star)}
            role="radio"
            type="button"
          >
            <Star
              aria-hidden="true"
              className={cn(
                sizeClasses[size],
                star <= value ? 'fill-amber-400' : 'fill-transparent text-gray-300',
              )}
            />
          </button>
        ))}
      </div>
    </fieldset>
  );
}
