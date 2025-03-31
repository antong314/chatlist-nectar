// Custom hook to manage contacts
import { useState, useCallback, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Contact, Category } from '@/types/contact';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase'; // Corrected import path

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

  // Custom setters that update both state and URL params
  const setSearchQuery = useCallback((query: string) => {
    setSearchQueryState(query);
    setSearchParams(params => {
      if (query) {
        params.set('q', query);
      } else {
        params.delete('q');
      }
      return params;
    }, { replace: true });
  }, [setSearchParams]);

  const setSelectedCategory = useCallback((category: Category) => {
    setSelectedCategoryState(category);
    setSearchParams(params => {
      if (category && category !== 'All') {
        params.set('category', category);
      } else {
        params.delete('category');
      }
      return params;
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
          const fetchedContacts: Contact[] = data.map((dbContact: any) => ({ // Use 'any' for now, ideally generate types
            id: dbContact.id,
            name: dbContact.title || '', // Map title -> name
            description: dbContact.subtitle || '', // Map subtitle -> description
            category: dbContact.category || 'General', // Use category directly
            phone: dbContact.phone_number || '', // Map phone_number -> phone
            website: dbContact.website_url || '', // Map website_url -> website
            mapUrl: dbContact.map_url || '', // Map map_url -> mapUrl
            logoUrl: dbContact.image_url || '', // Will be empty for now
            avatarUrl: dbContact.image_url || '', // Will be empty for now
          }));

          // Update state (sorting is handled by the query or can be done client-side if needed)
          setContacts(fetchedContacts);
        } else {
          setContacts([]); // Set to empty array if no data
        }

      } catch (err: any) { // Catch any error type
        setError(err.message || 'An unexpected error occurred while fetching contacts');
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

  // Add a new contact to Supabase
  const addContact = useCallback(async (newContactData: Omit<Contact, "id" | "logoUrl" | "avatarUrl"> & { logoFile?: File | null }) => {
    try {
      // ** Image handling deferred **
      // We will add image upload logic here later.
      // For now, we insert without image_url.

      const contactToInsert = {
        title: newContactData.name.trim(),
        category: newContactData.category,
        subtitle: newContactData.description.trim(),
        phone_number: newContactData.phone.trim(),
        website_url: newContactData.website?.trim() || null, // Use null for empty optional fields
        map_url: newContactData.mapUrl?.trim() || null,
        image_url: null // Explicitly set image_url to null for now
      };

      // Insert into Supabase 'contacts' table
      const { data, error: insertError } = await supabase
        .from('contacts')
        .insert(contactToInsert)
        .select() // Select the newly inserted row
        .single(); // Expecting a single row back

      if (insertError) {
        console.error('Supabase insert error:', insertError);
        throw new Error(insertError.message || 'Error adding contact to Supabase');
      }

      if (data) {
        // Map the newly inserted data back to the Contact type
        const addedContact: Contact = {
          id: data.id,
          name: data.title || '',
          description: data.subtitle || '',
          category: data.category || 'General',
          phone: data.phone_number || '',
          website: data.website_url || '',
          mapUrl: data.map_url || '',
          logoUrl: data.image_url || '', // Will be empty for now
          avatarUrl: data.image_url || '', // Will be empty for now
        };

        // Add new contact immediately to local state and maintain alphabetical sorting
        setContacts(prev => sortContactsAlphabetically([...prev, addedContact]));
        toast.success("Contact added successfully");
        return true;
      } else {
        // Should not happen if insert was successful and .single() was used, but handle defensively
        throw new Error('Failed to retrieve added contact data from Supabase');
      }

    } catch (err: any) {
      console.error('Error adding contact:', err);
      toast.error(`Error adding contact: ${err.message}`);
      return false;
    }
  }, []);

  // Update an existing contact in Supabase
  const updateContact = useCallback(async (updatedContactData: Contact & { logoFile?: File | null, removeLogo?: boolean }) => {
    try {
      // Validate that we have an ID
      if (!updatedContactData.id) {
        throw new Error('Contact ID is required for updates');
      }

      // ** Image handling deferred **
      // We will add logic here later to:
      // 1. Upload new logoFile if present.
      // 2. Delete existing image if removeLogo is true.
      // 3. Update image_url in the contact record.
      // For now, we update text fields only and keep existing image_url.

      const contactToUpdate = {
        title: updatedContactData.name.trim(),
        category: updatedContactData.category,
        subtitle: updatedContactData.description.trim(),
        phone_number: updatedContactData.phone.trim(),
        website_url: updatedContactData.website?.trim() || null,
        map_url: updatedContactData.mapUrl?.trim() || null,
        // image_url: updatedImageUrl // This will be set after image handling
      };

      // Update the record in Supabase
      const { data, error: updateError } = await supabase
        .from('contacts')
        .update(contactToUpdate)
        .eq('id', updatedContactData.id) // Match the contact by ID
        .select() // Select the updated row
        .single(); // Expecting a single row back

      if (updateError) {
        console.error('Supabase update error:', updateError);
        throw new Error(updateError.message || 'Error updating contact in Supabase');
      }

      if (data) {
        // Map the updated data back to the Contact type
        const updatedContact: Contact = {
          id: data.id,
          name: data.title || '',
          description: data.subtitle || '',
          category: data.category || 'General',
          phone: data.phone_number || '',
          website: data.website_url || '',
          mapUrl: data.map_url || '',
          logoUrl: data.image_url || '', // Reflect potentially updated image_url later
          avatarUrl: data.image_url || '', // Reflect potentially updated image_url later
        };

        // Update the contacts state with the updated contact and maintain sorting
        setContacts(prev => {
          const updatedList = prev.map(contact =>
            contact.id === updatedContact.id ? updatedContact : contact
          );
          return sortContactsAlphabetically(updatedList);
        });

        toast.success("Contact updated successfully");
        return true;
      } else {
        throw new Error('Failed to retrieve updated contact data from Supabase');
      }

    } catch (err: any) {
      console.error('Error updating contact:', err);
      toast.error(`Error updating contact: ${err.message}`);
      return false;
    }
  }, []);

  // Delete a contact
  const deleteContact = async (id: string) => {
    setLoading(true);
    try {
      // Perform a soft delete by updating the is_deleted flag
      const { error } = await supabase
        .from('contacts')
        .update({ is_deleted: true })
        .match({ id });

      if (error) {
        console.error('Error deleting contact:', error);
        setError('Failed to mark contact as deleted.');
        setLoading(false);
        return false;
      } else {
        // Update local state to remove the contact from the visible list immediately
        setContacts(prevContacts => prevContacts.filter(contact => contact.id !== id));
        setError(null);
        setLoading(false);
        return true;
      }
    } catch (err: any) {
      console.error('Error deleting contact:', err);
      toast.error(`Error deleting contact: ${err.message}`);
      return false;
    }
  };

  // Apply search query and category filters (logic remains mostly the same)
  const filteredContacts = useMemo(() => {
    return contacts.filter(contact => {
      // Filter by search query (checking name, description, category)
      const lowerSearchQuery = searchQuery.toLowerCase().trim();
      const matchesSearch = lowerSearchQuery === '' ||
        contact.name.toLowerCase().includes(lowerSearchQuery) ||
        contact.description.toLowerCase().includes(lowerSearchQuery) ||
        (contact.category && contact.category.toLowerCase().includes(lowerSearchQuery));

      // Filter by category
      const matchesCategory = selectedCategory === 'All' || contact.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
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
    deleteContact
  };
};
