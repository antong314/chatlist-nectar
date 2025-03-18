
import { useState, useEffect, useCallback } from "react";
import { Contact, Category } from "../types/contact";
import { toast } from "sonner";

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
        const apiUrl = `https://machu-server-app-2tn7n.ondigitalocean.app/get_directory_data?_t=${timestamp}`;
        
        console.log("Fetching data from:", apiUrl);
        
        // Try to fetch with no-cors mode to see if that helps
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
          }
        });
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log("API data received:", data);
        
        // If data is empty or not an array, handle gracefully
        if (!data || !Array.isArray(data) || data.length === 0) {
          console.warn("API returned empty data or invalid format");
          setContacts([]);
          setFilteredContacts([]);
          setIsLoading(false);
          return;
        }
        
        // Map API data to our Contact type
        const mappedContacts: Contact[] = data.map((item: any) => ({
          id: item.id?.toString() || `temp-${Date.now()}-${Math.random()}`,
          name: item.name || "",
          category: mapCategoryFromAPI(item.category || "Service"),
          description: item.description || "",
          phone: item.phone || "",
          website: item.website || "",
        }));
        
        console.log("Mapped contacts:", mappedContacts);
        setContacts(mappedContacts);
        setFilteredContacts(mappedContacts);
        setIsLoading(false);
      } catch (err) {
        console.error("Error fetching contacts:", err);
        
        // Fallback to mock data if API fails
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
        setError("Failed to fetch contacts from API, showing mock data");
        setIsLoading(false);
        toast.error("Couldn't connect to server, showing sample data instead");
      }
    };

    fetchContacts();
  }, []);

  // Helper function to map API categories to our Category type
  const mapCategoryFromAPI = (apiCategory: string): Category => {
    // Convert the API category to match our Category type
    const categoryMap: Record<string, Category> = {
      // Add mappings as needed
      "car": "Car",
      "food": "Food Ordering",
      "groceries": "Groceries",
      "jobs": "Jobs",
      "mind_body_spirit": "Mind Body & Spirit",
      "nature": "Nature",
      "real_estate": "Real Estate",
      "restaurant": "Restaurant",
      "service": "Service",
      "social_network": "Social Network",
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
