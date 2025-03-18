import { useState, useEffect, useCallback } from "react";
import { Contact, Category } from "../types/contact";
import { toast } from "sonner";
import { API_URL } from "../config/env";

export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<Category>("All");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch contacts from API
  useEffect(() => {
    const fetchContacts = async () => {
      try {
        setIsLoading(true);
        
        // Add a timestamp to bypass cache issues
        const timestamp = new Date().getTime();
        const apiUrl = `${API_URL}/get_directory_data?_t=${timestamp}`;
        
        console.log("Fetching data from:", apiUrl);
        
        // Try using fetch with proper CORS headers
        console.log("About to fetch from:", apiUrl);
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
          },
          // Credentials can be included when both services are on the same domain or CORS is properly configured
          // credentials: 'include'
        });
        
        console.log("Response status:", response.status);
        console.log("Response headers:", Object.fromEntries([...response.headers.entries()]));
        
        if (!response.ok) {
          console.error("API returned error status:", response.status);
          throw new Error(`API returned status ${response.status}`);
        }
        
        const responseText = await response.text();
        console.log("Raw response:", responseText.substring(0, 300) + "...");
        
        let data;
        try {
          data = JSON.parse(responseText);
          console.log("API data parsed successfully");
          console.log("API data type:", typeof data);
          
          // Check if data is a string that might be another JSON
          if (typeof data === 'string' && data.trim().startsWith('{') || data.trim().startsWith('[')) {
            console.log("Data appears to be string-encoded JSON. Trying to parse again...");
            try {
              data = JSON.parse(data);
              console.log("Double-encoded JSON successfully parsed");
            } catch (nestedErr) {
              console.warn("Failed to parse string as nested JSON. Continuing with string value.");
            }
          }
          
          console.log("Is array:", Array.isArray(data));
          console.log("Data length (if array):", Array.isArray(data) ? data.length : 'not an array');
          console.log("First item (if exists):", Array.isArray(data) && data.length > 0 ? JSON.stringify(data[0]).substring(0, 300) + "..." : 'no items');
          
          // If data is an object with a 'records' property that's an array, use that
          if (!Array.isArray(data) && typeof data === 'object' && data !== null) {
            console.log("Data is an object. Looking for common array properties...");
            const commonArrayProps = ['records', 'data', 'items', 'results', 'values'];
            
            for (const prop of commonArrayProps) {
              if (data[prop] && Array.isArray(data[prop])) {
                console.log(`Found array in property '${prop}' with ${data[prop].length} items`);
                if (data[prop].length > 0) {
                  console.log(`First item in '${prop}':`, JSON.stringify(data[prop][0]).substring(0, 300) + "...");
                  data = data[prop];
                  break;
                }
              }
            }
          }
        } catch (err) {
          console.error("Error parsing JSON:", err);
          throw new Error(`Failed to parse API response as JSON: ${err.message}`);
        }
        
        // If data is empty or not an array, handle gracefully
        if (!data) {
          console.warn("API returned null or undefined data");
          fallbackToMockData("API returned null or undefined data");
          return;
        }
        
        if (!Array.isArray(data)) {
          console.warn("API returned non-array data:", typeof data);
          console.warn("Data sample:", JSON.stringify(data).substring(0, 300));
          
          // First, specifically check for Airtable's 'records' property
          if (data && typeof data === 'object' && 'records' in data && Array.isArray(data.records)) {
            console.log("Found Airtable 'records' array with", data.records.length, "items");
            if (data.records.length > 0) {
              console.log("First record sample:", JSON.stringify(data.records[0]).substring(0, 300));
            }
            data = data.records;
          } else {
            // If no 'records' property, check for any array property
            const possibleArrayKeys = Object.keys(data).filter(key => Array.isArray(data[key]));
            if (possibleArrayKeys.length > 0) {
              console.log("Found possible array data in properties:", possibleArrayKeys);
              console.log("Using data from property:", possibleArrayKeys[0]);
              
              // Try using the first array property
              data = data[possibleArrayKeys[0]];
              
              if (data.length === 0) {
                console.warn("Found array property but it's empty");
                fallbackToMockData("API returned empty array data");
                return;
              }
            }
            
            if (Array.isArray(data)) {
              console.log("Continuing with array data from property", possibleArrayKeys[0]);
            } else {
              fallbackToMockData("API returned non-array data");
              return;
            }
          }
        }
        
        if (data.length === 0) {
          console.warn("API returned empty array");
          fallbackToMockData("API returned empty array");
          return;
        }
        
        // Map API data to our Contact type
        console.log('First item structure:', data[0]);
        console.log('First item keys:', data[0] ? Object.keys(data[0]) : 'no keys');
        
        // Debugging the expected structure
        if (data[0]) {
          console.log('Has fields property:', 'fields' in data[0]);
          if ('fields' in data[0]) {
            console.log('Fields keys:', Object.keys(data[0].fields));
          } else {
            console.log('Item doesn\'t have fields property. Available properties:', Object.keys(data[0]));
          }
        }
        
        const mappedContacts: Contact[] = data.map((item: any, index: number) => {
          console.log(`Mapping item ${index}...`);
          
          // Ensure we have the fields property (Airtable format)
          if (!item.fields) {
            console.warn(`Item ${index} missing 'fields' property, available keys:`, Object.keys(item));
            console.warn(`Item ${index} content sample:`, JSON.stringify(item).substring(0, 300));
          }
          
          // Extract fields from Airtable structure
          const fields = item.fields || {};
          console.log(`Item ${index} fields:`, fields);
          
          // Get website URL - first try direct field, then fallback to Formatted Link
          let website = '';
          if (fields['Website URL']) {
            website = fields['Website URL'];
            // Add https:// if not present
            if (!website.startsWith('http')) {
              website = 'https://' + website;
            }
          } else if (fields['Open URL'] && fields['Open URL'].url) {
            website = fields['Open URL'].url;
            // Add https:// if not present
            if (!website.startsWith('http')) {
              website = 'https://' + website;
            }
          } else if (fields['Formatted Link']) {
            const websiteMatch = fields['Formatted Link'].match(/\[Website\]\(([^)]+)\)/);
            if (websiteMatch && websiteMatch[1]) {
              website = websiteMatch[1];
              // Add https:// if not present
              if (!website.startsWith('http')) {
                website = 'https://' + website;
              }
            }
          }
          
          // Get phone number - first try direct field, then fallback to Formatted Link
          let phone = '';
          if (fields['Phone Number']) {
            phone = fields['Phone Number'];
            // Format if needed - add + if it's just digits
            if (/^\d+$/.test(phone) && !phone.startsWith('+')) {
              phone = '+' + phone;
            }
          } else if (fields['Formatted Link']) {
            const phoneMatch = fields['Formatted Link'].match(/\[WhatsApp\]\(https:\/\/api\.whatsapp\.com\/send\/\?phone=(%2B\d+)\)/);
            if (phoneMatch && phoneMatch[1]) {
              // Decode the URL-encoded phone number
              phone = decodeURIComponent(phoneMatch[1]);
            }
          }
          
          // Get logo URL if available
          let avatarUrl = '';
          if (fields.Logo && fields.Logo.length > 0 && fields.Logo[0].url) {
            avatarUrl = fields.Logo[0].url;
          }
          
          // Map category
          const category = fields.Category && fields.Category.length > 0 ? 
            mapCategoryFromAPI(fields.Category[0]) : 'Service';
          
          return {
            id: item.id?.toString() || `temp-${Date.now()}-${Math.random()}`,
            name: fields.Title || '', // Name is stored as Title in Airtable
            category,
            description: fields.Subtitle || '', // Description is stored as Subtitle in Airtable
            phone,
            website,
            avatarUrl
          };
        });
        
        console.log("Mapped contacts:", mappedContacts);
        setContacts(mappedContacts);
        setFilteredContacts(mappedContacts);
        setIsLoading(false);
        
      } catch (err) {
        console.error("Error fetching data:", err);
        fallbackToMockData(err instanceof Error ? err.message : "Unknown error");
      }
    };
    
    const fallbackToMockData = (errorMsg: string) => {
      console.error(`Falling back to mock data: ${errorMsg}`);
      
      // Mock data for fallback
      const mockContacts: Contact[] = [
        {
          id: "1",
          name: "Allan Sallas Airport",
          category: "Car",
          description: "Airport Service/Pickup and Drop off/Tours Guide/Expatriate Adviser/Large Shuttle",
          phone: "50662932423",
          website: "https://allansallasairport.com"
        },
        {
          id: "2",
          name: "Allan Taxi",
          category: "Car",
          description: "Trips to the airport 35,000 colones ir ($70), there is no additional cost if you need to make purchases 1 hour of free waiting. Alegria to San Mateo 5000. Alegria orotina 7000",
          phone: "50661066073",
          website: ""
        },
        {
          id: "3",
          name: "Andres Gomez",
          category: "Service",
          description: "Immigration Attorney based in Atenas.",
          phone: "50670700909",
          website: "https://andreslaw.cr"
        },
        {
          id: "4",
          name: "Coastal Properties",
          category: "Real Estate",
          description: "Real estate agency specializing in coastal properties",
          phone: "50688991234",
          website: "https://example.com/coastal"
        },
        {
          id: "5",
          name: "Tropical Fruits Market",
          category: "Groceries",
          description: "Fresh local and exotic fruits, home delivery available",
          phone: "50677883456",
          website: "https://tropicalfruitsmarket.com"
        }
      ];
      
      setContacts(mockContacts);
      setFilteredContacts(mockContacts);
      setError(errorMsg);
      setIsLoading(false);
      toast.error("Couldn't connect to server, showing sample data instead");
    };

    fetchContacts();
  }, []);

  // Helper function to map API categories to our Category type
  const mapCategoryFromAPI = (apiCategory: string): Category => {
    // Check if the category is already in the correct format
    if (apiCategory === "Mind Body & Spirit" || 
        apiCategory === "Car" || 
        apiCategory === "Food Ordering" || 
        apiCategory === "Groceries" || 
        apiCategory === "Jobs" || 
        apiCategory === "Nature" || 
        apiCategory === "Real Estate" || 
        apiCategory === "Restaurant" || 
        apiCategory === "Service" || 
        apiCategory === "Social Network" || 
        apiCategory === "Taxi") {
      return apiCategory as Category;
    }
    
    // Convert the API category to match our Category type
    const categoryMap: Record<string, Category> = {
      // Handle variations and lowercase versions
      "car": "Car",
      "food": "Food Ordering",
      "food ordering": "Food Ordering",
      "groceries": "Groceries",
      "jobs": "Jobs",
      "mind body & spirit": "Mind Body & Spirit",
      "mind body and spirit": "Mind Body & Spirit",
      "nature": "Nature",
      "real estate": "Real Estate",
      "restaurant": "Restaurant",
      "service": "Service",
      "social network": "Social Network",
      "taxi": "Taxi",
    };
    
    // Return the mapped category or default to "Service" if no match
    return (categoryMap[apiCategory?.toLowerCase()] as Category) || "Service";
  };

  // Filter contacts based on search query and category
  useEffect(() => {
    let results = contacts;

    // Filter by category
    if (selectedCategory !== "All") {
      results = results.filter(contact => contact.category === selectedCategory);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      results = results.filter(
        contact =>
          contact.name.toLowerCase().includes(query) ||
          contact.description.toLowerCase().includes(query) ||
          contact.category.toLowerCase().includes(query) ||
          contact.phone.toLowerCase().includes(query)
      );
    }

    setFilteredContacts(results);
  }, [contacts, searchQuery, selectedCategory]);

  // Add a new contact
  const addContact = useCallback(async (newContact: Omit<Contact, "id">) => {
    try {
      // In a real app, this would be an API call
      // const response = await fetch('/api/contacts', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(newContact)
      // });
      // const data = await response.json();
      
      // Generate a temporary ID
      const tempContact: Contact = {
        ...newContact,
        id: `temp-${Date.now()}`
      };
      
      setContacts(prev => [...prev, tempContact]);
      toast.success("Contact added successfully");
      return true;
    } catch (err) {
      toast.error("Failed to add contact");
      return false;
    }
  }, []);

  // Update an existing contact
  const updateContact = useCallback(async (updatedContact: Contact) => {
    try {
      // In a real app, this would be an API call
      // const response = await fetch(`/api/contacts/${updatedContact.id}`, {
      //   method: 'PUT',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(updatedContact)
      // });
      // const data = await response.json();
      
      setContacts(prev => 
        prev.map(contact => 
          contact.id === updatedContact.id ? updatedContact : contact
        )
      );
      
      toast.success("Contact updated successfully");
      return true;
    } catch (err) {
      toast.error("Failed to update contact");
      return false;
    }
  }, []);

  // Delete a contact
  const deleteContact = useCallback(async (id: string) => {
    try {
      // In a real app, this would be an API call
      // await fetch(`/api/contacts/${id}`, {
      //   method: 'DELETE'
      // });
      
      setContacts(prev => prev.filter(contact => contact.id !== id));
      toast.success("Contact deleted successfully");
      return true;
    } catch (err) {
      toast.error("Failed to delete contact");
      return false;
    }
  }, []);

  return {
    contacts: filteredContacts,
    isLoading,
    error,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    addContact,
    updateContact,
    deleteContact
  };
}
