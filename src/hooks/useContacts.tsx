// Custom hook to manage contacts
import { useState, useCallback, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Contact, Category } from '@/types/contact';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase'; // Corrected import path
import { searchDirectoryContacts } from '@/features/directory/search/directorySearch';
import {
  requestProviderDeletion,
  undoProviderDeletion,
} from '@/features/provider-deletion';
import {
  checkWhatsappVerification,
  completeVerifiedProviderWrite,
  uploadVerifiedProviderLogo,
  type WhatsappVerificationChallenge,
} from '@/features/verification';

const CONTACT_LOGO_MAX_BYTES = 5 * 1024 * 1024;
const CONTACT_LOGO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

interface ProviderWriteVerification {
  challenge: WhatsappVerificationChallenge;
  code: string;
}

interface DatabaseContactRow {
  id: string;
  title?: string | null;
  subtitle?: string | null;
  category?: string | null;
  phone_number?: string | null;
  website_url?: string | null;
  map_url?: string | null;
  image_url?: string | null;
}

const mapDatabaseContact = (dbContact: DatabaseContactRow): Contact => ({
  id: dbContact.id,
  name: dbContact.title || '',
  description: dbContact.subtitle || '',
  category: dbContact.category || 'Service',
  phone: dbContact.phone_number || '',
  website: dbContact.website_url || '',
  mapUrl: dbContact.map_url || '',
  image_url: dbContact.image_url || null,
  logoUrl: dbContact.image_url || '',
  avatarUrl: dbContact.image_url || '',
});

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

/**
 * Custom hook for managing contacts using Supabase
 */
