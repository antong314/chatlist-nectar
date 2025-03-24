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
  version: number; // Version number, starting from 0 for new pages
  
  // Computed property for UI display
  lastEdited?: string;
};

// Versioning behavior explanation:
// 1. New pages start with version 0
// 2. Updates create a new entry with same ID but incremented version
// 3. Only the latest version has is_published=true
// 4. Previous versions have is_published=false

// Categories are now dynamically retrieved from the database via getWikiCategories()
