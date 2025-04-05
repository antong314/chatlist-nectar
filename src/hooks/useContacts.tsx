// Custom hook to manage contacts
import { useState, useCallback, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Contact, Category } from '@/types/contact';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase'; // Corrected import path
import { v4 as uuidv4 } from 'uuid'; // Import uuid

const CONTACT_LOGOS_BUCKET = 'contact-images'; // Use the existing bucket name

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
  const updateContact = useCallback(async (updatedContactData: Contact & { imageFile?: File | null, removeLogo?: boolean }) => {
    try {
      // Validate that we have an ID
      if (!updatedContactData.id) {
        throw new Error('Contact ID is required for updates');
      }

      let newImageUrl: string | null = updatedContactData.image_url || null;
      const currentImagePath = getPathFromUrl(updatedContactData.image_url);

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
