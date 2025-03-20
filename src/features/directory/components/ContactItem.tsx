
import React, { useState } from 'react';
import { Contact } from '@/features/directory/types/contact';
import { Edit, Globe, Phone, Map } from 'lucide-react';
import { categoryIconMap } from '@/features/directory/data/categoryIcons';
import { AvatarFallback } from '@/components/ui/avatar-fallback';
import { useIsMobile } from '@/hooks/use-mobile';

interface ContactItemProps {
  contact: Contact;
  onEdit: (contact: Contact) => void;
  onView: (contact: Contact) => void;
}

export function ContactItem({ contact, onEdit, onView }: ContactItemProps) {
  const isMobile = useIsMobile();
  
  const openWhatsApp = (phoneNumber: string) => {
    // Remove any non-numeric characters
    const formattedNumber = phoneNumber.replace(/\D/g, '');
    window.open(`https://wa.me/${formattedNumber}`, '_blank');
  };
  
  // Track highlight state for mobile view
  const [isHighlighted, setIsHighlighted] = useState(false);
  
  // Function to toggle highlight
  const toggleHighlight = () => {
    setIsHighlighted(!isHighlighted);
  };
  
  // WhatsApp-like view for mobile
  if (isMobile) {
    return (
      <div 
        className={`whatsapp-contact-item ${isHighlighted ? 'bg-blue-50' : ''}`}
        onClick={(e) => {
          toggleHighlight();
          onView(contact);
        }}
      >
        <div>
          <AvatarFallback 
            name={contact.name} 
            logoUrl={contact.logoUrl || contact.avatarUrl} 
            className="w-12 h-12 shrink-0" 
          />
        </div>
        
        <div className="flex-1 min-w-0 px-3 py-1">
          <h3 className="font-semibold text-gray-900 truncate max-w-[160px] sm:max-w-full">{contact.name}</h3>
          <p className="text-sm text-gray-500 line-clamp-1">{contact.description}</p>
        </div>
        
        <div className="flex flex-col items-end justify-between h-full min-w-[100px]">
          {contact.category && (
            <div className="mb-1.5 mr-0.5">
              <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                {React.createElement(categoryIconMap[contact.category], { size: 12, className: "inline-block" })}
                <span>{contact.category}</span>
              </span>
            </div>
          )}
          
          <div className="flex items-center justify-end">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(contact);
            }}
            className="p-2 text-gray-600 rounded-full hover:bg-gray-100 transition-colors ml-1"
            aria-label="Edit contact"
          >
            <Edit className="w-5 h-5" />
          </button>

          {contact.website && (
            <a 
              href={contact.website}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-blue-600 rounded-full hover:bg-blue-50 transition-colors ml-1" 
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
              className="p-2 text-amber-600 rounded-full hover:bg-amber-50 transition-colors ml-1" 
              aria-label="View on map"
              onClick={(e) => e.stopPropagation()}
            >
              <Map className="w-5 h-5" />
            </a>
          )}
          
          {contact.phone && (
            <button 
              className="p-2 text-green-600 rounded-full hover:bg-green-50 transition-colors ml-1" 
              onClick={(e) => {
                e.stopPropagation();
                openWhatsApp(contact.phone);
              }}
              aria-label="Chat on WhatsApp"
            >
              <img 
                src="/icons8-whatsapp.svg" 
                alt="WhatsApp" 
                className="w-5 h-5" 
              />
            </button>
          )}
          </div>
        </div>
      </div>
    );
  }
  
  // Desktop table view
  return (
    <div className="contact-row grid grid-cols-12 items-center py-4 hover:bg-gray-50 cursor-pointer" onClick={() => onView(contact)}>
      <div className="col-span-3 pl-4 flex items-center gap-3">
        <AvatarFallback 
          name={contact.name} 
          logoUrl={contact.logoUrl || contact.avatarUrl}
          className="w-10 h-10 shrink-0" 
        />
        <span className="font-medium text-gray-900 truncate">{contact.name}</span>
      </div>
      
      <div className="col-span-2">
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          {React.createElement(categoryIconMap[contact.category], { size: 14, className: "inline-block" })}
          <span>{contact.category}</span>
        </span>
      </div>
      
      <div className="col-span-4 px-2">
        <p className="text-sm text-gray-600 line-clamp-2">{contact.description}</p>
      </div>
      
      <div className="col-span-2 text-sm flex items-center text-gray-600">
        {contact.phone && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              openWhatsApp(contact.phone);
            }}
            className="flex items-center text-green-600 hover:text-green-700 transition-colors"
            aria-label="Chat on WhatsApp"
          >
            <img 
              src="/icons8-whatsapp.svg" 
              alt="WhatsApp" 
              className="w-4 h-4 mr-2" 
            />
            {contact.phone}
          </button>
        )}
      </div>
      
      <div className="col-span-1 flex items-center justify-end pr-4">
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onEdit(contact);
          }} 
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
            onClick={(e) => e.stopPropagation()}
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
            onClick={(e) => e.stopPropagation()}
          >
            <Map className="w-4 h-4" />
          </a>
        )}
      </div>
    </div>
  );
}
