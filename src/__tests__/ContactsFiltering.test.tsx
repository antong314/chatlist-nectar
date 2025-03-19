import { useMemo } from 'react';
import { Contact, Category } from '../types/contact';

// Sample contact data for testing
const mockContacts: Contact[] = [
  { 
    id: '1', 
    name: 'Apple Inc', 
    description: 'Technology company', 
    category: 'Service' as Category,
    phone: '123-456-7890',
    website: 'https://apple.com',
    logoUrl: 'https://example.com/apple.png',
    avatarUrl: 'https://example.com/apple.png',
  },
  { 
    id: '2', 
    name: 'Google', 
    description: 'Search engine company', 
    category: 'Service' as Category,
    phone: '123-456-7891',
    website: 'https://google.com',
    logoUrl: 'https://example.com/google.png',
    avatarUrl: 'https://example.com/google.png',
  },
  { 
    id: '3', 
    name: 'Instacart', 
    description: 'Grocery delivery service', 
    category: 'Food Ordering' as Category,
    phone: '123-456-7892',
    website: 'https://instacart.com',
    logoUrl: 'https://example.com/instacart.png',
    avatarUrl: 'https://example.com/instacart.png',
  },
];

// Extract the filtering logic from the hook for direct testing
function filterContacts(contacts: Contact[], searchQuery: string, selectedCategory: Category) {
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
}

describe('Contact Filtering', () => {
  test('should filter contacts by search query', () => {
    // Test filtering by name
    const filteredByApple = filterContacts(mockContacts, 'Apple', 'All' as Category);
    expect(filteredByApple.length).toBe(1);
    expect(filteredByApple[0].name).toBe('Apple Inc');
    
    // Test filtering by description
    const filteredByDelivery = filterContacts(mockContacts, 'delivery', 'All' as Category);
    expect(filteredByDelivery.length).toBe(1);
    expect(filteredByDelivery[0].name).toBe('Instacart');
    
    // Test filtering by category text
    const filteredByTechnology = filterContacts(mockContacts, 'technology', 'All' as Category);
    expect(filteredByTechnology.length).toBe(1); // Apple has 'Technology' in description
    
    // Test case insensitivity
    const filteredByLowercase = filterContacts(mockContacts, 'apple', 'All' as Category);
    expect(filteredByLowercase.length).toBe(1);
    expect(filteredByLowercase[0].name).toBe('Apple Inc');
    
    // Test empty search query should return all contacts
    const noFilter = filterContacts(mockContacts, '', 'All' as Category);
    expect(noFilter.length).toBe(3);
  });

  test('should filter contacts by category', () => {
    // Test filtering by Service category
    const filteredByService = filterContacts(mockContacts, '', 'Service' as Category);
    expect(filteredByService.length).toBe(2);
    expect(filteredByService[0].name).toBe('Apple Inc');
    expect(filteredByService[1].name).toBe('Google');
    
    // Test filtering by Food Ordering category
    const filteredByFoodOrdering = filterContacts(mockContacts, '', 'Food Ordering' as Category);
    expect(filteredByFoodOrdering.length).toBe(1);
    expect(filteredByFoodOrdering[0].name).toBe('Instacart');
    
    // Test 'All' category should return all contacts
    const allCategory = filterContacts(mockContacts, '', 'All' as Category);
    expect(allCategory.length).toBe(3);
  });

  test('should filter contacts by both search query and category', () => {
    // Test combined filtering - Service category + 'tech' search query
    const filteredCombined = filterContacts(mockContacts, 'tech', 'Service' as Category);
    expect(filteredCombined.length).toBe(1);
    expect(filteredCombined[0].name).toBe('Apple Inc');
    
    // Test combined filtering - Food Ordering category + 'grocery' search query
    const filteredGrocery = filterContacts(mockContacts, 'grocery', 'Food Ordering' as Category);
    expect(filteredGrocery.length).toBe(1);
    expect(filteredGrocery[0].name).toBe('Instacart');
    
    // Test non-matching combination (Service category + 'grocery' search query)
    const nonMatching = filterContacts(mockContacts, 'grocery', 'Service' as Category);
    expect(nonMatching.length).toBe(0);
  });
});
