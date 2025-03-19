/**
 * Debug utilities for fetch requests
 */

// Store the original fetch
const originalFetch = window.fetch;

/**
 * A decorated fetch function that logs request and response details
 */
const debugFetch = async (
  input: RequestInfo | URL, 
  init?: RequestInit
): Promise<Response> => {
  // Log the request details
  // Format request URL for logging
  const requestUrl = typeof input === 'string' 
    ? input 
    : input instanceof URL 
      ? input.toString() 
      : input.url;
  
  console.group(`📤 Fetch Request: ${requestUrl}`);
  console.log('URL:', requestUrl);
  console.log('Method:', init?.method || 'GET');
  
  // Log headers
  if (init?.headers) {
    console.log('Headers:', init.headers);
  }
  
  // Log request body, handling different formats
  if (init?.body) {
    if (init.body instanceof FormData) {
      console.log('Body (FormData):');
      const formDataEntries: Record<string, any> = {};
      for (const pair of (init.body as FormData).entries()) {
        const [key, value] = pair;
        formDataEntries[key] = value instanceof File 
          ? `File: ${value.name} (${value.type}, ${value.size} bytes)` 
          : value;
        
        console.log(`  ${key}: ${formDataEntries[key]}`);
      }
    } else if (typeof init.body === 'string') {
      try {
        // Try to parse as JSON
        const jsonBody = JSON.parse(init.body);
        console.log('Body (JSON):', jsonBody);
      } catch (e) {
        // Not JSON, log as string
        console.log('Body (String):', init.body);
      }
    } else {
      console.log('Body:', init.body);
    }
  }
  
  try {
    // Make the actual fetch call
    const startTime = performance.now();
    const response = await originalFetch(input, init);
    const endTime = performance.now();
    
    // Clone the response so we can read the body without consuming it
    const clonedResponse = response.clone();
    
    // Log response details
    console.log('📥 Response:');
    console.log('Status:', response.status, response.statusText);
    console.log('Time:', (endTime - startTime).toFixed(2), 'ms');
    
    // Try to get the response body
    try {
      const text = await clonedResponse.text();
      if (text) {
        // Try to parse as JSON
        try {
          const json = JSON.parse(text);
          console.log('Response body (JSON):', json);
        } catch (e) {
          // Not JSON, show as text
          if (text.length > 500) {
            console.log('Response body (Text, truncated):', text.substring(0, 500) + '...');
          } else {
            console.log('Response body (Text):', text);
          }
        }
      } else {
        console.log('Response body: Empty');
      }
    } catch (error) {
      console.log('Could not read response body:', error);
    }
    
    console.groupEnd();
    return response;
  } catch (error) {
    console.error('❌ Fetch error:', error);
    console.groupEnd();
    throw error;
  }
};

/**
 * Enable fetch debugging by replacing the global fetch with our debug version
 */
export const enableFetchDebugging = (): void => {
  window.fetch = debugFetch;
  console.log('📝 Fetch debugging enabled');
};

/**
 * Disable fetch debugging by restoring the original fetch function
 */
export const disableFetchDebugging = (): void => {
  window.fetch = originalFetch;
  console.log('📝 Fetch debugging disabled');
};

// Add to window for console access
declare global {
  interface Window {
    debugFetch: {
      enable: () => void;
      disable: () => void;
    };
  }
}

// Make debug functions available globally
if (typeof window !== 'undefined') {
  window.debugFetch = {
    enable: enableFetchDebugging,
    disable: disableFetchDebugging
  };
}
