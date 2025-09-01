import { ShoppingBag, TreePalm, ShieldQuestion, Folder, Waves, Sprout, Store } from "lucide-react";
import { LucideIcon } from "lucide-react";

// Map category names to their corresponding Lucide icons with eco-centric theme
export const categoryIconMap: Record<string, LucideIcon> = {
  "Shopping": Store,           // 🛍️ Shopping - using Store icon
  "Nature": Waves,             // 🌊 Nature - using Waves icon
  "Local Know-How": Sprout,    // 🌱 Local Know-How - using Sprout icon
  "Getting Started": TreePalm,  // Keep existing categories
  "Documentation": Folder,
  "Processes": ShieldQuestion,
  "Uncategorized": Folder,
  // Default icon for any other category
  "default": Folder
};

// Emoji alternatives for categories (for use in headers/titles)
export const categoryEmojiMap: Record<string, string> = {
  "Shopping": "🛍️",
  "Nature": "🌊",
  "Local Know-How": "🌱",
  "Getting Started": "🌿",
  "Documentation": "📚",
  "Processes": "⚙️",
  "Uncategorized": "📁",
  "default": "📁"
};

// Helper function to get the icon for a category
export const getCategoryIcon = (category: string): LucideIcon => {
  return categoryIconMap[category] || categoryIconMap.default;
};

// Helper function to get the emoji for a category
export const getCategoryEmoji = (category: string): string => {
  return categoryEmojiMap[category] || categoryEmojiMap.default;
};
