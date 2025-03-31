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
  logoUrl?: string; // Kept for potential fallback/legacy
  image_url?: string; // Add the new Supabase image URL field
  created_at?: string; // Standard Supabase field
  updated_at?: string; // Standard Supabase field
  is_deleted?: boolean; // Flag for soft delete
}
