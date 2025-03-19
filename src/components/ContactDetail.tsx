import React from 'react';
import { Contact } from '@/types/contact';
import { Button } from '@/components/ui/button';
import { Globe, Map, Edit, X } from 'lucide-react';
import { AvatarFallback } from './ui/avatar-fallback';
import { useEffect } from 'react';

interface ContactDetailProps {
  contact: Contact;
  onEdit: () => void;
  onClose: () => void;
}

export function ContactDetail({ contact, onEdit, onClose }: ContactDetailProps) {
  // Function to open WhatsApp
  const openWhatsApp = (phoneNumber: string) => {
    // Remove any non-numeric characters
    const formattedNumber = phoneNumber.replace(/\D/g, '');
    window.open(`https://wa.me/${formattedNumber}`, '_blank');
  };

  // Handle Escape key press to close detail view
  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleEscapeKey);
    return () => document.removeEventListener('keydown', handleEscapeKey);
  }, [onClose]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('detail-container')) {
        onClose();
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [onClose]);

  return (
    <div className="detail-container fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-auto">
      <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full mx-auto" onClick={(e) => e.stopPropagation()}>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-900">Contact Details</h2>
        <button
          onClick={onClose}
          className="p-1 rounded-full hover:bg-gray-100 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <div className="mb-6 flex items-center">
        <AvatarFallback
          name={contact.name}
          logoUrl={contact.logoUrl || contact.avatarUrl}
          className="w-16 h-16 mr-4"
        />
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{contact.name}</h3>
          <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full mt-1">
            {contact.category}
          </span>
        </div>
      </div>

      <div className="space-y-4 mb-6">
        {contact.description && (
          <div className="border-b pb-2">
            <h4 className="text-sm font-medium text-gray-500 mb-1">Description</h4>
            <p className="text-gray-900">{contact.description}</p>
          </div>
        )}

        {contact.phone && (
          <div className="border-b pb-2 flex justify-between items-center">
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-1">Phone Number</h4>
              <button 
                onClick={() => openWhatsApp(contact.phone)}
                className="text-blue-600 hover:text-green-600 transition-colors flex items-center"
              >
                {contact.phone}
              </button>
            </div>
            <button
              onClick={() => openWhatsApp(contact.phone)}
              className="flex items-center justify-center p-2 text-white bg-green-500 rounded-full hover:bg-green-600 transition-colors"
              aria-label="Chat on WhatsApp"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.498 14.382c-.301-.15-1.767-.867-2.04-.966-.273-.101-.473-.15-.673.15-.2.301-.754.966-.925 1.164-.17.199-.341.15-.642 0-.3-.15-1.269-.468-2.419-1.49-.893-.8-1.498-1.786-1.673-2.086-.174-.302-.018-.466.132-.62.134-.135.299-.354.448-.531.149-.178.198-.301.297-.502.1-.2.05-.374-.05-.524-.1-.15-.671-1.643-.92-2.244-.241-.586-.485-.51-.672-.51-.169-.008-.367-.01-.566-.01-.2 0-.527.075-.803.375-.273.3-1.045 1.02-1.045 2.488s1.07 2.887 1.218 3.087c.149.2 2.095 3.195 5.076 4.483.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.571-.347z" />
              </svg>
            </button>
          </div>
        )}

        {contact.website && (
          <div className="border-b pb-2 flex justify-between items-center">
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-1">Website</h4>
              <a 
                href={contact.website}
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline break-all"
              >
                {contact.website}
              </a>
            </div>
            <a
              href={contact.website}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-blue-600 rounded-full hover:bg-blue-50 transition-colors"
              aria-label="Visit website"
            >
              <Globe className="w-5 h-5" />
            </a>
          </div>
        )}

        {contact.mapUrl && (
          <div className="border-b pb-2 flex justify-between items-center">
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-1">Map Location</h4>
              <a 
                href={contact.mapUrl}
                target="_blank" 
                rel="noopener noreferrer"
                className="text-amber-600 hover:underline break-all"
              >
                {contact.mapUrl}
              </a>
            </div>
            <a
              href={contact.mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-amber-600 rounded-full hover:bg-amber-50 transition-colors"
              aria-label="View on map"
            >
              <Map className="w-5 h-5" />
            </a>
          </div>
        )}
      </div>

      <div className="flex justify-center">
        <Button 
          type="button"
          onClick={onEdit}
          className="flex items-center justify-center gap-2"
        >
          <Edit className="w-4 h-4" />
          Edit Contact
        </Button>
      </div>
    </div>
  </div>
  );
}
