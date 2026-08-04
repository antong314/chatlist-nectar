import React, { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, LockKeyhole, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  REVIEW_IMAGE_ALLOWED_MIME_TYPES,
  REVIEW_IMAGE_MAX_BYTES,
  REVIEW_IMAGE_MAX_COUNT,
  normalizeWhatsappNumber,
} from '@/features/reviews/validation';
import { StarRating } from './StarRating';
import {
  startWhatsappVerification,
  type WhatsappVerificationChallenge,
} from '@/features/verification';

export interface ReviewFormValues {
  rating: number;
  comment?: string;
  reviewerName?: string;
  whatsappNumber: string;
  images: File[];
}

interface ReviewFormProps {
  providerId: string;
  isSubmitting?: boolean;
  onSubmit: (
    values: ReviewFormValues,
    challenge: WhatsappVerificationChallenge,
    code: string,
  ) => Promise<void>;
}

interface SelectedReviewImage {
  file: File;
  previewUrl: string;
}

const REVIEW_IMAGE_TYPES = new Set<string>(REVIEW_IMAGE_ALLOWED_MIME_TYPES);

export function ReviewForm({ providerId, isSubmitting = false, onSubmit }: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [reviewerName, setReviewerName] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [selectedImages, setSelectedImages] = useState<SelectedReviewImage[]>([]);
  const [imageError, setImageError] = useState('');
  const [formError, setFormError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isRequestingCode, setIsRequestingCode] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationChallenge, setVerificationChallenge] = useState<WhatsappVerificationChallenge | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef(new Set<string>());

  useEffect(() => () => {
    previewUrlsRef.current.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
    previewUrlsRef.current.clear();
  }, []);

  const removeImage = (previewUrl: string) => {
    URL.revokeObjectURL(previewUrl);
    previewUrlsRef.current.delete(previewUrl);
    setSelectedImages((currentImages) =>
      currentImages.filter((image) => image.previewUrl !== previewUrl),
    );
    setImageError('');
  };

  const clearImages = () => {
    selectedImages.forEach(({ previewUrl }) => {
      URL.revokeObjectURL(previewUrl);
      previewUrlsRef.current.delete(previewUrl);
    });
    setSelectedImages([]);
    setImageError('');
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleImageSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    const availableSlots = Math.max(REVIEW_IMAGE_MAX_COUNT - selectedImages.length, 0);
    const nextImages: SelectedReviewImage[] = [];
    const errors = new Set<string>();

    files.forEach((file) => {
      if (nextImages.length >= availableSlots) {
        errors.add(`You can add up to ${REVIEW_IMAGE_MAX_COUNT} images.`);
        return;
      }
      if (!REVIEW_IMAGE_TYPES.has(file.type)) {
        errors.add('Images must be JPEG, PNG, or WebP files.');
        return;
      }
      if (file.size > REVIEW_IMAGE_MAX_BYTES) {
        errors.add('Each image must be 5 MB or smaller.');
        return;
      }

      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current.add(previewUrl);
      nextImages.push({ file, previewUrl });
    });

    if (nextImages.length > 0) {
      setSelectedImages((currentImages) => [...currentImages, ...nextImages]);
    }
    setImageError(Array.from(errors).join(' '));
    event.currentTarget.value = '';
  };

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

    let normalizedWhatsapp: string;
    try {
      normalizedWhatsapp = normalizeWhatsappNumber(whatsappNumber);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Enter a valid WhatsApp number.');
      return;
    }

    const values = {
        rating,
        comment: comment.trim() || undefined,
        reviewerName: reviewerName.trim() || undefined,
        whatsappNumber: normalizedWhatsapp,
        images: selectedImages.map(({ file }) => file),
      };

    try {
      if (!verificationChallenge) {
        setIsRequestingCode(true);
        const challenge = await startWhatsappVerification({
          actionType: 'provider_review',
          phone: values.whatsappNumber,
          payload: {
            providerId,
            rating: values.rating,
            comment: values.comment ?? null,
            reviewerName: values.reviewerName ?? null,
            imageCount: values.images.length,
          },
        });
        setVerificationChallenge(challenge);
        setVerificationCode('');
        return;
      }

      if (!verificationCode.trim()) {
        setFormError('Enter the confirmation code sent to WhatsApp.');
        return;
      }

      await onSubmit(values, verificationChallenge, verificationCode.trim());
      setRating(0);
      setComment('');
      setReviewerName('');
      setWhatsappNumber('');
      clearImages();
      setVerificationCode('');
      setVerificationChallenge(null);
      setSubmitted(true);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Your review could not be submitted. Please try again.');
    } finally {
      setIsRequestingCode(false);
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
          disabled={Boolean(verificationChallenge)}
          placeholder="What should your neighbors know?"
          rows={4}
          value={comment}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="review-images">Photos <span className="font-normal text-gray-500">(optional)</span></Label>
        <div className="rounded-xl border border-dashed border-gray-300 bg-stone-50 p-3">
          <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-primary shadow-sm ring-1 ring-gray-200 transition hover:bg-emerald-50 focus-within:ring-2 focus-within:ring-primary">
            <ImagePlus aria-hidden="true" className="h-4 w-4" />
            {selectedImages.length >= REVIEW_IMAGE_MAX_COUNT ? 'Photo limit reached' : 'Add photos'}
            <input
              accept="image/jpeg,image/png,image/webp"
              aria-describedby="review-images-hint review-images-error"
              aria-invalid={Boolean(imageError)}
              className="sr-only"
              disabled={isSubmitting || Boolean(verificationChallenge) || selectedImages.length >= REVIEW_IMAGE_MAX_COUNT}
              id="review-images"
              multiple
              onChange={handleImageSelection}
              ref={imageInputRef}
              type="file"
            />
          </label>
          <p className="mt-2 text-xs leading-relaxed text-gray-500" id="review-images-hint">
            Up to 4 JPEG, PNG, or WebP images. Maximum 5 MB each.
          </p>
        </div>

        {selectedImages.length > 0 && (
          <ul aria-label="Selected review photos" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {selectedImages.map(({ file, previewUrl }, index) => (
              <li className="group relative aspect-square overflow-hidden rounded-lg bg-gray-100" key={previewUrl}>
                <img
                  alt={`Preview ${index + 1}: ${file.name}`}
                  className="h-full w-full object-cover"
                  src={previewUrl}
                />
                <button
                  aria-label={`Remove ${file.name}`}
                  className="absolute right-1.5 top-1.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white shadow-sm transition hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
                  disabled={isSubmitting || Boolean(verificationChallenge)}
                  onClick={() => removeImage(previewUrl)}
                  type="button"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm font-medium text-red-600" id="review-images-error" role={imageError ? 'alert' : undefined}>
          {imageError}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="reviewer-name">Your name <span className="font-normal text-gray-500">(optional)</span></Label>
        <Input
          autoComplete="name"
          id="reviewer-name"
          maxLength={80}
          onChange={(event) => setReviewerName(event.target.value)}
          disabled={Boolean(verificationChallenge)}
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
          disabled={Boolean(verificationChallenge)}
          placeholder="Include country code, e.g. +506 8888 8888"
          required
          type="tel"
          value={whatsappNumber}
        />
        <p className="flex items-center gap-1.5 text-xs leading-relaxed text-gray-500">
          <LockKeyhole aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          We’ll send a one-time code here to verify your review. Your number stays private and is never shown.
        </p>
      </div>

      {verificationChallenge && (
        <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <Label htmlFor="review-verification-code">WhatsApp confirmation code</Label>
          <Input
            aria-describedby="review-verification-code-hint"
            autoComplete="one-time-code"
            id="review-verification-code"
            inputMode="numeric"
            maxLength={10}
            onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, ''))}
            placeholder="Enter the code"
            required
            value={verificationCode}
          />
          <p className="text-xs leading-relaxed text-gray-500" id="review-verification-code-hint">
            We sent a verification code to {verificationChallenge.phone}. Enter it above to post your review.
          </p>
          <Button
            className="h-auto p-0 text-xs"
            disabled={isSubmitting}
            onClick={() => {
              setVerificationChallenge(null);
              setVerificationCode('');
              setFormError('');
            }}
            type="button"
            variant="link"
          >
            Change number or request a new code
          </Button>
        </div>
      )}

      <div aria-live="polite">
        {formError && <p className="mb-3 text-sm font-medium text-red-600" role="alert">{formError}</p>}
        {submitted && <p className="mb-3 text-sm font-medium text-green-700">Thank you—your review is now part of the community rating.</p>}
      </div>

      <Button className="h-12 w-full rounded-xl text-base" disabled={isSubmitting || isRequestingCode} type="submit">
        {(isSubmitting || isRequestingCode) && <Loader2 aria-hidden="true" className="animate-spin" />}
        {isSubmitting
          ? 'Verifying & posting…'
          : isRequestingCode
            ? 'Sending code…'
            : verificationChallenge
              ? 'Verify & post review'
              : 'Submit review'}
      </Button>
    </form>
  );
}
