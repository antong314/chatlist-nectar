// Custom hook to manage contacts
import { useState, useCallback, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Contact, Category } from '@/types/contact';
import { useSearchParams } from 'react-router-dom';

// Server API URL - dynamically determined based on environment
const API_URL = import.meta.env.DEV 
  ? 'http://192.168.68.58:5000' // Use the same network IP as the client to avoid CORS issues
  : 'https://machu-server-app-2tn7n.ondigitalocean.app';

/**
 * Custom hook for managing contacts
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
  const initialCategory = searchParams.get('category') || 'All';
  
  // State for search and filtering
  const [searchQuery, setSearchQueryState] = useState<string>(initialSearch);
  const [selectedCategory, setSelectedCategoryState] = useState<Category>(initialCategory as Category);
  
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

  // Function to sort contacts alphabetically
  const sortContactsAlphabetically = (contactsToSort: Contact[]): Contact[] => {
    return [...contactsToSort].sort((a, b) => a.name.localeCompare(b.name));
  };

  // Fetch contacts from the server
  useEffect(() => {
    const fetchContacts = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch contacts from the API - use /get_directory_data endpoint
        const response = await fetch(`${API_URL}/get_directory_data`);
        
        // Get the raw response text
        const responseText = await response.text();
        
        // Check if the response is HTML instead of JSON
        if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
          console.error("Received HTML response instead of JSON");
          
          // Extract a more useful error message if possible
          const titleMatch = responseText.match(/<title>(.*?)<\/title>/i);
          const errorMessage = titleMatch ? titleMatch[1] : 'Server returned HTML instead of JSON';
          
          throw new Error(`API Error: ${errorMessage}`);
        }
        
        try {
          // Parse the response text as JSON
          const data = JSON.parse(responseText);
          
          // Log the structure for debugging
          console.log('API Response Structure:', JSON.stringify(data, null, 2).substring(0, 500));
          if (data.records && data.records.length > 0) {
            console.log('First record sample:', JSON.stringify(data.records[0], null, 2));
          }
          
          // Check if the data contains a records array (Airtable format)
          const recordsArray = data.records || data;
          
          // Map the data to our Contact type
          const fetchedContacts: Contact[] = recordsArray.map((contactData: any) => {
            // Check if this is Airtable format with nested fields
            const fields = contactData.fields || contactData;
            
            // Debug first record only to keep console clean
            if (recordsArray.indexOf(contactData) === 0) {
              console.log('Sample record fields:', fields);
            }
            
            return {
              id: contactData.id || contactData._id,
              name: fields.Title || '',
              description: fields.Subtitle || '',
              category: fields.Category?.[0] || 'General',
              phone: fields['Phone Number'] || '',
              website: fields['Website URL'] || '',
              logoUrl: fields.Logo?.[0]?.thumbnails?.large?.url || fields.Logo?.[0]?.url || fields.LogoUrl || fields.CloudinaryUrl || '',
              avatarUrl: fields.Logo?.[0]?.thumbnails?.large?.url || fields.Logo?.[0]?.url || fields.LogoUrl || fields.CloudinaryUrl || '',
            };
          });

          // Sort contacts alphabetically and update state
          setContacts(sortContactsAlphabetically(fetchedContacts));
        } catch (parseError) {
          console.error("Error parsing JSON response:", parseError);
          // Show a snippet of the invalid JSON response (limit to prevent huge logs)
          console.error("Response text (first 50 chars):", responseText.substring(0, 50));
          throw new Error(`Invalid JSON response: ${parseError.message}`);
        }
      } catch (err) {
        setError(err.message || 'Error fetching contacts');
        console.error('Error fetching contacts:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchContacts();
  }, [refreshTrigger]);

  // Function to refresh contacts
  const refreshContacts = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  // Add a new contact
  const addContact = useCallback(async (newContact: Omit<Contact, "id">) => {
    // Attempt to add a new contact
    try {
      // Check if we have any logo/image file upload from the form
      // We need to create a multipart FormData to handle file uploads
      const fileInput = document.getElementById('form-logo') as HTMLInputElement;
      const logoRemovedFlag = document.getElementById('logo-removed-flag') as HTMLInputElement;
      
      // Determine logo action based on DOM elements
      let logoAction = 'keep'; // Default action
      let logoFile = null;
      
      if (fileInput && fileInput.files && fileInput.files.length > 0) {
        logoAction = 'upload';
        logoFile = fileInput.files[0];
      } else if (logoRemovedFlag && logoRemovedFlag.value === 'true') {
        logoAction = 'remove';
      }

      // Use multipart FormData for file uploads
      const multipartFormData = new FormData();
      
      // Add each field directly to FormData to match server expectations
      multipartFormData.append('Title', newContact.name.trim());
      multipartFormData.append('Category', JSON.stringify([newContact.category])); // Category as JSON array
      multipartFormData.append('Subtitle', newContact.description.trim());
      multipartFormData.append('Phone Number', newContact.phone.trim());
      multipartFormData.append('Website URL', newContact.website?.trim() || '');
      
      // Append logo action and file if needed
      multipartFormData.append('logo_action', logoAction);
      if (logoFile) {
        multipartFormData.append('logo_file', logoFile);
      }
      
      // Log what we're sending to help debug
      console.log('Sending add request to:', `${API_URL}/add_directory_entry`);  
      
      // Log FormData content (this is for debugging only)
      console.log('Form data contents:');
      for (const pair of multipartFormData.entries()) {
        console.log(`${pair[0]}: ${pair[1]}`);
      }
      
      // Make the API call to add the contact to the server - use /add_directory_entry endpoint
      // The server expects multipart/form-data for logo uploads
      const response = await fetch(`${API_URL}/add_directory_entry`, {
        method: 'POST',
        // Don't set Content-Type header - browser will set it with the boundary
        body: multipartFormData
      });
      
      // Get the raw response text
      const responseText = await response.text();
      
      // Check if the response is HTML instead of JSON
      if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
        console.error("Received HTML response instead of JSON");
        
        // Extract a more useful error message if possible
        const titleMatch = responseText.match(/<title>(.*?)<\/title>/i);
        const errorMessage = titleMatch ? titleMatch[1] : 'Server returned HTML instead of JSON';
        
        throw new Error(`API Error: ${errorMessage}`);
      }
      
      let data;
      try {
        // Parse the response text as JSON
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error("Error parsing JSON response:", parseError);
        // Show a snippet of the invalid JSON response (limit to prevent huge logs)
        console.error("Response text (first 50 chars):", responseText.substring(0, 50));
        throw new Error(`Invalid JSON response: ${parseError.message}`);
      }
      
      if (!data.success) {
        throw new Error(data.error || 'Error adding contact');
      }
      
      // Process API response data
      
      // Get the new contact ID from the response
      const id = data.id;
      
      // Get the logo URL from the response if available
      const logoUrl = data.logoUrl || '';
      
      // Create a temporary contact with the new ID
      const tempContact: Contact = {
        id,
        name: newContact.name,
        description: newContact.description,
        category: newContact.category,
        phone: newContact.phone,
        website: newContact.website || '',
        logoUrl: logoUrl
      };
      
      // Add new contact and maintain alphabetical sorting
      setContacts(prev => {
        const updatedContacts = [...prev, tempContact];
        return sortContactsAlphabetically(updatedContacts);
      });
      
      toast.success("Contact added successfully");
      return true;
    } catch (err) {
      console.error('Error adding contact:', err);
      toast.error(`Error adding contact: ${err.message}`);
      return false;
    }
  }, []);

  // Update an existing contact
  const updateContact = useCallback(async (updatedContact: Contact) => {
    // Attempt to update an existing contact
    try {
      // Validate that we have a record_id for updates
      if (!updatedContact.id) {
        throw new Error('Record ID is required for updates');
      }

      console.log('Updating contact with ID:', updatedContact.id);
      
      // Check if we have any logo/image file upload from the form
      const fileInput = document.getElementById('form-logo') as HTMLInputElement;
      const logoRemovedFlag = document.getElementById('logo-removed-flag') as HTMLInputElement;
      
      // Determine logo action based on DOM elements
      let logoAction = 'keep'; // Default action
      let logoFile = null;
      
      if (fileInput && fileInput.files && fileInput.files.length > 0) {
        logoAction = 'upload';
        logoFile = fileInput.files[0];
      } else if (logoRemovedFlag && logoRemovedFlag.value === 'true') {
        logoAction = 'remove';
      }

      // Use multipart FormData for file uploads
      const multipartFormData = new FormData();
      
      // Add each field directly to FormData to match server expectations
      multipartFormData.append('Title', updatedContact.name.trim());
      multipartFormData.append('Category', JSON.stringify([updatedContact.category])); // Category as JSON array
      multipartFormData.append('Subtitle', updatedContact.description.trim());
      multipartFormData.append('Phone Number', updatedContact.phone.trim());
      multipartFormData.append('Website URL', updatedContact.website?.trim() || '');
      
      // Always include record_id for updates and ensure it's correctly set
      if (!updatedContact.id) {
        console.error('Missing record_id for update operation');
        throw new Error('Record ID is required for updates');
      }
      console.log('Setting record_id for update:', updatedContact.id);
      // Debug: Log record_id type before appending
      console.log('Record ID before append:', updatedContact.id, '(type:', typeof updatedContact.id, ')');
      
      // Ensure record_id is a string
      multipartFormData.append('record_id', String(updatedContact.id));
      
      // Append logo action and file if needed
      multipartFormData.append('logo_action', logoAction);
      if (logoFile) {
        multipartFormData.append('logo_file', logoFile);
      }
      
      // Log what we're sending to help debug
      console.log('Sending update to:', `${API_URL}/update_directory_entry`);
      
      // Create a JSON object to represent what we're sending
      const debugPayload = {
        Title: updatedContact.name.trim(),
        Category: JSON.stringify([updatedContact.category]),
        Subtitle: updatedContact.description.trim(),
        'Phone Number': updatedContact.phone.trim(),
        'Website URL': updatedContact.website?.trim() || '',
        record_id: updatedContact.id,
        logo_action: logoAction
      };
      
      // Log the full contact object and the payload
      console.log('Full contact object:', updatedContact);
      console.log('JSON payload representation:', debugPayload);
      
      // Log FormData content (this is for debugging only)
      console.log('Form data contents:');
      for (const pair of multipartFormData.entries()) {
        console.log(`${pair[0]}: ${pair[1]}`);
      }
      
      // Make the API call to update the contact on the server
      const response = await fetch(`${API_URL}/update_directory_entry`, {
        method: 'POST',
        // Don't set Content-Type header for multipart/form-data
        body: multipartFormData
      });
      
      // Get the raw response text
      const responseText = await response.text();
      
      // Check if the response is HTML instead of JSON
      if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
        console.error("Received HTML response instead of JSON");
        
        // Extract a more useful error message if possible
        const titleMatch = responseText.match(/<title>(.*?)<\/title>/i);
        const errorMessage = titleMatch ? titleMatch[1] : 'Server returned HTML instead of JSON';
        
        throw new Error(`API Error: ${errorMessage}`);
      }
      
      let data;
      try {
        // Parse the response text as JSON
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error("Error parsing JSON response:", parseError);
        // Show a snippet of the invalid JSON response (limit to prevent huge logs)
        console.error("Response text (first 50 chars):", responseText.substring(0, 50));
        throw new Error(`Invalid JSON response: ${parseError.message}`);
      }
      
      if (!data.success) {
        throw new Error(data.error || 'Error updating contact');
      }
      
      // Process API response data
      
      // Get the logo URL from the response if available
      const logoUrl = data.logoUrl || updatedContact.logoUrl;

      // Create updated contact with possible new logo URL
      const updatedContactWithLogo = {
        ...updatedContact,
        logoUrl
      };
      
      // Update the contacts state with the updated contact
      setContacts(prev => {
        // Update the contact
        const updatedContacts = prev.map(contact => 
          contact.id === updatedContact.id ? updatedContactWithLogo : contact
        );
        
        // Maintain alphabetical sorting
        return sortContactsAlphabetically(updatedContacts);
      });
      
      toast.success("Contact updated successfully");
      return true;
    } catch (err) {
      console.error('Error updating contact:', err);
      toast.error(`Error updating contact: ${err.message}`);
      return false;
    }
  }, []);

  // Delete a contact
  const deleteContact = useCallback(async (contactId: string) => {
    // Attempt to delete a contact
    try {
      // Create form data with the record ID
      const formData = new FormData();
      formData.append('record_id', contactId); 
      
      // Make API call to delete the contact
      const response = await fetch(`${API_URL}/delete_directory_entry`, {
        method: 'POST',
        body: formData
      });
      
      // Get the raw response text
      const responseText = await response.text();
      
      // Check if the response is HTML instead of JSON
      if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
        console.error("Received HTML response instead of JSON");
        
        // Extract a more useful error message if possible
        const titleMatch = responseText.match(/<title>(.*?)<\/title>/i);
        const errorMessage = titleMatch ? titleMatch[1] : 'Server returned HTML instead of JSON';
        
        throw new Error(`API Error: ${errorMessage}`);
      }
      
      let data;
      try {
        // Parse the response text as JSON
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error("Error parsing JSON response:", parseError);
        // Show a snippet of the invalid JSON response (limit to prevent huge logs)
        console.error("Response text (first 50 chars):", responseText.substring(0, 50));
        throw new Error(`Invalid JSON response: ${parseError.message}`);
      }
      
      if (!data.success) {
        throw new Error(data.error || 'Error deleting contact');
      }
      
      // Remove the deleted contact from state
      setContacts(prev => prev.filter(contact => contact.id !== contactId));
      
      toast.success("Contact deleted successfully");
      return true;
    } catch (err) {
      console.error('Error deleting contact:', err);
      toast.error(`Error deleting contact: ${err.message}`);
      return false;
    }
  }, []);

  // Apply search query and category filters
  const filteredContacts = useMemo(() => {
    return contacts.filter(contact => {
      // First filter by search query
      const matchesSearch = searchQuery.trim() === '' || 
        contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contact.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (contact.category && contact.category.toLowerCase().includes(searchQuery.toLowerCase()));
      
      // Then filter by category
      const matchesCategory = selectedCategory === 'All' || contact.category === selectedCategory;
      
      // Return true if matches both filters
      return matchesSearch && matchesCategory;
    });
  }, [contacts, searchQuery, selectedCategory]);

  // Extract unique categories from the contacts data
  const uniqueCategories = useMemo(() => {
    // Get all unique categories from contacts
    const categorySet = new Set<string>();
    
    // Add each unique category to the set
    contacts.forEach(contact => {
      if (contact.category) {
        categorySet.add(contact.category);
      }
    });
    
    // Convert set to sorted array
    return ['All', ...Array.from(categorySet).sort()] as Category[];
  }, [contacts]);
  
  // Return the hook state and functions
  return {
    contacts: filteredContacts,
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
