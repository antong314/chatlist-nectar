import { ShoppingBag, TreePalm, ShieldQuestion, Folder } from "lucide-react";
import { LucideIcon } from "lucide-react";

// Map category names to their corresponding Lucide icons
export const categoryIconMap: Record<string, LucideIcon> = {
  "Shopping": ShoppingBag,
  "Nature": TreePalm,
  "Local Know-How": ShieldQuestion,
  // Default icon for any other category
  "default": Folder
};

// Helper function to get the icon for a category
export const getCategoryIcon = (category: string): LucideIcon => {
  return categoryIconMap[category] || categoryIconMap.default;
};
