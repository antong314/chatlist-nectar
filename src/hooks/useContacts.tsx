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
        
        if (!response.ok) {
          console.error("API returned error status:", response.status);
          throw new Error(`API returned status ${response.status}`);
        }
        
        const data = await response.json();
        console.log("API data received:", data);
        
        // If data is empty or not an array, handle gracefully
        if (!data || !Array.isArray(data) || data.length === 0) {
          console.warn("API returned empty data or invalid format");
          fallbackToMockData("API returned empty data");
          return;
        }
        
        // Map API data to our Contact type
        console.log('First item structure:', data[0]);
        const mappedContacts: Contact[] = data.map((item: any) => {
          // Extract fields from Airtable structure
          const fields = item.fields || {};
          
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
