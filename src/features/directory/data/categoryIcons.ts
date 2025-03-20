import { Category } from '@/features/directory/types/contact';
import {
  ListChecks,
  HardHat,
  Palette,
  Utensils,
  Heart,
  Gauge,
  BedDouble,
  HandPlatter,
  CarTaxiFront,
  Truck,
  LucideIcon
} from 'lucide-react';

// Map of categories to their respective Lucide icons
export const categoryIconMap: Record<Category, LucideIcon> = {
  'All': ListChecks,
  'Construction': HardHat,
  'Creative': Palette,
  'Groceries': Utensils,
  'Healer': Heart,
  'Mechanic': Gauge,
  'Retreats': BedDouble,
  'Service': HandPlatter,
  'Taxi': CarTaxiFront,
  'Tow Truck': Truck
};
