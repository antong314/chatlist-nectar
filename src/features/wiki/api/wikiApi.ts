import { WikiPage, WikiPageVersion } from "../types";
import { supabase } from "@/lib/supabase";
import { mockPages } from "../data/mockWikiData";

// Fallback to mock data if Supabase is not configured
const useSupabase = !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log('Supabase configuration check:');
console.log('  VITE_SUPABASE_URL exists:', !!import.meta.env.VITE_SUPABASE_URL);
console.log('  VITE_SUPABASE_ANON_KEY exists:', !!import.meta.env.VITE_SUPABASE_ANON_KEY);
console.log('  useSupabase (using real DB):', useSupabase);

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
      updated_at: new Date().toISOString(),
      lastEdited: formatLastEdited(new Date().toISOString()),
      category: page.category || 'Uncategorized'
    }));
  }

  try {
    // Get only published pages and include all necessary fields
    const { data, error } = await supabase
      .from('wiki_pages')
      .select('id, slug, title, content, excerpt, created_at, updated_at, created_by, is_published, category, version')
      .eq('is_published', true) // Only get published versions
      .order('updated_at', { ascending: false });
      
    console.log('Database query result:', data);

    if (error) {
      console.error('Error fetching wiki pages:', error);
      throw new Error('Failed to fetch wiki pages');
    }
    
    console.log('Raw wiki pages data from DB:', data);
    
    // Log each page's category specifically for debugging
    data.forEach(page => {
      // Process raw category value
    });
    
    // Simply use the category directly from the database with minimal normalization
    const processedPages = data.map((page: any) => {
      // Just use the category value directly, defaulting to 'Uncategorized' if not present
      const categoryValue = page.category || 'Uncategorized';
      // Use processed category value      
      
      return {
        ...page,
        lastEdited: page.updated_at ? formatLastEdited(page.updated_at) : '',
        category: categoryValue // Use the category directly from DB
      };
    });
    
    console.log('Processed wiki pages with categories:', processedPages);
    return processedPages;
  } catch (err) {
    console.error('Error in getWikiPages:', err);
    // Fall back to mock data on error
    return Object.values(mockPages).map(page => ({
      ...page,
      slug: page.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      lastEdited: formatLastEdited(new Date().toISOString()),
      category: page.category || 'Uncategorized'
    }));
  }

  // Code should never reach this point due to the returns inside the if and try/catch blocks above
  // This is unreachable code that should be removed, but keeping the function structure intact
  return [];
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
      updated_at: new Date().toISOString(),
      category: page.category || 'Uncategorized'
    };
  }

  try {
    // Get only the published version of the page
    const { data, error } = await supabase
      .from('wiki_pages')
      .select('*')
      .eq('slug', slug)
      .eq('is_published', true) // Only get the published version
      .single();

    if (error) {
      console.error(`Error fetching wiki page ${slug}:`, error);
      throw new Error(`Page with slug ${slug} not found`);
    }

    // Add computed properties
    return {
      ...data,
      category: data.category || 'Uncategorized',
      lastEdited: formatLastEdited(data.updated_at)
    };
  } catch (err) {
    console.error(`Error in getWikiPage for ${slug}:`, err);
    
    // Fallback to mock data if available
    const page = mockPages[slug];
    if (!page) {
      throw new Error(`Page with slug ${slug} not found`);
    }
    
    return {
      ...page,
      slug: page.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      category: page.category || 'Uncategorized',
      lastEdited: formatLastEdited(new Date().toISOString())
    };
  }
};

