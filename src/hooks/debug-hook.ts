/**
 * Debug utility for hooks
 */
import { useContacts } from './useContacts';
import { logFormData, logApiResponse } from '@/utils/debug-logger';
import { Contact } from '@/types/contact';

// Store global instances of hooks for debugging
let contactsHookInstance: ReturnType<typeof useContacts> | null = null;

/**
 * Register the contacts hook instance for debugging
 */
export const registerContactsHook = (instance: ReturnType<typeof useContacts>): void => {
  contactsHookInstance = instance;
  console.log('📝 Contacts hook registered for debugging');
};

/**
 * Debug the update contact functionality
 */
export const debugUpdateContact = async (contact: Contact): Promise<void> => {
  if (!contactsHookInstance) {
    console.error('❌ Contacts hook not registered. Call registerContactsHook first.');
    return;
  }

  try {
    console.group('🔍 Debug Update Contact');
    console.log('Contact to update:', contact);
    
    // Call the updateContact method from the hook
    await contactsHookInstance.updateContact(contact);
    
    console.log('✅ Update contact call completed');
    console.groupEnd();
  } catch (error) {
    console.error('❌ Error in debug update contact:', error);
    console.groupEnd();
  }
};

// Add to window for console access
declare global {
  interface Window {
    debugContactsHook: {
      updateContact: (contact: Contact) => Promise<void>;
    };
  }
}

// Make debug functions available globally
if (typeof window !== 'undefined') {
  window.debugContactsHook = {
    updateContact: debugUpdateContact
  };
}
