
import React from 'react';
import { Category } from '@/types/contact';
import { motion } from "framer-motion";
import { cn } from '@/lib/utils';

interface CategoryFilterProps {
  categories: Category[];
  selectedCategory: Category;
  onCategoryChange: (category: Category) => void;
}

export function CategoryFilter({ 
  categories, 
  selectedCategory, 
  onCategoryChange 
}: CategoryFilterProps) {
  // Use a scroll container for mobile
  return (
    <div className="mb-6 overflow-x-auto pb-1 scrollbar-hide">
      <div className="flex space-x-2 min-w-max">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => onCategoryChange(category)}
            className={cn(
              "category-btn relative",
              selectedCategory === category ? "category-btn-active" : "category-btn-inactive"
            )}
          >
            {selectedCategory === category && (
              <motion.span
                layoutId="activePill"
                className="absolute inset-0 bg-directory-primary rounded-full -z-10"
                transition={{ type: "spring", duration: 0.5 }}
              />
            )}
            {category}
          </button>
        ))}
      </div>
    </div>
  );
}
