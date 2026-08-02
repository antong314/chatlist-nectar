// Custom hook to manage contacts
import { useState, useCallback, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Contact, Category } from '@/types/contact';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase'; // Corrected import path
import { v4 as uuidv4 } from 'uuid'; // Import uuid
import { searchDirectoryContacts } from '@/features/directory/search/directorySearch';

const CONTACT_LOGOS_BUCKET = 'contact-images'; // Use the existing bucket name

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

  // Helper function to extract storage path from public URL
  const getPathFromUrl = (url: string | null | undefined): string | null => {
    if (!url) return null;
    try {
      const urlParts = new URL(url);
      // Example path: /storage/v1/object/public/contact-logos/public/image.png
      // We need the part after the bucket name: public/image.png
      const pathSegments = urlParts.pathname.split('/');
      const bucketNameIndex = pathSegments.indexOf(CONTACT_LOGOS_BUCKET);
      if (bucketNameIndex === -1 || bucketNameIndex + 1 >= pathSegments.length) {
        console.warn('Could not extract path from URL:', url);
        return null;
      }
      return pathSegments.slice(bucketNameIndex + 1).join('/');
    } catch (e) {
      console.warn('Error parsing URL for path extraction:', url, e);
      return null;
    }
  };

  // Add a new contact to Supabase
  const addContact = useCallback(async (newContactData: Omit<Contact, "id"> & { imageFile?: File | null }) => {
    try {
      let imageUrl: string | null = null;

      // 1. Handle image upload if imageFile is provided
      if (newContactData.imageFile) {
        const file = newContactData.imageFile;
        const fileExt = file.name.split('.').pop();
        const uniqueFileName = `${uuidv4()}.${fileExt}`;
        const filePath = `public/${uniqueFileName}`; // Store in a 'public' folder within the bucket

        console.log(`Uploading new image to: ${filePath}`);
        const { error: uploadError } = await supabase.storage
          .from(CONTACT_LOGOS_BUCKET)
          .upload(filePath, file);

        if (uploadError) {
          console.error('Error uploading image:', uploadError);
          throw new Error(`Failed to upload image: ${uploadError.message}`);
        }

        // Get the public URL
        const { data: urlData } = supabase.storage
          .from(CONTACT_LOGOS_BUCKET)
          .getPublicUrl(filePath);

        if (!urlData || !urlData.publicUrl) {
          console.error('Error getting public URL for image:', filePath);
          // Continue without image URL, or throw error depending on requirements
          // throw new Error('Failed to get public URL for uploaded image.'); 
          imageUrl = null; // Or handle as critical error
        } else {
          imageUrl = urlData.publicUrl;
          console.log(`Image uploaded successfully. URL: ${imageUrl}`);
        }
      }

      const contactToInsert = {
        title: newContactData.name.trim(),
        category: newContactData.category,
        subtitle: newContactData.description.trim(),
        phone_number: newContactData.phone.trim(),
        website_url: newContactData.website?.trim() || null,
        map_url: newContactData.mapUrl?.trim() || null,
        image_url: imageUrl // Use the determined image URL
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
        const addedContact = mapDatabaseContact(data as DatabaseContactRow);

        // Add new contact immediately to local state and maintain alphabetical sorting
        setContacts(prev => sortContactsAlphabetically([...prev, addedContact]));
        toast.success("Contact added successfully");
        return true;
      } else {
        // Should not happen if insert was successful and .single() was used, but handle defensively
        throw new Error('Failed to retrieve added contact data from Supabase');
      }

    } catch (err: unknown) {
      console.error('Error adding contact:', err);
      toast.error(`Error adding contact: ${getErrorMessage(err, 'Please try again.')}`);
      return false;
    }
  }, []);

  // Update an existing contact in Supabase
  const updateContact = useCallback(async (updatedContactData: Contact & { imageFile?: File | null, removeLogo?: boolean }) => {
    try {
      // Validate that we have an ID
      if (!updatedContactData.id) {
        throw new Error('Contact ID is required for updates');
      }

      const existingImageUrl = updatedContactData.image_url
        || updatedContactData.logoUrl
        || updatedContactData.avatarUrl
        || null;
      let newImageUrl: string | null = existingImageUrl;
      const currentImagePath = getPathFromUrl(existingImageUrl);

      // 1. Handle new image upload
      if (updatedContactData.imageFile) {
        const file = updatedContactData.imageFile;
        const fileExt = file.name.split('.').pop();
        const uniqueFileName = `${uuidv4()}.${fileExt}`;
        const newFilePath = `public/${uniqueFileName}`;

        // Delete old image first if it exists
        if (currentImagePath) {
          console.log(`Removing old image: ${currentImagePath}`);
          const { error: deleteError } = await supabase.storage
            .from(CONTACT_LOGOS_BUCKET)
            .remove([currentImagePath]);
          if (deleteError) {
            // Log warning but continue, maybe the file was already deleted
            console.warn(`Could not delete old image (${currentImagePath}):`, deleteError.message);
          }
        }

        // Upload new image
        console.log(`Uploading new image to: ${newFilePath}`);
        const { error: uploadError } = await supabase.storage
          .from(CONTACT_LOGOS_BUCKET)
          .upload(newFilePath, file);

        if (uploadError) {
          console.error('Error uploading new image:', uploadError);
          throw new Error(`Failed to upload new image: ${uploadError.message}`);
        }

        // Get the public URL for the new image
        const { data: urlData } = supabase.storage
          .from(CONTACT_LOGOS_BUCKET)
          .getPublicUrl(newFilePath);

        if (!urlData || !urlData.publicUrl) {
          console.error('Error getting public URL for new image:', newFilePath);
          newImageUrl = null; // Or handle as critical error
        } else {
          newImageUrl = urlData.publicUrl;
          console.log(`New image uploaded successfully. URL: ${newImageUrl}`);
        }
      }
      // 2. Handle image removal if no new image was uploaded
      else if (updatedContactData.removeLogo && currentImagePath) {
        console.log(`Removing image: ${currentImagePath}`);
        const { error: deleteError } = await supabase.storage
          .from(CONTACT_LOGOS_BUCKET)
          .remove([currentImagePath]);

        if (deleteError) {
          console.warn(`Could not remove image (${currentImagePath}):`, deleteError.message);
          // Don't clear newImageUrl yet, maybe removal failed
        } else {
          console.log(`Image removed successfully.`);
          newImageUrl = null; // Set URL to null after successful removal
        }
      }
      // 3. If neither upload nor remove, newImageUrl remains the original image_url

      const contactToUpdate = {
        title: updatedContactData.name.trim(),
        category: updatedContactData.category,
        subtitle: updatedContactData.description.trim(),
        phone_number: updatedContactData.phone.trim(),
        website_url: updatedContactData.website?.trim() || null, // Keep existing field mappings
        map_url: updatedContactData.mapUrl?.trim() || null,
        image_url: newImageUrl // Set the determined image URL
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
        const updatedContact = mapDatabaseContact(data as DatabaseContactRow);

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

    } catch (err: unknown) {
      console.error('Error updating contact:', err);
      toast.error(`Error updating contact: ${getErrorMessage(err, 'Please try again.')}`);
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
        return false;
      } else {
        // Update local state to remove the contact from the visible list immediately
        setContacts(prevContacts => prevContacts.filter(contact => contact.id !== id));
        setError(null);
        return true;
      }
    } catch (err: unknown) {
      console.error('Error deleting contact:', err);
      toast.error(`Error deleting contact: ${getErrorMessage(err, 'Please try again.')}`);
      return false;
    } finally {
      setLoading(false);
    }
  };

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
    deleteContact
  };
};
