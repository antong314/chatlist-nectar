
import React from 'react';
import { Category } from '@/features/directory/types/contact';
import { motion } from "framer-motion";
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { categoryIconMap } from '@/features/directory/data/categoryIcons';

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
  return (
    <div className="mb-6">
      <div className="flex flex-wrap gap-2">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => onCategoryChange(category)}
            className={cn(
              "category-btn relative px-3 py-2 rounded-full text-sm font-medium transition-colors",
              selectedCategory === category ? "category-btn-active" : "category-btn-inactive hover:bg-gray-100"
            )}
          >
            {selectedCategory === category && (
              <motion.span
                layoutId="activePill"
                className="absolute inset-0 bg-blue-100 rounded-full -z-10"
                transition={{ type: "spring", duration: 0.5 }}
              />
            )}
            <span className="flex items-center gap-1.5">
              {React.createElement(categoryIconMap[category], { 
                size: 18, 
                className: `inline-block ${selectedCategory === category ? 'text-blue-700' : 'text-gray-500'}`
              })}
              <span className={selectedCategory === category ? 'text-blue-700 font-medium' : 'text-gray-700'}>{category}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
