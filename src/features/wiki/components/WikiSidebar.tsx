import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  FilePlus,
  FileText,
  Loader2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useWikiIndex } from '@/features/wiki/hooks';
import { getCategoryIcon } from '@/features/wiki/utils/categoryIcons';
import { WikiPage } from '@/features/wiki/types';

interface WikiSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  onCreatePage: () => void;
}

const WikiSidebar: React.FC<WikiSidebarProps> = ({ isOpen, onToggle, onCreatePage }) => {
  const currentPath = useLocation().pathname;
  const { pages, categories, isLoading } = useWikiIndex();
  const predefinedCategories = categories.map((category) => category.toLowerCase());
  const additionalCategories = [...new Set(
    pages
      .map((page) => page.category || 'Uncategorized')
      .filter((category) => !predefinedCategories.includes(category.toLowerCase())),
  )];
  const visibleCategories = [...categories, ...additionalCategories];

  return (
    <>
      {isOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-stone-950/25 backdrop-blur-[2px] md:hidden"
          onClick={onToggle}
          aria-label="Dismiss page menu"
        />
      )}

      <aside
        className={`${
          isOpen
            ? 'fixed inset-y-3 left-3 z-50 flex w-[min(19rem,calc(100vw-1.5rem))] md:sticky md:top-24 md:z-20 md:w-72'
            : 'hidden'
        } h-[calc(100dvh-1.5rem)] shrink-0 flex-col overflow-hidden rounded-2xl border border-stone-200/80 bg-[var(--directory-paper)] shadow-[0_12px_38px_rgba(46,57,44,0.14)] md:h-[calc(100vh-7rem)] md:shadow-[0_2px_12px_rgba(46,57,44,0.06)]`}
        aria-label="Wiki pages"
      >
        <div className="flex items-center justify-between border-b border-stone-200/80 px-4 py-3.5">
          <Link to="/wiki" className="flex items-center gap-2 text-[var(--directory-ink)]">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--directory-cream)] text-[var(--directory-green)]">
              <BookOpen className="h-4 w-4" />
            </span>
            <span>
              <span className="block font-header text-lg font-semibold leading-none">Wiki pages</span>
              <span className="mt-1 block text-[11px] text-[var(--directory-muted)]">Browse by category</span>
            </span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-stone-500 hover:bg-[var(--directory-cream)] hover:text-[var(--directory-green)] md:hidden"
            onClick={onToggle}
            aria-label="Close wiki pages"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-3">
          <Button
            onClick={onCreatePage}
            className="w-full rounded-xl bg-[var(--directory-green)] text-white hover:bg-[var(--directory-green-hover)]"
          >
            <FilePlus className="mr-2 h-4 w-4" />
            New page
          </Button>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <nav className="px-3 pb-4">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-10 text-[var(--directory-muted)]">
                <Loader2 className="mb-2 h-5 w-5 animate-spin" />
                <span className="text-sm">Loading pages…</span>
              </div>
            ) : pages.length > 0 ? (
              visibleCategories.map((category) => {
                const categoryPages = pages.filter(
                  (page) => (page.category || 'Uncategorized').toLowerCase() === category.toLowerCase(),
                );
                if (categoryPages.length === 0) return null;
                return (
                  <CategoryItem
                    key={category}
                    category={category}
                    pages={categoryPages}
                    currentPath={currentPath}
                  />
                );
              })
            ) : (
              <div className="rounded-xl bg-[var(--directory-cream)]/60 px-3 py-4 text-sm leading-relaxed text-[var(--directory-muted)]">
                No pages yet. Create the first page to start sharing local knowledge.
              </div>
            )}
          </nav>
        </ScrollArea>
      </aside>

      {!isOpen && (
        <Button
          variant="outline"
          size="icon"
          onClick={onToggle}
          className="sticky top-24 hidden h-10 w-10 shrink-0 rounded-full border-stone-200 bg-white text-[var(--directory-green)] shadow-sm hover:bg-[var(--directory-cream)] md:inline-flex"
          aria-label="Open wiki pages"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}
    </>
  );
};

interface CategoryItemProps {
  category: string;
  pages: WikiPage[];
  currentPath: string;
}

const CategoryItem: React.FC<CategoryItemProps> = ({ category, pages, currentPath }) => {
  const [isOpen, setIsOpen] = useState(true);
  const CategoryIcon = getCategoryIcon(category);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mb-1">
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto w-full justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[var(--directory-ink)] hover:bg-[var(--directory-cream)] hover:text-[var(--directory-green)]"
        >
          <span className="flex min-w-0 items-center gap-2">
            <CategoryIcon className="h-4 w-4 shrink-0 text-[var(--directory-leaf)]" />
            <span className="truncate">{category}</span>
            <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-500">
              {pages.length}
            </span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-stone-400 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="ml-5 border-l border-stone-200 pl-2">
          {pages.map((page) => {
            const isActive = currentPath === `/wiki/${page.slug || page.id}`;
            return (
              <Link
                key={page.id}
                to={`/wiki/${page.slug || page.id}`}
                className={`mb-0.5 flex items-start gap-2 rounded-lg px-2.5 py-2 text-sm leading-snug transition-colors ${
                  isActive
                    ? 'bg-[var(--directory-cream)] font-semibold text-[var(--directory-green)]'
                    : 'text-[var(--directory-muted)] hover:bg-stone-100 hover:text-[var(--directory-ink)]'
                }`}
              >
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{page.title}</span>
              </Link>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default WikiSidebar;