// Create a new wiki page
export const createWikiPage = async (
  page: Omit<WikiPage, 'id' | 'slug' | 'created_at' | 'updated_at' | 'lastEdited'>
): Promise<WikiPage> => {
  const slug = createSlug(page.title);
  const category = page.category || 'Uncategorized';
  
  console.log(`Checking if page with slug '${slug}' exists...`);
  
  // First check if a page with this slug already exists
  if (useSupabase) {
    try {
      // Use count instead to be more explicit and reliable
      const { count, error } = await supabase
        .from('wiki_pages')
        .select('*', { count: 'exact', head: true })
        .eq('slug', slug);

      console.log(`Found ${count} existing pages with slug '${slug}'`);

      if (count && count > 0) {
        // Page with this slug already exists
        console.error(`Duplicate page detected: '${page.title}' (slug: ${slug})`);
        throw new Error(`A page with the title "${page.title}" already exists. Please choose a different title.`);
      }
    } catch (err) {
      // If this is our custom error, rethrow it
      if (err instanceof Error && err.message.includes('already exists')) {
        throw err;
      }
      // Otherwise log it and continue (might be a different error)
      console.error('Error checking for existing page:', err);
    }
  }
  
  if (!useSupabase) {
    // Also check mock data for existing page
    if (mockPages[slug]) {
      throw new Error(`A page with the title "${page.title}" already exists. Please choose a different title.`);
    }
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
      category: category,
      version: 0, // Set initial version to 0
      lastEdited: formatLastEdited(new Date().toISOString())
    };
    return newPage;
  }

  try {
    const { data, error } = await supabase
      .from('wiki_pages')
      .insert({
        slug,
        title: page.title,
        content: page.content,
        excerpt: page.excerpt,
        is_published: page.is_published ?? true,
        category: category,
        version: 0 // Start with version 0 for new pages
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
      category: data.category || category,
      lastEdited: formatLastEdited(data.updated_at),
      version: data.version ?? 0 // Ensure version is included in returned data
    };
  } catch (err) {
    console.error('Unexpected error in createWikiPage:', err);
    
    // Create a mock implementation as fallback
    const newPage: WikiPage = {
      id: slug,
      slug,
      title: page.title,
      content: page.content,
      excerpt: page.excerpt,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_published: page.is_published ?? true,
      category: category,
      version: 0, // Initial version
      lastEdited: formatLastEdited(new Date().toISOString())
    };
    return newPage;
  }
};

