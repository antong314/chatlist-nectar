
import React from 'react';
import { Contact } from '@/features/directory/types/contact';
import { ContactItem } from './ContactItem';
import { useIsMobile } from '@/hooks/use-mobile';

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
  isLoading 
}: ContactsListProps) {
  const isMobile = useIsMobile();
  
  if (isLoading) {
    return (
      <div className="py-10 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <p className="mt-4 text-gray-600">Loading contacts...</p>
      </div>
    );
  }
  
  if (contacts.length === 0) {
    return (
      <div className="py-10 text-center bg-gray-50 rounded-lg">
        <svg 
          className="w-12 h-12 mx-auto text-gray-400" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24" 
          xmlns="http://www.w3.org/2000/svg"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={1.5} 
            d="M12 6v6m0 0v6m0-6h6m-6 0H6" 
          />
        </svg>
        <p className="mt-4 text-gray-600">No contacts found</p>
        <p className="text-sm text-gray-500">Try a different search or category</p>
      </div>
    );
  }
  
  // Table header (only for desktop)
  const TableHeader = () => {
    if (isMobile) return null;
    
    return (
      <div className="grid grid-cols-12 py-2 border-b border-gray-200 text-sm font-medium text-gray-500">
        <div className="col-span-3 pl-4">Name</div>
        <div className="col-span-2">Category</div>
        <div className="col-span-4 px-2">Description</div>
        <div className="col-span-2">Phone</div>
        <div className="col-span-1 text-right pr-4">Actions</div>
      </div>
    );
  };
  
  return (
    <div className={`bg-white ${isMobile ? 'rounded-lg shadow-sm overflow-hidden' : 'border border-gray-200 rounded-lg shadow-sm'}`}>
      <TableHeader />
      {contacts.map(contact => (
        <ContactItem
          key={contact.id}
          contact={contact}
          onEdit={onEditContact}
          onView={onViewContact}
        />
      ))}
    </div>
  );
}
