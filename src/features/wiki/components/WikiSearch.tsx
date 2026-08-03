import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistance } from 'date-fns';
import { BookOpen, Search, Tag, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useWikiSearch } from '@/features/wiki/hooks/useWikiSearch';

interface WikiSearchProps {
  variant?: 'icon' | 'inline';
}

const WikiSearch: React.FC<WikiSearchProps> = ({ variant = 'icon' }) => {
  const navigate = useNavigate();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const {
    query,
    setQuery,
    results,
    loading,
    error,
    selectedCategory,
    setSelectedCategory,
    clearSearch,
    clearCategoryFilter,
  } = useWikiSearch();

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
    clearSearch();
  }, [clearSearch]);

  const openSearch = () => {
    setIsSearchOpen(true);
    window.setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isSearchOpen) closeSearch();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeSearch, isSearchOpen]);

  const handleResultClick = (slug: string) => {
    navigate(`/wiki/${slug}`);
    closeSearch();
  };

  const formatTimeAgo = (dateString: string) => {
    try {
      return formatDistance(new Date(dateString), new Date(), { addSuffix: true });
    } catch {
      return '';
    }
  };

  return (
    <>
      {variant === 'icon' ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-full text-stone-500 hover:bg-[var(--directory-cream)] hover:text-[var(--directory-green)]"
          onClick={openSearch}
          aria-label="Search wiki"
        >
          <Search className="h-4 w-4" />
        </Button>
      ) : (
        <button
          type="button"
          onClick={openSearch}
          className="flex h-10 w-44 items-center gap-2 rounded-full border border-stone-200 bg-white px-3 text-sm text-stone-400 transition hover:border-green-900/20 hover:text-[var(--directory-green)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--directory-green)] xl:w-52"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="truncate">Search wiki…</span>
        </button>
      )}

      {isSearchOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-stone-950/25 px-4 pt-[10vh] backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeSearch();
          }}
        >
          <div className="flex max-h-[78vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/80 bg-[var(--directory-paper)] shadow-[0_24px_70px_rgba(36,48,39,0.24)]">
            <div className="flex items-center gap-3 border-b border-stone-200/80 p-4">
              <Search className="h-5 w-5 text-[var(--directory-green)]" />
              <Input
                ref={searchInputRef}
                placeholder="Search local guides and pages…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="flex-1 border-none bg-transparent text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                autoFocus
              />
              <Button variant="ghost" size="icon" onClick={closeSearch} className="h-9 w-9 rounded-full" aria-label="Close search">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="min-h-36 flex-1 overflow-y-auto p-3 sm:p-4">
              {loading && (
                <div className="flex items-center justify-center p-10 text-sm text-[var(--directory-muted)]">
                  <div className="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-[var(--directory-green)] border-r-transparent" />
                  Searching…
                </div>
              )}
              {error && <div className="p-8 text-center text-sm text-red-700">{error}</div>}
              {!loading && !error && !query && (
                <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--directory-cream)] text-[var(--directory-green)]">
                    <BookOpen className="h-5 w-5" />
                  </span>
                  <p className="mt-3 font-header text-lg font-semibold text-[var(--directory-ink)]">Find something useful</p>
                  <p className="mt-1 text-sm text-[var(--directory-muted)]">Search page titles, topics, and community notes.</p>
                </div>
              )}
              {!loading && !error && query && results.length === 0 && (
                <div className="p-10 text-center text-sm text-[var(--directory-muted)]">No results found for “{query}”.</div>
              )}
              {results.length > 0 && (
                <div className="space-y-2">
                  {selectedCategory && (
                    <div className="mb-3 flex items-center gap-2 px-1 text-xs text-[var(--directory-muted)]">
                      Filtered by
                      <Badge variant="outline" className="cursor-pointer rounded-full border-stone-200 bg-white" onClick={clearCategoryFilter}>
                        <Tag className="mr-1 h-3 w-3" />
                        {selectedCategory}
                        <X className="ml-1 h-3 w-3" />
                      </Badge>
                    </div>
                  )}
                  {results.map((result) => (
                    <button
                      type="button"
                      key={result.id}
                      className="w-full rounded-xl border border-stone-200/80 bg-white p-4 text-left transition hover:border-green-900/20 hover:bg-[var(--directory-cream)]/35"
                      onClick={() => handleResultClick(result.slug)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="flex items-center gap-2 font-header font-semibold text-[var(--directory-ink)]">
                          <BookOpen className="h-4 w-4 shrink-0 text-[var(--directory-green)]" />
                          {result.title}
                        </h3>
                        {result.category && (
                          <Badge
                            variant="secondary"
                            className="rounded-full bg-[var(--directory-cream)] text-[var(--directory-green)]"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (selectedCategory === result.category) clearCategoryFilter();
                              else setSelectedCategory(result.category || 'Uncategorized');
                            }}
                          >
                            {result.category}
                          </Badge>
                        )}
                      </div>
                      {result.matched_content && (
                        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[var(--directory-muted)]">{result.matched_content}</p>
                      )}
                      <p className="mt-2 text-xs text-stone-400">Updated {formatTimeAgo(result.updated_at)}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default WikiSearch;
