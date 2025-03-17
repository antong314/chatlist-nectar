
import { useState, useEffect, useCallback } from "react";
import { Contact, Category } from "../types/contact";
import { toast } from "sonner";

// Temporary mock data
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
    name: "Another Test",
    category: "Restaurant",
    description: "delete me as well",
    phone: "123289892233",
    website: ""
  },
  {
    id: "5",
    name: "Anton",
    category: "Mind Body & Spirit",
    description: "Creator of this site. For all your technical needs from websites to operational automation to business development",
    phone: "16467338252",
    website: "https://anton.dev"
  },
  {
    id: "6",
    name: "Ariel Mayrose",
    category: "Mind Body & Spirit",
    description: "Body-mind therapist. Offers private and group Qigong and Taoist meditation practices, in person and in zoom. Offers Non-Violent-Communication practice groups, individual and couple counseling.",
    phone: "50661908505",
    website: "https://arielmayrose.com"
  },
  {
    id: "7",
    name: "Bio Natura Pest Control",
    category: "Service",
    description: "exterminator, natural pest control",
    phone: "50689101466",
    website: ""
  },
  {
    id: "8",
    name: "Bosque Ayurveda by Elvi",
    category: "Mind Body & Spirit",
    description: "Ayurveda practitioner offering private consultation, Dosha evaluation and full Ayurvedic lifestyle plan",
    phone: "7187496303",
    website: "https://bosqueayurveda.com"
  }
];

export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<Category>("All");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch contacts
  useEffect(() => {
    const fetchContacts = async () => {
      try {
        // In a real app, this would be an API call
        // const response = await fetch('/api/contacts');
        // const data = await response.json();
        
        // Using mock data for now
        setContacts(mockContacts);
        setFilteredContacts(mockContacts);
        setIsLoading(false);
      } catch (err) {
        setError("Failed to fetch contacts");
        setIsLoading(false);
        toast.error("Failed to load contacts");
      }
    };

    fetchContacts();
  }, []);

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