export const useContacts = () => {
  // State to store contacts
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // Use URL search params for search and filtering
  const [searchParams, setSearchParams] = useSearchParams();

  // Get initial values from URL or use defaults
  const initialSearch = searchParams.get('q') || '';
  const initialCategoryParam = searchParams.get('category');
  const initialCategory = (initialCategoryParam ? initialCategoryParam as Category : 'All');

  // State for search and filtering
  const [searchQuery, setSearchQueryState] = useState<string>(initialSearch);
  const [selectedCategory, setSelectedCategoryState] = useState<Category>(initialCategory);

  // Keep controls in sync with browser Back/Forward navigation.
  useEffect(() => {
    const nextSearch = searchParams.get('q') || '';
    const nextCategory = (searchParams.get('category') || 'All') as Category;

    setSearchQueryState((current) => current === nextSearch ? current : nextSearch);
    setSelectedCategoryState((current) => current === nextCategory ? current : nextCategory);
  }, [searchParams]);

  // Custom setters that update both state and URL params
  const setSearchQuery = useCallback((query: string) => {
    setSearchQueryState(query);
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);
      if (query.trim()) {
        nextParams.set('q', query);
      } else {
        nextParams.delete('q');
      }
      return nextParams;
    }, { replace: true });
  }, [setSearchParams]);

  const setSelectedCategory = useCallback((category: Category) => {
    setSelectedCategoryState(category);
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);
      if (category && category !== 'All') {
        nextParams.set('category', category);
      } else {
        nextParams.delete('category');
      }
      return nextParams;
    }, { replace: true });
  }, [setSearchParams]);

  // Function to sort contacts alphabetically by title (which maps to name in Contact type)
  const sortContactsAlphabetically = (contactsToSort: Contact[]): Contact[] => {
    return [...contactsToSort].sort((a, b) => a.name.localeCompare(b.name));
  };

  // Fetch contacts from Supabase
  useEffect(() => {
    const fetchContacts = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch only contacts that are NOT marked as deleted
        const { data, error: fetchError } = await supabase
          .from('contacts')
          .select('*') // Select all columns
          .eq('is_deleted', false) // Filter out soft-deleted contacts
          .order('title', { ascending: true }); // Order by title (name)

        if (fetchError) {
          console.error('Supabase fetch error:', fetchError);
          throw new Error(fetchError.message || 'Error fetching contacts from Supabase');
        }

        if (data) {
          // Map Supabase data to our Contact type
          const fetchedContacts = (data as DatabaseContactRow[]).map(mapDatabaseContact);

          // Update state (sorting is handled by the query or can be done client-side if needed)
          setContacts(fetchedContacts);
        } else {
          setContacts([]); // Set to empty array if no data
        }

      } catch (err: unknown) {
        setError(getErrorMessage(err, 'An unexpected error occurred while fetching contacts'));
        console.error('Error fetching contacts:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchContacts();
  }, [refreshTrigger]); // Re-run effect when refreshTrigger changes

  // Function to refresh contacts
  const refreshContacts = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  const uploadVerifiedLogo = useCallback(async (
    challenge: WhatsappVerificationChallenge,
    file?: File | null,
  ): Promise<string | null> => {
    if (!file) return null;
    if (!CONTACT_LOGO_TYPES.has(file.type)) throw new Error('Logo must be a JPEG, PNG, or WebP image.');
    if (file.size > CONTACT_LOGO_MAX_BYTES) throw new Error('Logo must be 5 MB or smaller.');

    return uploadVerifiedProviderLogo(challenge, file);
  }, []);

  const completeProviderWrite = useCallback(async (
    contactData: (Omit<Contact, 'id'> | Contact) & { imageFile?: File | null },
    verification: ProviderWriteVerification,
  ) => {
    await checkWhatsappVerification(verification.challenge, verification.code);
    const uploadedImagePath = await uploadVerifiedLogo(verification.challenge, contactData.imageFile);
    const result = await completeVerifiedProviderWrite(verification.challenge, uploadedImagePath);
    return mapDatabaseContact(result.provider as unknown as DatabaseContactRow);
  }, [uploadVerifiedLogo]);

  // Create a provider only after the server accepts the WhatsApp-bound action.
  const addContact = useCallback(async (
    newContactData: Omit<Contact, 'id'> & { imageFile?: File | null },
    verification: ProviderWriteVerification,
  ) => {
    try {
      const addedContact = await completeProviderWrite(newContactData, verification);
      setContacts((previous) => sortContactsAlphabetically([...previous, addedContact]));
      toast.success('Provider added successfully');
      return true;
    } catch (error) {
      const message = getErrorMessage(error, 'Please try again.');
      console.error('Error adding provider:', error);
      toast.error(`Could not add provider: ${message}`);
      throw error instanceof Error ? error : new Error(message);
    }
  }, [completeProviderWrite]);

  // Update a provider only after the server accepts the WhatsApp-bound action.
  const updateContact = useCallback(async (
    updatedContactData: Contact & { imageFile?: File | null; removeLogo?: boolean },
    verification: ProviderWriteVerification,
  ) => {
    try {
      if (!updatedContactData.id) throw new Error('Contact ID is required for updates');
      const updatedContact = await completeProviderWrite(updatedContactData, verification);
      setContacts((previous) => sortContactsAlphabetically(previous.map((contact) =>
        contact.id === updatedContact.id ? updatedContact : contact
      )));
      toast.success('Provider updated successfully');
      return true;
    } catch (error) {
      const message = getErrorMessage(error, 'Please try again.');
      console.error('Error updating provider:', error);
      toast.error(`Could not update provider: ${message}`);
      throw error instanceof Error ? error : new Error(message);
    }
  }, [completeProviderWrite]);

  // Complete a recoverable deletion only after WhatsApp OTP verification.
  const deleteContact = useCallback(async (
    request: Parameters<typeof requestProviderDeletion>[0],
  ) => {
    const receipt = await requestProviderDeletion(request);

    // Only hide the contact locally after the server accepts the request.
    setContacts((previousContacts) => previousContacts.filter(
      (contact) => contact.id !== request.providerId,
    ));
    setError(null);
    return receipt;
  }, []);

  const undoDelete = useCallback(async (
    request: Parameters<typeof undoProviderDeletion>[0],
  ) => {
    await undoProviderDeletion(request);
  }, []);

  // Apply bilingual, typo-tolerant search and the existing category filter.
  const filteredContacts = useMemo(() => {
    const contactsInCategory = selectedCategory === 'All'
      ? contacts
      : contacts.filter((contact) => contact.category === selectedCategory);

    return searchDirectoryContacts(contactsInCategory, searchQuery);
  }, [contacts, searchQuery, selectedCategory]);

  // Extract unique categories from the contacts data (logic remains the same)
  const uniqueCategories = useMemo(() => {
    const categorySet = new Set<string>();
    contacts.forEach(contact => {
      if (contact.category) {
        categorySet.add(contact.category);
      }
    });
    // Ensure 'All' is always first, sort the rest
    return ['All', ...Array.from(categorySet).sort()] as Category[];
  }, [contacts]);

  // Return the hook state and functions
  return {
    contacts: filteredContacts, // Return filtered contacts for UI
    loading,
    error,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    uniqueCategories,
    refreshContacts,
    addContact,
    updateContact,
    deleteContact,
    undoDelete,
  };
};
