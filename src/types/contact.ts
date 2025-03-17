
export type Category = 
  | 'All'
  | 'Car'
  | 'Food Ordering'
  | 'Groceries'
  | 'Jobs'
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
  avatarUrl?: string;
  website?: string;
}
