import React from 'react';
import { Shapes } from 'lucide-react';
import { motion } from 'framer-motion';
import { Category } from '@/types/contact';
import { cn } from '@/lib/utils';
import { categoryIconMap } from '@/features/directory/data/categoryIcons';
import {
  getDirectoryCategoryLabel,
  sortDirectoryCategories,
} from '@/features/directory/data/categories';

interface CategoryFilterProps {
  categories: Category[];
  selectedCategory: Category;
  onCategoryChange: (category: Category) => void;
}
export function CategoryFilter({
  categories,
  selectedCategory,
  onCategoryChange,
}: CategoryFilterProps) {
  const sortedCategories = sortDirectoryCategories(categories);

  return (
    <nav className="category-scroll -mx-4 mb-6 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0" aria-label="Filter by service category">
      <div className="flex w-max min-w-full gap-2">
        {sortedCategories.map((category) => {
          const Icon = categoryIconMap[category] ?? Shapes;
          const isSelected = selectedCategory === category;

          return (
            <button
              key={category}
              type="button"
              onClick={() => onCategoryChange(category)}
              className={cn('category-btn relative isolate', isSelected ? 'category-btn-active' : 'category-btn-inactive')}
              aria-pressed={isSelected}
            >
              {isSelected && (
                <motion.span
                  layoutId="activeDirectoryCategory"
                  className="absolute inset-0 -z-10 rounded-full bg-[var(--directory-green)]"
                  transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }}
                />
              )}
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{getDirectoryCategoryLabel(category)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
