import React from 'react';
import { ArrowLeft, ExternalLink, Map, Share2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Contact } from '@/features/directory/types/contact';
import { AvatarFallback } from '@/components/ui/avatar-fallback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getDirectoryCategoryLabel } from '@/features/directory/data/categories';
import { getSafeExternalUrl } from '@/lib/urls';
import { StarRating } from './StarRating';

interface ProviderHeroProps {
  averageRating: number;
  contact: Contact;
  onShare: () => void;
  reviewCount: number;
  shareStatus?: string;
}

const createWhatsAppUrl = (contact: Contact) => {
  const number = contact.phone?.replace(/\D/g, '') || '';
  if (number.length < 8 || number.length > 15) return '';

  const message = `Hi ${contact.name}, I found you on San Mateo Love.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
};

export function ProviderHero({
  averageRating,
  contact,
  onShare,
  reviewCount,
  shareStatus,
}: ProviderHeroProps) {
  const whatsappUrl = createWhatsAppUrl(contact);
  const websiteUrl = getSafeExternalUrl(contact.website);
  const mapUrl = getSafeExternalUrl(contact.mapUrl);
  const logoUrl = contact.image_url || contact.logoUrl || contact.avatarUrl;

  return (
    <>
      <Link
        className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-gray-600 transition hover:bg-white hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        to="/"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Back to directory
      </Link>

      <section className="overflow-hidden rounded-3xl bg-white shadow-sm">
        <div className="h-2 bg-gradient-to-r from-primary via-emerald-500 to-sky-400" />
        <div className="p-5 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <AvatarFallback className="h-20 w-20 shrink-0 text-xl sm:h-24 sm:w-24" logoUrl={logoUrl || undefined} name={contact.name} />

            <div className="min-w-0 flex-1">
              <Badge className="mb-3 bg-emerald-50 text-emerald-800 hover:bg-emerald-50">
                {getDirectoryCategoryLabel(contact.category)}
              </Badge>
              <h1 className="break-words text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">{contact.name}</h1>

              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
                {reviewCount > 0 ? (
                  <>
                    <StarRating size="sm" value={averageRating} />
                    <span className="font-semibold text-gray-900">{averageRating.toFixed(1)}</span>
                    <a className="text-sm text-gray-600 underline-offset-4 hover:underline" href="#reviews">
                      {reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}
                    </a>
                  </>
                ) : (
                  <a className="text-sm font-medium text-primary underline-offset-4 hover:underline" href="#leave-a-review">Be the first to review</a>
                )}
              </div>
            </div>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            {whatsappUrl ? (
              <Button asChild className="h-14 rounded-xl bg-[#25D366] text-base font-bold text-white shadow-sm hover:bg-[#1fb85a]">
                <a href={whatsappUrl} rel="noopener noreferrer" target="_blank">
                  <img alt="" aria-hidden="true" className="h-5 w-5" src="/icons8-whatsapp.svg" />
                  Message on WhatsApp
                </a>
              </Button>
            ) : (
              <Button className="h-14 rounded-xl text-base" disabled>WhatsApp unavailable</Button>
            )}
            <Button className="h-14 rounded-xl px-5 text-base" onClick={onShare} type="button" variant="outline">
              <Share2 aria-hidden="true" />
              Share
            </Button>
          </div>
          {shareStatus && <p aria-live="polite" className="mt-2 text-center text-sm text-gray-600 sm:text-right">{shareStatus}</p>}

          {(websiteUrl || mapUrl) && (
            <div className="mt-4 flex flex-wrap gap-4 border-t pt-4 text-sm font-semibold">
              {websiteUrl && (
                <a className="inline-flex min-h-11 items-center gap-2 text-primary hover:underline" href={websiteUrl} rel="noopener noreferrer" target="_blank">
                  <ExternalLink aria-hidden="true" className="h-4 w-4" />
                  Visit website
                </a>
              )}
              {mapUrl && (
                <a className="inline-flex min-h-11 items-center gap-2 text-primary hover:underline" href={mapUrl} rel="noopener noreferrer" target="_blank">
                  <Map aria-hidden="true" className="h-4 w-4" />
                  View map
                </a>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
