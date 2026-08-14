import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  CategoryFilter,
  ContactForm,
  ContactsHeader,
  ContactsList,
} from '@/features/directory/components';
import { useContacts } from '@/hooks/useContacts';
import { Contact } from '@/types/contact';
import { trackEvent, trackPageView } from '@/utils/analytics';
import type { ProviderDeletionRequest } from '@/features/directory/components/ProviderDeletionDialog';
import type { ProviderWriteVerification } from '@/features/directory/components/ContactForm';

const getUndoToastDuration = (undoExpiresAt: string) => {
  const remainingMilliseconds = new Date(undoExpiresAt).getTime() - Date.now();
  return Number.isFinite(remainingMilliseconds) && remainingMilliseconds > 0
    ? remainingMilliseconds
    : 10_000;
};

const getUndoErrorMessage = (error: unknown) =>
  error instanceof Error && error.message
    ? error.message
    : 'This Undo link has expired or was already used. Refresh the directory to check the listing.';

const Index = () => {
  const {
    contacts,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    uniqueCategories,
    refreshContacts,
    addContact,
    updateContact,
    deleteContact,
    undoDelete,
  } = useContacts();
  const [searchParams, setSearchParams] = useSearchParams();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact>();
  const editProviderId = searchParams.get('edit');
  const categories = uniqueCategories ?? [
    'All',
    ...Array.from(new Set(contacts.map((contact) => contact.category))),
  ];

  useEffect(() => {
    trackPageView('/directory', 'San Mateo Love Directory');
  }, []);

  const setEditProviderParam = useCallback((providerId?: string) => {
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);
      if (providerId) nextParams.set('edit', providerId);
      else nextParams.delete('edit');
      return nextParams;
    }, { replace: true });
  }, [setSearchParams]);

  const handleOpenForm = () => {
    setEditProviderParam();
    setEditingContact(undefined);
    setIsFormOpen(true);
  };

  const handleCloseForm = useCallback(() => {
    setEditProviderParam();
    setIsFormOpen(false);
    setEditingContact(undefined);
  }, [setEditProviderParam]);

  const handleEditContact = (contact: Contact) => {
    setEditProviderParam(contact.id);
    setEditingContact(contact);
    setIsFormOpen(true);
  };

  useEffect(() => {
    if (!editProviderId || loading) return;

    const providerToEdit = contacts.find((contact) => contact.id === editProviderId);
    if (!providerToEdit) {
      setEditProviderParam();
      return;
    }

    setEditingContact(providerToEdit);
    setIsFormOpen(true);
  }, [contacts, editProviderId, loading, setEditProviderParam]);

  const handleSaveContact = async (
    contact: Omit<Contact, 'id'> | Contact,
    verification: ProviderWriteVerification,
  ) => {
    if ('id' in contact) {
      const success = await updateContact(contact, verification);
      if (success) {
        handleCloseForm();
        trackEvent('Directory', 'Update Contact', contact.name);
      }
      return;
    }

    const success = await addContact(contact, verification);
    if (success) {
      handleCloseForm();
      trackEvent('Directory', 'Add Contact', contact.name);
    }
  };

  const handleDeleteContact = async (request: ProviderDeletionRequest) => {
    const contactToDelete = contacts.find((contact) => contact.id === request.providerId);
    const deletionReceipt = await deleteContact(request);
    handleCloseForm();
    trackEvent('Directory', 'Delete Contact', contactToDelete?.name ?? request.providerId);

    let undoRequested = false;
    const removalToastId = toast.success('Listing removed', {
      description: 'The provider is hidden and can be restored for a short time.',
      duration: getUndoToastDuration(deletionReceipt.undoExpiresAt),
      action: {
        label: 'Undo',
        onClick: (event) => {
          event.preventDefault();
          if (undoRequested) return;
          undoRequested = true;

          void undoDelete({
            eventId: deletionReceipt.eventId,
            undoToken: deletionReceipt.undoToken,
          }).then(() => {
            toast.dismiss(removalToastId);
            refreshContacts();
            toast.success('Listing restored', {
              description: 'The provider is visible in the community directory again.',
            });
          }).catch((error: unknown) => {
            undoRequested = false;
            toast.error('Could not restore listing', {
              description: getUndoErrorMessage(error),
            });
          });
        },
      },
    });
  };

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isFormOpen) handleCloseForm();
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [handleCloseForm, isFormOpen]);

  useEffect(() => {
    const context = [
      searchQuery || null,
      selectedCategory !== 'All' ? selectedCategory : null,
    ].filter(Boolean).join(' · ');
    document.title = context ? `${context} | San Mateo Love` : 'San Mateo Love | Community Directory';
  }, [searchQuery, selectedCategory]);

  const resultLabel = loading
    ? 'Finding local providers…'
    : `${contacts.length} ${contacts.length === 1 ? 'provider' : 'providers'}`;

  return (
    <div className="directory-page min-h-screen pb-12">
      <div className="directory-container py-3 sm:py-5">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <ContactsHeader
            title="San Mateo Love"
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onAddClick={handleOpenForm}
          />
        </motion.div>

        <section aria-label="Provider directory">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08, duration: 0.25 }}>
            <CategoryFilter
              categories={categories}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
            />
          </motion.div>

          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.13em] text-[var(--directory-green)]">Community recommendations</p>
              <h2 className="mt-1 font-header text-2xl font-semibold text-[var(--directory-ink)]">Local providers</h2>
            </div>
            <p className="pb-1 text-sm text-[var(--directory-muted)]" aria-live="polite">{resultLabel}</p>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>We couldn’t load the directory. Please refresh and try again.</span>
            </div>
          )}

          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14, duration: 0.3 }}>
            <ContactsList
              contacts={contacts}
              onEditContact={handleEditContact}
              isLoading={loading}
            />
          </motion.div>
        </section>

        <AnimatePresence>
          {isFormOpen && (
            <ContactForm
              contact={editingContact}
              categories={categories.filter((category) => category !== 'All')}
              onSave={handleSaveContact}
              onCancel={handleCloseForm}
              onDelete={handleDeleteContact}
            />
          )}

        </AnimatePresence>
      </div>
    </div>
  );
};

export default Index;
