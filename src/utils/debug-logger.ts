/**
 * Debug logger utility to help debug API requests and responses
 */

/**
 * Log FormData contents in a human-readable format
 * @param formData The FormData object to log
 * @param prefix Optional prefix for log messages
 */
export const logFormData = (formData: FormData, prefix: string = 'FormData'): void => {
  console.group(`${prefix} contents:`);
  
  // Create a JSON representation of the FormData
  const jsonRepresentation: Record<string, any> = {};
  
  // Iterate through FormData entries and collect them
  for (const pair of formData.entries()) {
    const [key, value] = pair;
    
    // Handle special case for file objects
    if (value instanceof File) {
      jsonRepresentation[key] = `[File: ${value.name}, size: ${value.size} bytes, type: ${value.type}]`;
    } else {
      jsonRepresentation[key] = value;
    }
    
    // Log individual entries
    console.log(`${key}: ${jsonRepresentation[key]}`);
  }
  
  // Log the full JSON representation
  console.log('JSON representation:', jsonRepresentation);
  console.groupEnd();
};

/**
 * Log API response details
 * @param response The fetch Response object
 * @param responseText The response text content
 * @param prefix Optional prefix for log messages
 */
export const logApiResponse = async (
  response: Response, 
  responseText?: string,
  prefix: string = 'API Response'
): Promise<void> => {
  console.group(`${prefix}:`);
  console.log('Status:', response.status, response.statusText);
  
  // If responseText wasn't provided, try to get it
  let text = responseText;
  if (!text) {
    try {
      // Clone the response to avoid consuming the body
      const clonedResponse = response.clone();
      text = await clonedResponse.text();
    } catch (error) {
      console.log('Could not get response text:', error);
    }
  }
  
  if (text) {
    console.log('Raw response:', text.substring(0, 200));
    
    // Try to parse JSON
    try {
      const json = JSON.parse(text);
      console.log('Parsed JSON:', json);
    } catch (error) {
      console.log('Response is not valid JSON');
    }
  }
  
  console.groupEnd();
};
