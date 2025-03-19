// Debug file to test contact updates
import { Contact } from '@/types/contact';

/**
 * Helper function to send a contact update to the server
 */
export const sendContactUpdate = async (contact: Contact, apiUrl: string) => {
  try {
    if (!contact.id) {
      console.error('Cannot update contact without an ID');
      return { success: false, error: 'Record ID is required for updates' };
    }
    
    console.log('Updating contact with ID:', contact.id);
    
    // Create FormData
    const formData = new FormData();
    
    // Add required fields
    formData.append('Title', contact.name);
    formData.append('Category', JSON.stringify([contact.category]));
    formData.append('Subtitle', contact.description);
    formData.append('Phone Number', contact.phone);
    formData.append('Website URL', contact.website || '');
    formData.append('record_id', contact.id);
    
    // Log what we're sending
    console.log('Updating contact at:', `${apiUrl}/update_directory_entry`);
    console.log('Form data contents:');
    for (const pair of formData.entries()) {
      console.log(`${pair[0]}: ${pair[1]}`);
    }
    
    // Send request
    const response = await fetch(`${apiUrl}/update_directory_entry`, {
      method: 'POST',
      body: formData
    });
    
    console.log('Response status:', response.status, response.statusText);
    
    const responseText = await response.text();
    console.log('Response text:', responseText.substring(0, 200));
    
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
