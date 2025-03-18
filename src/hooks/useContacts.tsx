
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
        const response = await fetch('https://machu-server-app-2tn7n.ondigitalocean.app/get_directory_data');
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Map API data to our Contact type
        const mappedContacts: Contact[] = data.map((item: any) => ({
          id: item.id.toString(),
          name: item.name || "",
          category: mapCategoryFromAPI(item.category || "Service"),
          description: item.description || "",
          phone: item.phone || "",
          website: item.website || "",
        }));
        
        setContacts(mappedContacts);
        setFilteredContacts(mappedContacts);
        setIsLoading(false);
      } catch (err) {
        console.error("Error fetching contacts:", err);
        setError("Failed to fetch contacts");
        setIsLoading(false);
        toast.error("Failed to load contacts");
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
    return (categoryMap[apiCategory.toLowerCase()] as Category) || "Service";
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
