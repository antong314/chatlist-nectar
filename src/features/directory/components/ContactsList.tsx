import React from 'react';
import { SearchX } from 'lucide-react';
import { Contact } from '@/types/contact';
import { useProviderReviewSummaries } from '@/features/reviews/hooks/useProviderReviewSummaries';
import { ContactItem } from './ContactItem';

interface ContactsListProps {
  contacts: Contact[];
  onEditContact: (contact: Contact) => void;
  onViewContact: (contact: Contact) => void;
  isLoading: boolean;
}
export function ContactsList({
  contacts,
  onEditContact,
  onViewContact,
  isLoading,
}: ContactsListProps) {
  const providerIds = React.useMemo(
    () => contacts.map((contact) => contact.id),
    [contacts],
  );
  const reviewSummaries = useProviderReviewSummaries(providerIds);

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2" aria-label="Loading providers" aria-busy="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-64 animate-pulse rounded-2xl border border-stone-200 bg-white/75" />
        ))}
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-white/70 px-6 py-14 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--directory-cream)] text-[var(--directory-green)]">
          <SearchX className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 className="mt-4 font-header text-xl font-semibold text-[var(--directory-ink)]">No providers found</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--directory-muted)]">
          Try a broader service, switch categories, or recommend someone the community should know.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {contacts.map((contact) => (
        <ContactItem
          key={contact.id}
          contact={contact}
          reviewSummary={reviewSummaries[contact.id]}
          onEdit={onEditContact}
          onView={onViewContact}
        />
      ))}
    </div>
  );
}
