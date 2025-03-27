// Wiki Page related types
export interface WikiPage {
  id: string;
  slug: string;
  title: string;
  content: string;
  excerpt?: string;
  category?: string;
  created_at: string;
  updated_at: string;
  lastEdited?: string;
  is_published?: boolean;
  version?: number;
  created_by?: string;
}

// Wiki Page Version
export interface WikiPageVersion extends WikiPage {
  is_current: boolean;
}

// Search related types
export interface WikiSearchResult {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  category?: string;
  updated_at: string;
  relevance: number;
  matched_content?: string;
}

export interface WikiSearchParams {
  query: string;
  category?: string;
  limit?: number;
}
