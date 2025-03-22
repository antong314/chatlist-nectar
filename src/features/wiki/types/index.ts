// Types for wiki functionality

export type WikiPage = {
  id: string;
  slug: string;
  title: string;
  content: string;
  excerpt?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  is_published?: boolean;
  category?: string; // Single category field
  
  // Computed property for UI display
  lastEdited?: string;
};

// Categories are now dynamically retrieved from the database via getWikiCategories()
