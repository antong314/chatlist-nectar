import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, HeartHandshake } from 'lucide-react';
import { Contact } from '@/features/directory/types/contact';
import {
  ProviderHero,
  ProviderReviews,
  ReviewForm,
  type ReviewFormValues,
} from '@/features/directory/components/provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useProviderReviews, useSubmitReview } from '@/features/reviews';
import { getDirectoryCategoryLabel } from '@/features/directory/data/categories';

interface ContactRow {
  id: string;
  title: string | null;
  subtitle: string | null;
  category: string | null;
  phone_number: string | null;
  website_url: string | null;
  map_url: string | null;
  image_url: string | null;
}

const toContact = (row: ContactRow): Contact => ({
  id: row.id,
  name: row.title?.trim() || 'Unnamed provider',
  description: row.subtitle?.trim() || '',
  category: row.category?.trim() || 'Service',
  phone: row.phone_number?.trim() || '',
  website: row.website_url?.trim() || '',
  mapUrl: row.map_url?.trim() || '',
  image_url: row.image_url,
  logoUrl: row.image_url || undefined,
  avatarUrl: row.image_url || undefined,
});

export function ProviderPage() {
  const { providerId = '' } = useParams<{ providerId: string }>();
  const [contact, setContact] = useState<Contact | null>(null);
  const [isLoadingContact, setIsLoadingContact] = useState(true);
  const [contactError, setContactError] = useState('');
  const [shareStatus, setShareStatus] = useState('');
  const { reviews, summary, isLoading: isLoadingReviews, error: reviewsError, reload } = useProviderReviews(providerId);
  const { submitReview, isSubmitting } = useSubmitReview({ onSuccess: reload });

  useEffect(() => {
    let isCurrent = true;

    const loadContact = async () => {
      if (!providerId) {
        setContactError('This provider link is incomplete.');
        setIsLoadingContact(false);
        return;
      }

      setIsLoadingContact(true);
      setContactError('');

      const { data, error } = await supabase
        .from('contacts')
        .select('id, title, subtitle, category, phone_number, website_url, map_url, image_url')
        .eq('id', providerId)
        .eq('is_deleted', false)
        .maybeSingle();

      if (!isCurrent) return;

      if (error) {
        setContactError('We could not load this provider right now.');
        setContact(null);
      } else if (!data) {
        setContactError('This provider could not be found.');
        setContact(null);
      } else {
        setContact(toContact(data as ContactRow));
      }

      setIsLoadingContact(false);
    };

    void loadContact();

    return () => {
      isCurrent = false;
    };
  }, [providerId]);

  useEffect(() => {
    if (!contact) return;
    const previousTitle = document.title;
    document.title = `${contact.name} | San Mateo Love`;
    return () => {
      document.title = previousTitle;
    };
  }, [contact]);

  const handleShare = async () => {
    if (!contact) return;

    const shareData = {
      title: `${contact.name} | San Mateo Love`,
      text: `${contact.name} — ${getDirectoryCategoryLabel(contact.category)} on San Mateo Love`,
      url: window.location.href,
    };

    setShareStatus('');

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        setShareStatus('Shared');
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(shareData.url);
      setShareStatus('Link copied');
    } catch {
      setShareStatus('Copy the link from your browser to share it.');
    }
  };

  const handleReviewSubmit = async (values: ReviewFormValues) => {
    await submitReview({
      providerId,
      rating: values.rating,
      comment: values.comment,
      reviewerName: values.reviewerName,
      reviewerWhatsapp: values.whatsappNumber,
    });
  };

  if (isLoadingContact) {
    return (
      <main aria-label="Loading provider" className="min-h-screen bg-[#f5f3ec] px-4 py-8" role="status">
        <div className="mx-auto max-w-5xl animate-pulse">
          <div className="mb-5 h-10 w-40 rounded-lg bg-stone-200" />
          <div className="h-80 rounded-3xl bg-white" />
        </div>
      </main>
    );
  }

  if (!contact) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f3ec] px-4 py-12">
        <div className="max-w-md text-center">
          <AlertCircle aria-hidden="true" className="mx-auto mb-4 h-10 w-10 text-primary" />
          <h1 className="text-2xl font-bold text-gray-950">Provider unavailable</h1>
          <p className="mt-2 text-gray-600">{contactError}</p>
          <Button asChild className="mt-6">
            <Link to="/"><ArrowLeft aria-hidden="true" />Back to directory</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f3ec] px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <ProviderHero
          averageRating={summary.averageRating}
          contact={contact}
          onShare={handleShare}
          reviewCount={summary.reviewCount}
          shareStatus={shareStatus}
        />

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
          <div className="space-y-6">
            {contact.description && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xl">About {contact.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap leading-7 text-gray-700">{contact.description}</p>
                </CardContent>
              </Card>
            )}

            <section id="reviews" aria-labelledby="reviews-heading">
              <h2 className="sr-only" id="reviews-heading">Reviews for {contact.name}</h2>
              {reviewsError && (
                <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                  Reviews could not be loaded. Please try again later.
                </p>
              )}
              <ProviderReviews
                averageRating={summary.averageRating}
                isLoading={isLoadingReviews}
                reviews={reviews}
              />
            </section>
          </div>

          <Card className="border-0 shadow-sm lg:sticky lg:top-6" id="leave-a-review">
            <CardHeader>
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-primary">
                <HeartHandshake aria-hidden="true" className="h-5 w-5" />
              </div>
              <CardTitle className="text-xl">Share your experience</CardTitle>
              <p className="text-sm leading-6 text-gray-600">A quick rating helps your neighbors choose with confidence.</p>
            </CardHeader>
            <CardContent>
              <ReviewForm isSubmitting={isSubmitting} onSubmit={handleReviewSubmit} />
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
