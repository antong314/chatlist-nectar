
import React, { useState, useEffect } from 'react';
import { ContactsHeader } from '@/components/ContactsHeader';
import { CategoryFilter } from '@/components/CategoryFilter';
import { ContactsList } from '@/components/ContactsList';
import { ContactForm } from '@/components/ContactForm';
import { ContactDetail } from '@/components/ContactDetail';
import { useContacts } from '@/hooks/useContacts';
import { Contact, Category } from '@/types/contact';
import { useIsMobile } from '@/hooks/use-mobile';
import { motion, AnimatePresence } from 'framer-motion';

// Categories are now dynamically loaded from the data

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
    deleteContact
  } = useContacts();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | undefined>(undefined);
  const [editingContact, setEditingContact] = useState<Contact | undefined>(undefined);
  const isMobile = useIsMobile();

  // Handle form open/close
  const handleOpenForm = () => {
    setEditingContact(undefined);
    setIsFormOpen(true);
    setIsDetailOpen(false);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingContact(undefined);
  };
  
  // Handle detail view open/close
  const handleViewContact = (contact: Contact) => {
    setSelectedContact(contact);
    setIsDetailOpen(true);
    setIsFormOpen(false);
  };

  const handleCloseDetail = () => {
    setIsDetailOpen(false);
    setSelectedContact(undefined);
  };

  // Handle contact edit from detail view
  const handleEditFromDetail = () => {
    if (selectedContact) {
      setEditingContact(selectedContact);
      setIsFormOpen(true);
      setIsDetailOpen(false);
    }
  };

  // Handle contact edit (direct from list)
  const handleEditContact = (contact: Contact) => {
    setEditingContact(contact);
    setIsFormOpen(true);
    setIsDetailOpen(false);
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

  // Close form and detail view on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFormOpen) handleCloseForm();
        if (isDetailOpen) handleCloseDetail();
      }
    };
    
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isFormOpen, isDetailOpen]);

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
            categories={uniqueCategories}
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
            onViewContact={handleViewContact}
            isLoading={loading}
          />
        </motion.div>

        <AnimatePresence>
          {isFormOpen && (
            <ContactForm
              contact={editingContact}
              categories={uniqueCategories.filter(cat => cat !== 'All')}
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
