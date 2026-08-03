import React, { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  Clock3,
  FileText,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import WikiLayout from '@/features/wiki/components/WikiLayout';
import { useWikiIndex } from '@/features/wiki/hooks';
import { getCategoryIcon } from '@/features/wiki/utils/categoryIcons';
import { WikiPage } from '@/features/wiki/types';
import { trackPageView } from '@/utils/analytics';

const formatDate = (dateString?: string) => {
  if (!dateString) return 'Date unavailable';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const PageTile: React.FC<{
  page: WikiPage;
  onClick: () => void;
}> = ({ page, onClick }) => {
  const excerpt = page.excerpt || `Community notes and resources about ${page.title}.`;
  const lastEdited = page.updated_at ? formatDate(page.updated_at) : (page.lastEdited || 'Date unavailable');

  return (
    <button
      type="button"
      className="group flex h-full min-h-44 w-full flex-col rounded-2xl border border-stone-200/80 bg-[var(--directory-paper)] p-5 text-left shadow-[0_2px_12px_rgba(46,57,44,0.05)] transition duration-200 hover:-translate-y-0.5 hover:border-green-900/20 hover:shadow-[0_10px_28px_rgba(46,57,44,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--directory-green)] focus-visible:ring-offset-2"
      onClick={onClick}
    >
      <div className="flex w-full items-start justify-between gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--directory-cream)] text-[var(--directory-green)]">
          <FileText className="h-4 w-4" />
        </span>
        <ArrowUpRight className="h-4 w-4 text-stone-300 transition group-hover:text-[var(--directory-green)]" />
      </div>
      <h3 className="mt-4 font-header text-xl font-semibold leading-tight text-[var(--directory-ink)] group-hover:text-[var(--directory-green)]">
        {page.title}
      </h3>
      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[var(--directory-muted)]">
        {excerpt}
      </p>
      <div className="mt-auto flex items-center gap-1.5 pt-5 text-xs text-stone-500">
        <Clock3 className="h-3.5 w-3.5" />
        <span>Updated {lastEdited}</span>
      </div>
    </button>
  );
};

const WikiIndexPage: React.FC = () => {
  useEffect(() => {
    trackPageView('/wiki', 'Wiki Index');
  }, []);

  const [selectedCategory, setSelectedCategory] = useState('Uncategorized');
  const {
    pages,
    categories,
    isLoading,
    error,
    newPageDialogOpen,
    setNewPageDialogOpen,
    newPageTitle,
    setNewPageTitle,
    handlePageClick,
    handleCreatePageClick,
    handleCreatePage,
  } = useWikiIndex();
  const predefinedCategories = categories.map((category) => category.toLowerCase());
  const additionalCategories = [...new Set(
    pages
      .map((page) => page.category || 'Uncategorized')
      .filter((category) => !predefinedCategories.includes(category.toLowerCase())),
  )];
  const visibleCategories = [...categories, ...additionalCategories];

  return (
    <WikiLayout title="San Mateo Love Wiki">
      <div className="animate-fade-in">
        <section className="wiki-hero" aria-labelledby="wiki-heading">
          <div className="relative z-10 max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--directory-green)] shadow-sm">
              <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
              Knowledge shared by neighbors
            </div>
            <h1 id="wiki-heading" className="font-header text-3xl font-semibold leading-tight tracking-[-0.025em] text-[var(--directory-ink)] sm:text-4xl">
              Local knowledge, kept together.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--directory-muted)] sm:text-base">
              Browse practical guides, community resources, and the little things neighbors learn by living here.
            </p>
          </div>
          <Button onClick={handleCreatePageClick} className="add-entry-btn relative z-10 mt-6 sm:mt-0">
            <Plus className="h-4 w-4" />
            New page
          </Button>
        </section>

        <div className="mb-4 mt-7 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--directory-green)]">
              Community guide
            </p>
            <h2 className="mt-1 font-header text-2xl font-semibold text-[var(--directory-ink)]">Browse by topic</h2>
          </div>
          {!isLoading && !error && (
            <span className="text-sm text-[var(--directory-muted)]">
              {pages.length} {pages.length === 1 ? 'page' : 'pages'}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="wiki-state-card" aria-live="polite">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--directory-green)] border-r-transparent" />
            <p>Loading wiki pages…</p>
          </div>
        ) : error ? (
          <div className="wiki-state-card text-red-700">
            <h2 className="font-header text-xl font-semibold">We couldn’t load the wiki</h2>
            <p className="text-sm text-[var(--directory-muted)]">{error}</p>
          </div>
        ) : pages.length === 0 ? (
          <div className="wiki-state-card">
            <BookOpen className="h-8 w-8 text-[var(--directory-leaf)]" />
            <h3 className="font-header text-xl font-semibold text-[var(--directory-ink)]">Start the community guide</h3>
            <p className="text-sm text-[var(--directory-muted)]">Create the first page to share something useful.</p>
            <Button onClick={handleCreatePageClick} className="rounded-xl bg-[var(--directory-green)] hover:bg-[var(--directory-green-hover)]">
              <Plus className="mr-2 h-4 w-4" />
              Create a page
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            {visibleCategories.map((category) => {
              const categoryPages = pages.filter(
                (page) => (page.category || 'Uncategorized').toLowerCase() === category.toLowerCase(),
              );
              if (categoryPages.length === 0) return null;
              return (
                <CategorySection
                  key={category}
                  category={category}
                  pages={categoryPages}
                  onPageClick={handlePageClick}
                />
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={newPageDialogOpen} onOpenChange={setNewPageDialogOpen}>
        <DialogContent className="border-stone-200 bg-[var(--directory-paper)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-header text-2xl text-[var(--directory-ink)]">Create a new page</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="index-page-title">Page title</Label>
              <Input
                id="index-page-title"
                value={newPageTitle}
                onChange={(event) => setNewPageTitle(event.target.value)}
                placeholder="Enter page title"
                className="mt-1.5 rounded-xl border-stone-200 focus-visible:ring-[var(--directory-green)]"
              />
            </div>
            <div>
              <Label htmlFor="index-page-category">Category</Label>
              <select
                id="index-page-category"
                className="mt-1.5 flex h-10 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-[var(--directory-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--directory-green)]"
                value={selectedCategory}
                onChange={(event) => setSelectedCategory(event.target.value)}
              >
                {categories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setNewPageDialogOpen(false)}>Cancel</Button>
            <Button
              className="rounded-xl bg-[var(--directory-green)] hover:bg-[var(--directory-green-hover)]"
              onClick={() => handleCreatePage({
                title: newPageTitle,
                category: selectedCategory || 'Uncategorized',
              })}
            >
              Create page
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WikiLayout>
  );
};

interface CategorySectionProps {
  category: string;
  pages: WikiPage[];
  onPageClick: (slug: string) => void;
}

const CategorySection: React.FC<CategorySectionProps> = ({ category, pages, onPageClick }) => {
  const [isOpen, setIsOpen] = useState(true);
  const CategoryIcon = getCategoryIcon(category);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white/65 shadow-[0_2px_12px_rgba(46,57,44,0.04)]">
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto w-full justify-between rounded-none px-5 py-4 text-left hover:bg-[var(--directory-cream)]/65"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--directory-cream)] text-[var(--directory-green)]">
              <CategoryIcon className="h-4 w-4" />
            </span>
            <span>
              <span className="block font-header text-lg font-semibold leading-tight text-[var(--directory-ink)]">{category}</span>
              <span className="mt-0.5 block text-xs font-normal text-[var(--directory-muted)]">
                {pages.length} {pages.length === 1 ? 'page' : 'pages'}
              </span>
            </span>
          </span>
          <ChevronDown className={`h-5 w-5 text-stone-400 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid grid-cols-1 gap-4 border-t border-stone-200/70 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-3">
          {pages.map((page) => (
            <PageTile key={page.id} page={page} onClick={() => onPageClick(page.slug)} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default WikiIndexPage;