// Update an existing wiki page
export const updateWikiPage = async (
  slug: string, 
  updates: Partial<Omit<WikiPage, 'id' | 'slug' | 'created_at' | 'updated_at' | 'lastEdited'>>
): Promise<WikiPage> => {
  console.log('updateWikiPage called with slug:', slug);
  console.log('updateWikiPage updates:', updates);
  console.log('useSupabase value:', useSupabase);
  
  // Handle category updates
  const category = updates.category || 'Uncategorized';
  
  if (!useSupabase) {
    console.log('Using mock implementation for updateWikiPage');
    // Mock implementation
    const page = mockPages[slug];
    if (!page) {
      console.error(`Mock page with slug ${slug} not found`);
      throw new Error(`Page with slug ${slug} not found`);
    }
    
    console.log('Original mock page:', page);
    
    // Create a new version with incremented version number
    const currentVersion = page.version || 0;
    const newVersion = currentVersion + 1;
    
    // First set the old version to is_published=false
    const oldPage = {
      ...mockPages[slug],
      is_published: false
    };
    
    // Create a new version with is_published=true
    const updatedPage: WikiPage = {
      ...page,
      ...updates,
      slug,
      created_at: page.created_at, // Preserve original creation date
      updated_at: new Date().toISOString(),
      category: category || page.category,
      version: newVersion, // Increment version
      is_published: true,  // Make new version published
      lastEdited: formatLastEdited(new Date().toISOString())
    };
    
    console.log('Updated mock page (new version):', updatedPage);
    
    // In a real implementation, we'd keep both versions in the database
    // For mock data, we'll just store the latest version
    mockPages[slug] = {
      ...mockPages[slug],
      ...updates,
      id: slug,
      content: updates.content || mockPages[slug].content,
      category: category || mockPages[slug].category,
      version: newVersion,
      is_published: true,
      updated_at: new Date().toISOString()
    };
    
    console.log('Updated mockPages global object:', mockPages[slug]);
    
    return updatedPage;
  }

  console.log('Using Supabase for updateWikiPage');
  
  try {
    // First, get the current page to retrieve its current version
    const { data: currentPage, error: fetchError } = await supabase
      .from('wiki_pages')
      .select('*')
      .eq('slug', slug)
      .eq('is_published', true) // Get the current published version
      .single();

    if (fetchError) {
      console.error(`Error fetching current wiki page ${slug}:`, fetchError);
      throw new Error(`Failed to retrieve page with slug ${slug}`);
    }

    console.log('Current page before update:', currentPage);
    const currentVersion = currentPage.version || 0;
    const newVersion = currentVersion + 1;
    
    // Step 1: Set current version's is_published to false
    const { error: unpublishError } = await supabase
      .from('wiki_pages')
      .update({ is_published: false })
      .eq('id', currentPage.id)
      .eq('version', currentVersion);

    if (unpublishError) {
      console.error(`Error unpublishing current version of ${slug}:`, unpublishError);
      throw new Error(`Failed to unpublish current version of ${slug}`);
    }

    // Step 2: Create a new entry with incremented version number
    const { data: newPage, error: insertError } = await supabase
      .from('wiki_pages')
      .insert({
        id: currentPage.id, // Same ID as before
        slug: slug,
        title: updates.title || currentPage.title,
        content: updates.content || currentPage.content,
        excerpt: updates.excerpt || currentPage.excerpt,
        created_at: currentPage.created_at, // Preserve original creation date
        updated_at: new Date().toISOString(),
        created_by: currentPage.created_by,
        category: category,
        version: newVersion, // Incremented version
        is_published: true // Make this version published
      })
      .select()
      .single();

    if (insertError) {
      console.error(`Error creating new version of ${slug}:`, insertError);
      
      // Try to roll back and re-publish the old version
      await supabase
        .from('wiki_pages')
        .update({ is_published: true })
        .eq('id', currentPage.id)
        .eq('version', currentVersion);
        
      throw new Error(`Failed to create new version of ${slug}`);
    }

    console.log('New version created successfully:', newPage);
    
    // Add computed properties to new page version
    return {
      ...newPage,
      category: newPage.category || category,
      lastEdited: formatLastEdited(newPage.updated_at),
      version: newVersion
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

/**
 * Get all versions of a wiki page
 * @param slug The page slug to get versions for
 * @returns Array of page versions sorted by version number (descending)
 */
export const getWikiPageVersions = async (slug: string): Promise<WikiPageVersion[]> => {
  if (!useSupabase) {
    // Mock implementation - in mock data we only keep the latest version
    // so we'll create a fake version history
    const page = mockPages[slug];
    if (!page) {
      throw new Error(`Page with slug ${slug} not found`);
    }
    
    // Create a simple version history with the current version and a fake previous version
    const currentVersion = page.version || 0;
    
    // Only create history if we have at least version 1
    if (currentVersion === 0) {
      return [
        {
          ...page,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_current: true,
          lastEdited: formatLastEdited(new Date().toISOString())
        }
      ];
    }
    
    // Create a fake previous version
    const previousVersion: WikiPageVersion = {
      ...page,
      version: currentVersion - 1,
      updated_at: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
      is_current: false,
      lastEdited: formatLastEdited(new Date(Date.now() - 86400000).toISOString())
    };
    
    const currentVersionData: WikiPageVersion = {
      ...page,
      is_current: true,
      lastEdited: formatLastEdited(page.updated_at || new Date().toISOString())
    };
    
    return [currentVersionData, previousVersion];
  }
  
  try {
    // Get all versions of the page, regardless of published status
    const { data, error } = await supabase
      .from('wiki_pages')
      .select('*')
      .eq('slug', slug)
      .order('version', { ascending: false });
      
    if (error) {
      console.error(`Error fetching versions for page ${slug}:`, error);
      throw new Error(`Failed to fetch versions for page ${slug}`);
    }
    
    if (!data || data.length === 0) {
      throw new Error(`No versions found for page ${slug}`);
    }
    
    // Process versions with additional UI metadata
    return data.map((version: any) => ({
      ...version,
      is_current: version.is_published === true,
      lastEdited: formatLastEdited(version.updated_at)
    }));
  } catch (err) {
    console.error(`Error in getWikiPageVersions for ${slug}:`, err);
    throw err;
  }
};

/**
 * Restore a specific version of a wiki page
 * @param slug The page slug to restore a version for
 * @param versionToRestore The version number to restore
 * @returns The newly created version (based on the restored content)
 */
export const restoreWikiPageVersion = async (slug: string, versionToRestore: number): Promise<WikiPage> => {
  if (!useSupabase) {
    // Mock implementation
    const page = mockPages[slug];
    if (!page) {
      throw new Error(`Page with slug ${slug} not found`);
    }
    
    // For mock data, we'll just pretend we restored a version by creating a new one
    const currentVersion = page.version || 0;
    const newVersion = currentVersion + 1;
    
    const updatedPage: WikiPage = {
      ...page,
      version: newVersion,
      updated_at: new Date().toISOString(),
      lastEdited: formatLastEdited(new Date().toISOString())
    };
    
    // Update mock data
    mockPages[slug] = updatedPage;
    
    return updatedPage;
  }
  
  try {
    // Step 1: Get the version to restore
    const { data: versionData, error: versionError } = await supabase
      .from('wiki_pages')
      .select('*')
      .eq('slug', slug)
      .eq('version', versionToRestore)
      .single();
      
    if (versionError || !versionData) {
      console.error(`Error fetching version ${versionToRestore} of page ${slug}:`, versionError);
      throw new Error(`Failed to fetch version ${versionToRestore} of page ${slug}`);
    }
    
    // Step 2: Get current published version to increment from
    const { data: currentVersion, error: currentError } = await supabase
      .from('wiki_pages')
      .select('*')
      .eq('slug', slug)
      .eq('is_published', true)
      .single();
      
    if (currentError || !currentVersion) {
      console.error(`Error fetching current version of page ${slug}:`, currentError);
      throw new Error(`Failed to fetch current version of page ${slug}`);
    }
    
    // Step 3: Set current version to unpublished
    const { error: unpublishError } = await supabase
      .from('wiki_pages')
      .update({ is_published: false })
      .eq('id', currentVersion.id)
      .eq('version', currentVersion.version);
      
    if (unpublishError) {
      console.error(`Error unpublishing current version of ${slug}:`, unpublishError);
      throw new Error(`Failed to unpublish current version of ${slug}`);
    }
    
    // Step 4: Create a new version based on the one to restore
    const newVersion = currentVersion.version + 1;
    const { data: newVersionData, error: insertError } = await supabase
      .from('wiki_pages')
      .insert({
        id: currentVersion.id,
        slug: slug,
        title: versionData.title,
        content: versionData.content,
        excerpt: versionData.excerpt,
        created_at: currentVersion.created_at, // Preserve original creation date
        updated_at: new Date().toISOString(),
        created_by: currentVersion.created_by,
        category: versionData.category || 'Uncategorized',
        version: newVersion,
        is_published: true
      })
      .select()
      .single();
      
    if (insertError || !newVersionData) {
      console.error(`Error creating restored version of ${slug}:`, insertError);
      
      // Try to rollback by re-publishing the current version
      await supabase
        .from('wiki_pages')
        .update({ is_published: true })
        .eq('id', currentVersion.id)
        .eq('version', currentVersion.version);
        
      throw new Error(`Failed to restore version ${versionToRestore} of page ${slug}`);
    }
    
    // Return the new version
    return {
      ...newVersionData,
      lastEdited: formatLastEdited(newVersionData.updated_at),
      category: newVersionData.category || 'Uncategorized'
    };
  } catch (err) {
    console.error(`Error in restoreWikiPageVersion for ${slug}:`, err);
    throw err;
  }
};

/**
 * Retrieves all unique categories from wiki pages in the database
 * @returns Array of unique category strings
 */
export const getWikiCategories = async (): Promise<string[]> => {
  if (!useSupabase) {
    // Return default categories for mock data
    return ['Getting Started', 'Documentation', 'Processes', 'Uncategorized'];
  }
  
  try {
    // Query the database for all wiki pages
    const { data, error } = await supabase
      .from('wiki_pages')
      .select('category');
      
    if (error) {
      console.error('Error fetching wiki categories:', error);
      return ['Uncategorized'];
    }
    
    // Extract and deduplicate categories
    const categories = Array.from(new Set(
      data
        .map(item => item.category || 'Uncategorized')
        .filter(Boolean) // Remove any empty strings or null values
    ));
    
    // Always ensure Uncategorized is included
    if (!categories.includes('Uncategorized')) {
      categories.push('Uncategorized');
    }
    
    // Dynamic categories retrieved from database
    return categories;
  } catch (err) {
    console.error('Error in getWikiCategories:', err);
    return ['Uncategorized'];
  }
};
