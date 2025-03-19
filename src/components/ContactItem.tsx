
import React from 'react';
import { Contact } from '@/types/contact';
import { Edit, Globe, Phone, Map } from 'lucide-react';
import { AvatarFallback } from './ui/avatar-fallback';
import { useIsMobile } from '@/hooks/use-mobile';

interface ContactItemProps {
  contact: Contact;
  onEdit: (contact: Contact) => void;
}

export function ContactItem({ contact, onEdit }: ContactItemProps) {
  const isMobile = useIsMobile();
  
  const openWhatsApp = (phoneNumber: string) => {
    // Remove any non-numeric characters
    const formattedNumber = phoneNumber.replace(/\D/g, '');
    window.open(`https://wa.me/${formattedNumber}`, '_blank');
  };
  
  // WhatsApp-like view for mobile
  if (isMobile) {
    return (
      <div className="whatsapp-contact-item">
        <div onClick={() => onEdit(contact)}>
          <AvatarFallback 
            name={contact.name} 
            logoUrl={contact.logoUrl || contact.avatarUrl} 
            className="w-12 h-12 shrink-0" 
          />
        </div>
        
        <div className="flex-1 min-w-0" onClick={() => onEdit(contact)}>
          <div className="flex justify-between items-start">
            <h3 className="font-semibold text-gray-900 truncate">{contact.name}</h3>
            {contact.phone && (
              <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                {contact.category}
              </span>
            )}
          </div>
          
          <p className="text-sm text-gray-500 line-clamp-1">{contact.description}</p>
        </div>
        
        <div className="flex items-center">
          {contact.website && (
            <a 
              href={contact.website}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-blue-600 rounded-full hover:bg-blue-50 transition-colors mr-1" 
              aria-label="Visit website"
              onClick={(e) => e.stopPropagation()}
            >
              <Globe className="w-5 h-5" />
            </a>
          )}
          
          {contact.mapUrl && (
            <a 
              href={contact.mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-amber-600 rounded-full hover:bg-amber-50 transition-colors mr-1" 
              aria-label="View on map"
              onClick={(e) => e.stopPropagation()}
            >
              <Map className="w-5 h-5" />
            </a>
          )}
          
          {contact.phone && (
            <button 
              className="p-2 text-green-600 rounded-full hover:bg-green-50 transition-colors" 
              onClick={(e) => {
                e.stopPropagation();
                openWhatsApp(contact.phone);
              }}
              aria-label="Chat on WhatsApp"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.498 14.382c-.301-.15-1.767-.867-2.04-.966-.273-.101-.473-.15-.673.15-.2.301-.754.966-.925 1.164-.17.199-.341.15-.642 0-.3-.15-1.269-.468-2.419-1.49-.893-.8-1.498-1.786-1.673-2.086-.174-.302-.018-.466.132-.62.134-.135.299-.354.448-.531.149-.178.198-.301.297-.502.1-.2.05-.374-.05-.524-.1-.15-.671-1.643-.92-2.244-.241-.586-.485-.51-.672-.51-.169-.008-.367-.01-.566-.01-.2 0-.527.075-.803.375-.273.3-1.045 1.02-1.045 2.488s1.07 2.887 1.218 3.087c.149.2 2.095 3.195 5.076 4.483.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.571-.347z" />
              </svg>
            </button>
          )}
        </div>
      </div>
    );
  }
  
  // Desktop table view
  return (
    <div className="contact-row grid grid-cols-12 items-center py-4">
      <div className="col-span-3 pl-4 flex items-center gap-3">
        <AvatarFallback 
          name={contact.name} 
          logoUrl={contact.logoUrl || contact.avatarUrl}
          className="w-10 h-10 shrink-0" 
        />
        <span className="font-medium text-gray-900 truncate">{contact.name}</span>
      </div>
      
      <div className="col-span-2">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          {contact.category}
        </span>
      </div>
      
      <div className="col-span-4 px-2">
        <p className="text-sm text-gray-600 line-clamp-2">{contact.description}</p>
      </div>
      
      <div className="col-span-2 text-sm flex items-center text-gray-600">
        {contact.phone && (
          <button 
            onClick={() => openWhatsApp(contact.phone)}
            className="flex items-center text-green-600 hover:text-green-700 transition-colors"
            aria-label="Chat on WhatsApp"
          >
            <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.498 14.382c-.301-.15-1.767-.867-2.04-.966-.273-.101-.473-.15-.673.15-.2.301-.754.966-.925 1.164-.17.199-.341.15-.642 0-.3-.15-1.269-.468-2.419-1.49-.893-.8-1.498-1.786-1.673-2.086-.174-.302-.018-.466.132-.62.134-.135.299-.354.448-.531.149-.178.198-.301.297-.502.1-.2.05-.374-.05-.524-.1-.15-.671-1.643-.92-2.244-.241-.586-.485-.51-.672-.51-.169-.008-.367-.01-.566-.01-.2 0-.527.075-.803.375-.273.3-1.045 1.02-1.045 2.488s1.07 2.887 1.218 3.087c.149.2 2.095 3.195 5.076 4.483.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.571-.347z" />
            </svg>
            {contact.phone}
          </button>
        )}
      </div>
      
      <div className="col-span-1 flex items-center justify-end pr-4">
        <button 
          onClick={() => onEdit(contact)} 
          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
        >
          <Edit className="w-4 h-4" />
        </button>
        
        {contact.website && (
          <a 
            href={contact.website}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors ml-1"
          >
            <Globe className="w-4 h-4" />
          </a>
        )}
        
        {contact.mapUrl && (
          <a 
            href={contact.mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-full transition-colors ml-1"
            aria-label="View on map"
          >
            <Map className="w-4 h-4" />
          </a>
        )}
      </div>
    </div>
  );
}
