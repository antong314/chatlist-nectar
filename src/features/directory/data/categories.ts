import { Category } from '@/types/contact';

/**
 * Friendly labels for the compact, legacy category values stored in Supabase.
 * Keeping the stored values stable avoids a disruptive data migration while the
 * directory can present clearer language everywhere people browse or edit it.
 */
export const DIRECTORY_CATEGORY_LABELS: Record<string, string> = {
  All: 'All services',
  Construction: 'Home & repairs',
  Creative: 'Creative',
  Groceries: 'Food & groceries',
  Healer: 'Wellness',
  Mechanic: 'Mechanics',
  Retreats: 'Retreats & stays',
  Service: 'General services',
  Taxi: 'Taxis & drivers',
  'Tow Truck': 'Towing',
};

export const DIRECTORY_CATEGORY_ORDER: Category[] = [
  'All',
  'Construction',
  'Mechanic',
  'Taxi',
  'Tow Truck',
  'Groceries',
  'Healer',
  'Creative',
  'Retreats',
  'Service',
];

export const getDirectoryCategoryLabel = (category: Category): string =>
  DIRECTORY_CATEGORY_LABELS[category] ?? category;

export const sortDirectoryCategories = (categories: Category[]): Category[] =>
  [...categories].sort((left, right) => {
    const leftIndex = DIRECTORY_CATEGORY_ORDER.indexOf(left);
    const rightIndex = DIRECTORY_CATEGORY_ORDER.indexOf(right);

    if (leftIndex === -1 && rightIndex === -1) {
      return getDirectoryCategoryLabel(left).localeCompare(getDirectoryCategoryLabel(right));
    }
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });
