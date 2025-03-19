
// Reserved special filter category - not an actual data category
export type SpecialCategory = 'All';

// Data-driven category string (any string can be a category)
export type DataCategory = string;

// Combined category type for UI and data handling
export type Category = SpecialCategory | DataCategory;

export interface Contact {
  id: string;
  name: string;
  category: Category;
  description: string;
  phone: string;
  logoUrl?: string; // URL to the logo image in Airtable or Cloudinary
  avatarUrl?: string; // URL for the avatar (fallback or alternative to logo)
  website?: string;
}
