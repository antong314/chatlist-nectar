import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, Shapes } from 'lucide-react';
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
  const scrollContainerRef = useRef<HTMLElement>(null);
  const [showMobileScrollHint, setShowMobileScrollHint] = useState(false);
  const categoriesKey = sortedCategories.join('\u0000');

  const updateMobileScrollHint = useCallback(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const remainingScroll = scrollContainer.scrollWidth
      - scrollContainer.clientWidth
      - scrollContainer.scrollLeft;
    const hasHiddenCategories = scrollContainer.scrollWidth > scrollContainer.clientWidth + 4;
    setShowMobileScrollHint(hasHiddenCategories && remainingScroll > 4);
  }, []);

  useEffect(() => {
    updateMobileScrollHint();
    window.addEventListener('resize', updateMobileScrollHint);

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateMobileScrollHint);
    if (scrollContainerRef.current) resizeObserver?.observe(scrollContainerRef.current);

    return () => {
      window.removeEventListener('resize', updateMobileScrollHint);
      resizeObserver?.disconnect();
    };
  }, [categoriesKey, updateMobileScrollHint]);

  return (
    <div className="relative mb-6">
      <nav
        aria-label="Filter by service category"
        className="category-scroll -mx-4 overflow-x-auto px-4 pb-2 touch-pan-x sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0"
        onScroll={updateMobileScrollHint}
        ref={scrollContainerRef}
      >
        <div className="flex w-max min-w-full flex-nowrap gap-2 sm:w-full sm:flex-wrap">
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

      {showMobileScrollHint && (
        <div className="pointer-events-none absolute -right-4 bottom-2 top-0 flex w-16 items-center justify-end bg-gradient-to-r from-transparent via-[#f8f5ed]/90 to-[#f8f5ed] pr-2 sm:hidden">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-[var(--directory-green)] shadow-sm ring-1 ring-stone-200" aria-hidden="true">
            <ChevronRight className="h-4 w-4" />
          </span>
          <span className="sr-only" role="status">Swipe to see more categories.</span>
        </div>
      )}
    </div>
  );
}
