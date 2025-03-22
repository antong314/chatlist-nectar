import { WikiCategory } from "../types";
import { supabase } from "@/lib/supabase";

// Mock categories for fallback
const mockCategories: WikiCategory[] = [
  {
    id: 'cat-1',
    name: 'Getting Started',
    slug: 'getting-started',
    description: 'Essential guides and tutorials for new users',
    order: 1
  },
  {
    id: 'cat-2',
    name: 'Documentation',
    slug: 'documentation',
    description: 'Detailed documentation for features and components',
    order: 2
  },
  {
    id: 'cat-3',
    name: 'Processes',
    slug: 'processes',
    description: 'Standard procedures and workflows',
    order: 3
  },
  {
    id: 'cat-4',
    name: 'Uncategorized',
    slug: 'uncategorized',
    description: 'Pages without a specific category',
    order: 999 // Always last
  }
];

// Fallback to mock data if Supabase is not configured
const useSupabase = !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

// Helper to create a slug from a category name
const createCategorySlug = (name: string): string => {
  return name.toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
};

// Get all wiki categories
export const getWikiCategories = async (): Promise<WikiCategory[]> => {
  if (!useSupabase) {
    // Fall back to mock data if Supabase is not configured
    return mockCategories;
  }

  try {
    const { data, error } = await supabase
      .from('wiki_categories')
      .select('*')
      .order('order', { ascending: true });

    if (error) {
      console.error('Error fetching wiki categories:', error);
      throw new Error('Failed to fetch wiki categories');
    }

    return data || [];
  } catch (err) {
    console.error('Error in getWikiCategories:', err);
    return mockCategories; // Fallback to mock data on error
  }
};

// Get a specific category by ID
export const getWikiCategory = async (categoryId: string): Promise<WikiCategory | null> => {
  if (!useSupabase) {
    // Fall back to mock data if Supabase is not configured
    const category = mockCategories.find(c => c.id === categoryId);
    return category || null;
  }

  const { data, error } = await supabase
    .from('wiki_categories')
    .select('*')
    .eq('id', categoryId)
    .single();

  if (error) {
    console.error('Error fetching wiki category:', error);
    return null;
  }

  return data;
};

// Create a new category
export const createWikiCategory = async (category: Partial<WikiCategory>): Promise<WikiCategory> => {
  // Generate a slug if not provided
  const slug = category.slug || (category.name ? createCategorySlug(category.name) : '');
  
  if (!useSupabase) {
    // Create a mock category if Supabase is not configured
    const newCategory: WikiCategory = {
      id: `cat-${Date.now()}`,
      name: category.name || 'New Category',
      slug,
      description: category.description || '',
      order: category.order || Math.max(...mockCategories.map(c => c.order || 0)) + 1
    };
    
    mockCategories.push(newCategory);
    return newCategory;
  }

  const { data, error } = await supabase
    .from('wiki_categories')
    .insert([{ ...category, slug }])
    .select()
    .single();

  if (error) {
    console.error('Error creating wiki category:', error);
    throw new Error('Failed to create wiki category');
  }

  return data;
};

// Update an existing category
export const updateWikiCategory = async (categoryId: string, updates: Partial<WikiCategory>): Promise<WikiCategory> => {
  if (!useSupabase) {
    // Update a mock category if Supabase is not configured
    const index = mockCategories.findIndex(c => c.id === categoryId);
    if (index === -1) {
      throw new Error('Category not found');
    }
    
    const updatedCategory = {
      ...mockCategories[index],
      ...updates,
      // Update slug if name was changed
      slug: updates.name ? createCategorySlug(updates.name) : mockCategories[index].slug
    };
    
    mockCategories[index] = updatedCategory;
    return updatedCategory;
  }

  const { data, error } = await supabase
    .from('wiki_categories')
    .update(updates)
    .eq('id', categoryId)
    .select()
    .single();

  if (error) {
    console.error('Error updating wiki category:', error);
    throw new Error('Failed to update wiki category');
  }

  return data;
};

// Delete a category
export const deleteWikiCategory = async (categoryId: string): Promise<void> => {
  if (!useSupabase) {
    // Delete a mock category if Supabase is not configured
    const index = mockCategories.findIndex(c => c.id === categoryId);
    if (index !== -1) {
      mockCategories.splice(index, 1);
    }
    return;
  }

  const { error } = await supabase
    .from('wiki_categories')
    .delete()
    .eq('id', categoryId);

  if (error) {
    console.error('Error deleting wiki category:', error);
    throw new Error('Failed to delete wiki category');
  }
};
