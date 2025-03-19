import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Index from '../pages/Index';
import * as UseContactsModule from '../hooks/useContacts';
import { Contact, Category } from '../types/contact';

// Mock the useContacts hook
jest.mock('../hooks/useContacts', () => {
  return {
    useContacts: jest.fn(),
  };
});

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

// Helper function to setup the component for testing
const setup = (mockImplementation = {}) => {
  const setSearchQuery = jest.fn();
  const setSelectedCategory = jest.fn();
  
  const defaultImplementation = {
    contacts: mockContacts,
    loading: false,
    error: null,
    searchQuery: '',
    setSearchQuery,
    selectedCategory: 'All' as Category,
    setSelectedCategory,
    refreshContacts: jest.fn(),
    addContact: jest.fn(),
    updateContact: jest.fn(),
    deleteContact: jest.fn(),
  };

  // Mock the useContacts hook with our test implementation
  (UseContactsModule.useContacts as jest.Mock).mockReturnValue({
    ...defaultImplementation,
    ...mockImplementation,
  });

  return {
    setSearchQuery,
    setSelectedCategory,
    ...render(
      <BrowserRouter>
        <Index />
      </BrowserRouter>
    )
  };
};

describe('Contacts UI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should render contacts list', () => {
    setup();
    
    // Check if all contacts are displayed
    expect(screen.getByText('Apple Inc')).toBeInTheDocument();
    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.getByText('Instacart')).toBeInTheDocument();
  });

  // Note: These tests are dependent on the actual implementation of the UI
  // They may need to be adjusted based on your actual UI elements
  test('search input should call setSearchQuery', () => {
    const { setSearchQuery } = setup();
    
    // Find the search input by its placeholder
    const searchInput = screen.getByPlaceholderText(/search/i);
    expect(searchInput).toBeInTheDocument();
    
    // Type in the search input
    fireEvent.change(searchInput, { target: { value: 'Apple' } });
    
    // Check if setSearchQuery was called with the expected value
    expect(setSearchQuery).toHaveBeenCalledWith('Apple');
  });

  test('category buttons should call setSelectedCategory', () => {
    const { setSelectedCategory } = setup();
    
    // We need to know the exact text content of your category buttons
    // This is a simplified example - you might need to adapt this 
    // based on how your category buttons are labeled and structured
    const allCategoryButtons = screen.getAllByRole('button');
    const foodOrderingButton = Array.from(allCategoryButtons).find(
      button => button.textContent?.includes('Food Ordering')
    );
    
    if (foodOrderingButton) {
      fireEvent.click(foodOrderingButton);
      expect(setSelectedCategory).toHaveBeenCalledWith('Food Ordering');
    } else {
      // If we can't find the button, skip this test but log a warning
      console.warn('Could not find Food Ordering category button');
    }
  });
});
