import React, { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CategoryFilter,
  ContactDetail,
  ContactForm,
  ContactsHeader,
  ContactsList,
} from '@/features/directory/components';
import { useContacts } from '@/hooks/useContacts';
import { Contact } from '@/types/contact';
import { trackContactView, trackEvent, trackPageView } from '@/utils/analytics';

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
    addContact,
    updateContact,
    deleteContact,
  } = useContacts();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact>();
  const [editingContact, setEditingContact] = useState<Contact>();
  const categories = uniqueCategories ?? [
    'All',
    ...Array.from(new Set(contacts.map((contact) => contact.category))),
  ];

  useEffect(() => {
    trackPageView('/directory', 'San Mateo Love Directory');
  }, []);

  const handleOpenForm = () => {
    setEditingContact(undefined);
    setIsFormOpen(true);
    setIsDetailOpen(false);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingContact(undefined);
  };

  const handleViewContact = (contact: Contact) => {
    setSelectedContact(contact);
    setIsDetailOpen(true);
    setIsFormOpen(false);
    trackContactView(contact.id.toString(), contact.name, contact.category);
  };

  const handleCloseDetail = () => {
    setIsDetailOpen(false);
    setSelectedContact(undefined);
  };

  const handleEditFromDetail = () => {
    if (!selectedContact) return;
    setEditingContact(selectedContact);
    setIsFormOpen(true);
    setIsDetailOpen(false);
  };

  const handleEditContact = (contact: Contact) => {
    setEditingContact(contact);
    setIsFormOpen(true);
    setIsDetailOpen(false);
  };

  const handleSaveContact = async (contact: Omit<Contact, 'id'> | Contact) => {
    if ('id' in contact) {
      const success = await updateContact(contact);
      if (success) {
        handleCloseForm();
        trackEvent('Directory', 'Update Contact', contact.name);
      }
      return;
    }

    const success = await addContact(contact);
    if (success) {
      handleCloseForm();
      trackEvent('Directory', 'Add Contact', contact.name);
    }
  };

  const handleDeleteContact = async (id: string) => {
    const contactToDelete = contacts.find((contact) => contact.id.toString() === id);
    const success = await deleteContact(id);

    if (success) {
      handleCloseForm();
      trackEvent('Directory', 'Delete Contact', contactToDelete?.name ?? id);
    }
  };

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isFormOpen) handleCloseForm();
      if (isDetailOpen) handleCloseDetail();
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isFormOpen, isDetailOpen]);

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
              onViewContact={handleViewContact}
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

          {isDetailOpen && selectedContact && (
            <ContactDetail
              contact={selectedContact}
              onEdit={handleEditFromDetail}
              onClose={handleCloseDetail}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Index;
