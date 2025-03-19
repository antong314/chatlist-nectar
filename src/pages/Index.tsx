
import React, { useState, useEffect } from 'react';
import { ContactsHeader } from '@/components/ContactsHeader';
import { CategoryFilter } from '@/components/CategoryFilter';
import { ContactsList } from '@/components/ContactsList';
import { ContactForm } from '@/components/ContactForm';
import { useContacts } from '@/hooks/useContacts';
import { Contact, Category } from '@/types/contact';
import { useIsMobile } from '@/hooks/use-mobile';
import { motion, AnimatePresence } from 'framer-motion';

// All available categories
// Type assertion to ensure 'All' is recognized as part of the Category type
const CATEGORIES = [
  'All',
  'Car',
  'Food Ordering',
  'Groceries',
  'Jobs',
  'Mechanic',
  'Mind Body & Spirit',
  'Nature',
  'Real Estate',
  'Restaurant',
  'Service',
  'Social Network',
  'Taxi'
] as Category[];

const Index = () => {
  const {
    contacts,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    addContact,
    updateContact,
    deleteContact
  } = useContacts();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | undefined>(undefined);
  const isMobile = useIsMobile();

  // Handle form open/close
  const handleOpenForm = () => {
    setEditingContact(undefined);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingContact(undefined);
  };

  // Handle contact edit
  const handleEditContact = (contact: Contact) => {
    setEditingContact(contact);
    setIsFormOpen(true);
  };

  // Handle form submit
  const handleSaveContact = async (contact: Omit<Contact, 'id'> | Contact) => {
    if ('id' in contact) {
      const success = await updateContact(contact);
      if (success) handleCloseForm();
    } else {
      const success = await addContact(contact);
      if (success) handleCloseForm();
    }
  };

  // Handle contact delete
  const handleDeleteContact = async (id: string) => {
    const success = await deleteContact(id);
    if (success) handleCloseForm();
  };

  // Close form on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCloseForm();
    };
    
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  // Update page title based on search/filter state
  useEffect(() => {
    let title = 'MV Directory';
    
    if (searchQuery && selectedCategory !== 'All') {
      title = `${searchQuery} in ${selectedCategory} - MV Directory`;
    } else if (searchQuery) {
      title = `${searchQuery} - MV Directory`;
    } else if (selectedCategory !== 'All') {
      title = `${selectedCategory} - MV Directory`;
    }
    
    document.title = title;
  }, [searchQuery, selectedCategory]);

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="directory-container py-6">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <ContactsHeader
            title="MV Directory"
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onAddClick={handleOpenForm}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          <CategoryFilter
            categories={CATEGORIES}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <ContactsList
            contacts={contacts}
            onEditContact={handleEditContact}
            isLoading={loading}
          />
        </motion.div>

        <AnimatePresence>
          {isFormOpen && (
            <ContactForm
              contact={editingContact}
              categories={CATEGORIES}
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
