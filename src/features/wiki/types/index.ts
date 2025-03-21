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
  
  // Computed property for UI display
  lastEdited?: string;
};
