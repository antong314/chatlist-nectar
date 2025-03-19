
export type Category = 
  | 'All'
  | 'Car'
  | 'Food Ordering'
  | 'Groceries'
  | 'Jobs'
  | 'Mechanic'
  | 'Mind Body & Spirit'
  | 'Nature'
  | 'Real Estate'
  | 'Restaurant'
  | 'Service'
  | 'Social Network'
  | 'Taxi';

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
