// Debug file to test contact updates
import { Contact } from '@/types/contact';
import { logFormData, logApiResponse } from '@/utils/debug-logger';

/**
 * Helper function to send a contact update to the server
 */
export const sendContactUpdate = async (contact: Contact, apiUrl: string) => {
  try {
    if (!contact.id) {
      console.error('Cannot update contact without an ID');
      return { success: false, error: 'Record ID is required for updates' };
    }
    
    console.log('Updating contact:', contact);
    console.log('Contact ID type:', typeof contact.id);
    
    // Create FormData
    const formData = new FormData();
    
    // Add required fields
    formData.append('Title', contact.name);
    formData.append('Category', JSON.stringify([contact.category]));
    formData.append('Subtitle', contact.description);
    formData.append('Phone Number', contact.phone);
    formData.append('Website URL', contact.website || '');
    formData.append('record_id', contact.id);
    
    // Log what we're sending with enhanced logger
    console.log('Updating contact at:', `${apiUrl}/update_directory_entry`);
    logFormData(formData, 'Update Contact FormData');
    
    // Also log as a plain JSON object for comparison
    console.log('Contact as JSON:', {
      'Title': contact.name,
      'Category': JSON.stringify([contact.category]),
      'Subtitle': contact.description,
      'Phone Number': contact.phone,
      'Website URL': contact.website || '',
      'record_id': contact.id
    });
    
    // Send request
    const response = await fetch(`${apiUrl}/update_directory_entry`, {
      method: 'POST',
      body: formData
    });
    
    const responseText = await response.text();
    await logApiResponse(response, responseText, 'Update Contact Response');
    
    if (!responseText.trim()) {
      return { success: false, error: 'Empty response from server' };
    }
    
    return { 
      success: true, 
      data: JSON.parse(responseText),
      rawResponse: responseText
    };
  } catch (error) {
    console.error('Error in debug update:', error);
    return { success: false, error: String(error) };
  }
};
