
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  CategoryFilter,
  ContactsList,
  ContactForm,
  ContactDetail
} from '@/features/directory/components';
import { useContacts } from '@/features/directory/hooks';
import { Contact, Category } from '@/features/directory/types';
import { useIsMobile } from '@/hooks/use-mobile';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Newspaper, Plus, Search, FileText } from 'lucide-react';

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
        {/* Feature Navigation Tabs */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div className="flex items-center space-x-2">
              <div className="bg-gray-100 p-1.5 md:p-2 rounded-md">
                <svg 
                  className="w-5 h-5 md:w-6 md:h-6 text-gray-700" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24" 
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
              </div>
              <div className="flex items-center space-x-2 md:space-x-4 overflow-hidden">
                <h1 className="text-xl md:text-2xl font-bold">MV Directory</h1>
                <div className="h-6 w-px bg-gray-300 hidden sm:block"></div>
                <Link to="/wiki" className="text-gray-500 hover:text-gray-800 transition-colors flex items-center">
                  <FileText className="h-4 w-4 md:h-5 md:w-5 mr-1" />
                  <span className="text-sm md:text-lg">Machuca Wiki</span>
                </Link>
                <div className="h-6 w-px bg-gray-300 hidden sm:block"></div>
                <Link to="/elements" className="text-gray-500 hover:text-gray-800 transition-colors flex items-center">
                  <Newspaper className="h-4 w-4 md:h-5 md:w-5 mr-1" />
                  <span className="text-sm md:text-lg">Elements</span>
                </Link>
              </div>
            </div>
            <Button onClick={handleOpenForm} className="add-entry-btn text-sm md:text-base whitespace-nowrap px-3 py-1.5 sm:px-4 sm:py-2">
              <Plus className="w-4 h-4 mr-1" />
              Add Entry
            </Button>
          </div>
          
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Search by name, category, or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 py-3 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all duration-200"
              autoFocus
            />
          </div>
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
