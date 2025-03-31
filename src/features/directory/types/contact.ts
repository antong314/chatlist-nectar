// Reserved special filter category - not an actual data category
export type SpecialCategory = 'All';

// Data-driven category string (any string can be a category)
export type DataCategory = string;

// Combined category type for UI and data handling
export type Category = SpecialCategory | DataCategory;

export interface Contact {
  id: string; 
  name: string;
  description?: string;
  category: Category;
  phone?: string;
  website?: string;
  mapUrl?: string; 
  avatarUrl?: string; 
  logoUrl?: string; 
  image_url?: string; 
  created_at?: string; 
  updated_at?: string; 
}
