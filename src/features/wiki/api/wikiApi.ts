import { WikiPage } from "../types";
import { supabase } from "@/lib/supabase";
import { mockPages } from "../data/mockWikiData";

// Fallback to mock data if Supabase is not configured
const useSupabase = !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

// Format the lastEdited display string from a date string
const formatLastEdited = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('en-US', { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  });
};

// Helper to create a slug from a title
const createSlug = (title: string): string => {
  return title.toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
};

// Get all wiki pages
export const getWikiPages = async (): Promise<WikiPage[]> => {
  if (!useSupabase) {
    // Fall back to mock data if Supabase is not configured
    return Object.values(mockPages).map(page => ({
      ...page,
      slug: page.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));
  }

  const { data, error } = await supabase
    .from('wiki_pages')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error fetching wiki pages:', error);
    throw new Error('Failed to fetch wiki pages');
  }

  // Transform data to match our WikiPage type with computed properties
  return data.map((page: any) => ({
    ...page,
    lastEdited: formatLastEdited(page.updated_at)
  }));
};

// Get a single wiki page by slug
export const getWikiPage = async (slug: string): Promise<WikiPage> => {
  if (!useSupabase) {
    // Fall back to mock data if Supabase is not configured
    const page = mockPages[slug];
    if (!page) {
      throw new Error(`Page with slug ${slug} not found`);
    }
    return {
      ...page,
      slug: page.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  const { data, error } = await supabase
    .from('wiki_pages')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error) {
    console.error(`Error fetching wiki page ${slug}:`, error);
    throw new Error(`Page with slug ${slug} not found`);
  }

  // Add computed properties
  return {
    ...data,
    lastEdited: formatLastEdited(data.updated_at)
  };
};

// Create a new wiki page
export const createWikiPage = async (
  page: Omit<WikiPage, 'id' | 'slug' | 'created_at' | 'updated_at' | 'lastEdited'>
): Promise<WikiPage> => {
  const slug = createSlug(page.title);
  
  if (!useSupabase) {
    // Mock implementation
    const newPage: WikiPage = {
      id: slug,
      slug,
      title: page.title,
      content: page.content,
      excerpt: page.excerpt,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_published: page.is_published ?? true,
      lastEdited: formatLastEdited(new Date().toISOString())
    };
    return newPage;
  }

  const { data, error } = await supabase
    .from('wiki_pages')
    .insert({
      slug,
      title: page.title,
      content: page.content,
      excerpt: page.excerpt,
      is_published: page.is_published ?? true
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating wiki page:', error);
    throw new Error('Failed to create wiki page');
  }

  // Add computed properties
  return {
    ...data,
    lastEdited: formatLastEdited(data.updated_at)
  };
};

// Update an existing wiki page
export const updateWikiPage = async (
  slug: string, 
  updates: Partial<Omit<WikiPage, 'id' | 'slug' | 'created_at' | 'updated_at' | 'lastEdited'>>
): Promise<WikiPage> => {
  console.log('updateWikiPage called with slug:', slug);
  console.log('updateWikiPage updates:', updates);
  console.log('useSupabase value:', useSupabase);
  
  if (!useSupabase) {
    console.log('Using mock implementation for updateWikiPage');
    // Mock implementation
    const page = mockPages[slug];
    if (!page) {
      console.error(`Mock page with slug ${slug} not found`);
      throw new Error(`Page with slug ${slug} not found`);
    }
    
    console.log('Original mock page:', page);
    
    const updatedPage: WikiPage = {
      ...page,
      ...updates,
      slug,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      lastEdited: formatLastEdited(new Date().toISOString())
    };
    
    console.log('Updated mock page:', updatedPage);
    // Update the mock data so it persists during the session
    mockPages[slug] = {
      ...mockPages[slug],
      ...updates,
      id: slug,
      content: updates.content || mockPages[slug].content,
      updated_at: new Date().toISOString()
    };
    
    console.log('Updated mockPages global object:', mockPages[slug]);
    
    return updatedPage;
  }

  console.log('Using Supabase for updateWikiPage');
  console.log('Supabase update payload:', {
    ...updates,
    updated_at: new Date().toISOString()
  });
  
  try {
    const { data, error } = await supabase
      .from('wiki_pages')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('slug', slug)
      .select()
      .single();

    if (error) {
      console.error(`Error updating wiki page ${slug}:`, error);
      throw new Error(`Failed to update page with slug ${slug}`);
    }

    console.log('Supabase update response:', data);
    
    // Add computed properties
    return {
      ...data,
      lastEdited: formatLastEdited(data.updated_at)
    };
  } catch (err) {
    console.error('Unexpected error in updateWikiPage:', err);
    throw err;
  }
};

// Delete a wiki page
export const deleteWikiPage = async (slug: string): Promise<void> => {
  if (!useSupabase) {
    // Mock implementation - just validate that the page exists
    const page = mockPages[slug];
    if (!page) {
      throw new Error(`Page with slug ${slug} not found`);
    }
    return;
  }

  const { error } = await supabase
    .from('wiki_pages')
    .delete()
    .eq('slug', slug);

  if (error) {
    console.error(`Error deleting wiki page ${slug}:`, error);
    throw new Error(`Failed to delete page with slug ${slug}`);
  }
};
