import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Edit3, ExternalLink, Globe2, Map, Share2, Star } from 'lucide-react';
import { toast } from 'sonner';
import { Contact } from '@/types/contact';
import { categoryIconMap } from '@/features/directory/data/categoryIcons';
import { getDirectoryCategoryLabel } from '@/features/directory/data/categories';
import { AvatarFallback } from '@/components/ui/avatar-fallback';
import { getSafeExternalUrl } from '@/lib/urls';
import type { ProviderReviewSummary } from '@/features/reviews/types';

interface ContactItemProps {
  contact: Contact;
  reviewSummary?: ProviderReviewSummary;
  onEdit: (contact: Contact) => void;
  onView: (contact: Contact) => void;
}

export function ContactItem({ contact, reviewSummary, onEdit, onView }: ContactItemProps) {
  const navigate = useNavigate();
  const websiteUrl = getSafeExternalUrl(contact.website);
  const mapUrl = getSafeExternalUrl(contact.mapUrl);
  const reviewCount = reviewSummary?.reviewCount ?? 0;
  const averageRating = reviewSummary?.averageRating ?? 0;
  const CategoryIcon = categoryIconMap[contact.category];
  const providerPath = `/provider/${encodeURIComponent(contact.id)}`;
  const whatsappNumber = contact.phone?.replace(/\D/g, '') ?? '';
  const canMessageOnWhatsApp = whatsappNumber.length >= 8;

  const openWhatsApp = () => {
    if (!canMessageOnWhatsApp) return;
    const message = encodeURIComponent(`Hi ${contact.name}, I found you through San Mateo Love. Are you available?`);
    window.open(`https://wa.me/${whatsappNumber}?text=${message}`, '_blank', 'noopener,noreferrer');
  };

  const copyProviderUrl = async (providerUrl: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(providerUrl);
      return;
    }

    const temporaryInput = document.createElement('textarea');
    temporaryInput.value = providerUrl;
    temporaryInput.setAttribute('readonly', '');
    temporaryInput.style.position = 'fixed';
    temporaryInput.style.opacity = '0';
    document.body.appendChild(temporaryInput);
    temporaryInput.select();
    const copied = document.execCommand('copy');
    temporaryInput.remove();

    if (!copied) throw new Error('Copy is not supported');
  };

  const shareProvider = async () => {
    const providerUrl = new URL(providerPath, window.location.origin).toString();
    const shareData = {
      title: `${contact.name} · San Mateo Love`,
      text: `${contact.name} — shared from the San Mateo community directory.`,
      url: providerUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }

      await copyProviderUrl(providerUrl);
      toast.success('Provider link copied');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      toast.error('Could not share this provider');
    }
  };

  return (
    <article className="provider-card">
      <button
        type="button"
        onClick={() => onView(contact)}
        className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--directory-green)]"
        aria-label={`Quick view for ${contact.name}`}
      >
        <div className="flex items-start gap-3 p-4 pb-3 sm:p-5 sm:pb-3">
          <AvatarFallback
            name={contact.name}
            logoUrl={contact.image_url || contact.logoUrl || contact.avatarUrl}
            className="h-14 w-14 shrink-0 border-2 border-white shadow-sm sm:h-16 sm:w-16"
          />

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h2 className="truncate font-header text-lg font-semibold text-[var(--directory-ink)] sm:text-xl">
                {contact.name}
              </h2>
              <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-stone-300" aria-hidden="true" />
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="directory-category-badge">
                {CategoryIcon && <CategoryIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                {getDirectoryCategoryLabel(contact.category)}
              </span>
              {reviewCount > 0 ? (
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--directory-ink)]">
                  <Star className="h-4 w-4 fill-[var(--directory-sun)] text-[var(--directory-sun)]" aria-hidden="true" />
                  {Math.max(0, Math.min(5, averageRating)).toFixed(1)}
                  <span className="font-normal text-[var(--directory-muted)]">
                    · {reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}
                  </span>
                </span>
              ) : (
                <span className="text-xs font-medium text-[var(--directory-muted)]">No reviews yet</span>
              )}
            </div>
          </div>
        </div>

        <p className="line-clamp-2 min-h-[2.5rem] px-4 text-sm leading-5 text-[var(--directory-muted)] sm:px-5">
          {contact.description || 'A local provider shared by the community.'}
        </p>
      </button>

      <div className="mt-4 border-t border-stone-100 px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
        {canMessageOnWhatsApp ? (
          <button type="button" onClick={openWhatsApp} className="whatsapp-primary-btn">
            <img src="/icons8-whatsapp.svg" alt="" className="h-5 w-5" />
            Message on WhatsApp
          </button>
        ) : (
          <div className="flex min-h-11 items-center justify-center rounded-xl bg-stone-100 text-sm font-medium text-stone-500">
            No WhatsApp number listed
          </div>
        )}

        <div className="mt-2 flex items-center gap-1">
          <button
            type="button"
            onClick={() => navigate(providerPath)}
            className="provider-secondary-btn mr-auto"
          >
            View details
          </button>

          <button type="button" onClick={shareProvider} className="provider-icon-btn" aria-label={`Share ${contact.name}`}>
            <Share2 className="h-4 w-4" aria-hidden="true" />
          </button>

          {websiteUrl && (
            <a
              href={websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="provider-icon-btn"
              aria-label={`Visit ${contact.name} website`}
            >
              <Globe2 className="h-4 w-4" aria-hidden="true" />
            </a>
          )}

          {mapUrl && (
            <a
              href={mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="provider-icon-btn"
              aria-label={`Open map for ${contact.name}`}
            >
              <Map className="h-4 w-4" aria-hidden="true" />
            </a>
          )}

          <button
            type="button"
            onClick={() => onEdit(contact)}
            className="provider-icon-btn"
            aria-label={`Edit ${contact.name}`}
            title="Edit listing"
          >
            <Edit3 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}
