import React from 'react';
import { Contact } from '@/features/directory/types/contact';
import { Button } from '@/components/ui/button';
import { Globe, Map, Edit, Shapes, X } from 'lucide-react';
import { categoryIconMap } from '@/features/directory/data/categoryIcons';
import { getDirectoryCategoryLabel } from '@/features/directory/data/categories';
import { AvatarFallback } from '@/components/ui/avatar-fallback';
import { useEffect } from 'react';
import { getSafeExternalUrl } from '@/lib/urls';

interface ContactDetailProps {
  contact: Contact;
  onEdit: () => void;
  onClose: () => void;
}

export function ContactDetail({ contact, onEdit, onClose }: ContactDetailProps) {
  const websiteUrl = getSafeExternalUrl(contact.website);
  const mapUrl = getSafeExternalUrl(contact.mapUrl);
  const categoryLabel = getDirectoryCategoryLabel(contact.category);
  const CategoryIcon = categoryIconMap[contact.category] ?? Shapes;
  const whatsappNumber = contact.phone?.replace(/\D/g, '') ?? '';
  const canMessageOnWhatsApp = whatsappNumber.length >= 8;

  // Function to open WhatsApp
  const openWhatsApp = () => {
    if (!canMessageOnWhatsApp) return;

    const message = encodeURIComponent(`Hi ${contact.name}, I found you through San Mateo Love. Are you available?`);
    window.open(
      `https://wa.me/${whatsappNumber}?text=${message}`,
      '_blank',
      'noopener,noreferrer',
    );
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
      <div
        aria-labelledby="contact-detail-title"
        aria-modal="true"
        className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full mx-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-900" id="contact-detail-title">Provider details</h2>
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
          logoUrl={contact.image_url || contact.logoUrl || contact.avatarUrl}
          className="w-16 h-16 mr-4"
        />
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{contact.name}</h3>
          <span className="inline-flex items-center gap-1.5 bg-blue-100 text-blue-800 text-xs px-2.5 py-1.5 rounded-full mt-1">
            <CategoryIcon aria-hidden="true" className="inline-block" size={16} />
            <span>{categoryLabel}</span>
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

        {canMessageOnWhatsApp && (
          <div className="border-b pb-2 flex justify-between items-center">
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-1">WhatsApp number</h4>
              <button 
                onClick={openWhatsApp}
                className="text-blue-600 hover:text-green-600 transition-colors flex items-center"
              >
                {contact.phone}
              </button>
            </div>
            <button
              onClick={openWhatsApp}
              className="flex items-center justify-center p-2 rounded-full hover:opacity-80 transition-colors"
              aria-label="Chat on WhatsApp"
            >
              <img 
                src="/icons8-whatsapp.svg" 
                alt="WhatsApp" 
                className="w-6 h-6" 
              />
            </button>
          </div>
        )}

        {websiteUrl && (
          <div className="border-b pb-2 flex justify-between items-center">
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-1">Website</h4>
              <a 
                href={websiteUrl}
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline break-all"
              >
                {contact.website}
              </a>
            </div>
            <a
              href={websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-blue-600 rounded-full hover:bg-blue-50 transition-colors"
              aria-label="Visit website"
            >
              <Globe className="w-5 h-5" />
            </a>
          </div>
        )}

        {mapUrl && (
          <div className="border-b pb-2 flex justify-between items-center">
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-1">Map Location</h4>
              <a 
                href={mapUrl}
                target="_blank" 
                rel="noopener noreferrer"
                className="text-amber-600 hover:underline break-all"
              >
                {contact.mapUrl}
              </a>
            </div>
            <a
              href={mapUrl}
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

      <div className="space-y-3">
        {canMessageOnWhatsApp && (
          <Button
            className="h-12 w-full bg-[#25D366] font-bold text-white hover:bg-[#1fb85a]"
            onClick={openWhatsApp}
            type="button"
          >
            <img alt="" aria-hidden="true" className="h-5 w-5" src="/icons8-whatsapp.svg" />
            Message on WhatsApp
          </Button>
        )}
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
  </div>
  );
}
