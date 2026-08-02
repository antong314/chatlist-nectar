import React, { FormEvent, useState } from 'react';
import { Loader2, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StarRating } from './StarRating';

export interface ReviewFormValues {
  rating: number;
  comment?: string;
  reviewerName?: string;
  whatsappNumber: string;
}

interface ReviewFormProps {
  isSubmitting?: boolean;
  onSubmit: (values: ReviewFormValues) => Promise<void>;
}

export function ReviewForm({ isSubmitting = false, onSubmit }: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [reviewerName, setReviewerName] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [formError, setFormError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(false);

    if (rating < 1) {
      setFormError('Choose a star rating before submitting.');
      return;
    }

    if (!whatsappNumber.trim()) {
      setFormError('Enter your WhatsApp number.');
      return;
    }

    setFormError('');

    try {
      await onSubmit({
        rating,
        comment: comment.trim() || undefined,
        reviewerName: reviewerName.trim() || undefined,
        whatsappNumber: whatsappNumber.trim(),
      });
      setRating(0);
      setComment('');
      setReviewerName('');
      setWhatsappNumber('');
      setSubmitted(true);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Your review could not be submitted. Please try again.');
    }
  };

  return (
    <form className="space-y-5" noValidate onSubmit={handleSubmit}>
      <div>
        <StarRating label="Your rating" onChange={setRating} size="lg" value={rating} />
        <p className="mt-1 text-sm text-gray-500">Tap a star to rate this provider.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="review-comment">Your experience <span className="font-normal text-gray-500">(optional)</span></Label>
        <Textarea
          id="review-comment"
          maxLength={1000}
          onChange={(event) => setComment(event.target.value)}
          placeholder="What should your neighbors know?"
          rows={4}
          value={comment}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="reviewer-name">Your name <span className="font-normal text-gray-500">(optional)</span></Label>
        <Input
          autoComplete="name"
          id="reviewer-name"
          maxLength={80}
          onChange={(event) => setReviewerName(event.target.value)}
          placeholder="Leave blank to post anonymously"
          value={reviewerName}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="reviewer-whatsapp">WhatsApp number</Label>
        <Input
          autoComplete="tel"
          id="reviewer-whatsapp"
          inputMode="tel"
          maxLength={32}
          onChange={(event) => setWhatsappNumber(event.target.value)}
          placeholder="Include country code, e.g. +506 8888 8888"
          required
          type="tel"
          value={whatsappNumber}
        />
        <p className="flex items-center gap-1.5 text-xs leading-relaxed text-gray-500">
          <LockKeyhole aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          Your number stays private and is never shown with your review.
        </p>
      </div>

      <div aria-live="polite">
        {formError && <p className="mb-3 text-sm font-medium text-red-600" role="alert">{formError}</p>}
        {submitted && <p className="mb-3 text-sm font-medium text-green-700">Thank you—your review is now part of the community rating.</p>}
      </div>

      <Button className="h-12 w-full rounded-xl text-base" disabled={isSubmitting} type="submit">
        {isSubmitting && <Loader2 aria-hidden="true" className="animate-spin" />}
        {isSubmitting ? 'Posting review…' : 'Post review'}
      </Button>
    </form>
  );
}
