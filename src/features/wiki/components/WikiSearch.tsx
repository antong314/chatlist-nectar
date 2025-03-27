import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Search as SearchIcon, X, BookOpen, Tag } from 'lucide-react';
import { useWikiSearch } from '@/features/wiki/hooks/useWikiSearch';
import { formatDistance } from 'date-fns';

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

  // Toggle search panel
  const toggleSearch = () => {
    const newState = !isSearchOpen;
    setIsSearchOpen(newState);
    
    if (newState && searchInputRef.current) {
      // Focus the search input when opening
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    } else {
      // Clear search when closing
      clearSearch();
    }
  };
  
  // Handle escape key press to close search
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isSearchOpen) {
        toggleSearch();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    
    // Clean up the event listener when component unmounts
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSearchOpen]); // Re-run effect when isSearchOpen changes

  // Navigate to a search result
  const handleResultClick = (slug: string) => {
    navigate(`/wiki/${slug}`);
    setIsSearchOpen(false);
    clearSearch();
  };

  // Apply category filter
  const handleCategoryClick = (category: string) => {
    if (selectedCategory === category) {
      clearCategoryFilter();
    } else {
      setSelectedCategory(category);
    }
  };

  // Format time
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
          className="ml-2"
          onClick={toggleSearch}
          aria-label={isSearchOpen ? "Close search" : "Open search"}
        >
          <SearchIcon className="h-4 w-4" />
        </Button>
      ) : (
        <div className="relative w-full max-w-sm">
          <div className="flex h-9 items-center rounded-md border bg-background px-3 py-1 text-sm shadow-sm">
            <SearchIcon className="h-4 w-4 mr-2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search wiki..."
              className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onClick={() => {
                if (!isSearchOpen) {
                  setIsSearchOpen(true);
                }
              }}
            />
          </div>
        </div>
      )}
      
      {isSearchOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-start justify-center pt-16 px-4">
          <div className="w-full max-w-2xl bg-white shadow-lg rounded-lg overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-4 flex items-center gap-2 border-b">
              <SearchIcon className="h-5 w-5 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder="Search wiki..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 border-none focus-visible:ring-0 focus-visible:ring-offset-0"
                autoFocus
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleSearch}
                className="h-8 w-8"
                aria-label="Close search"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="overflow-y-auto flex-1">
              {loading && (
                <div className="flex justify-center items-center p-8">
                  <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-primary border-r-transparent"></div>
                  <span className="ml-2 text-sm text-muted-foreground">Searching...</span>
                </div>
              )}
              
              {error && (
                <div className="p-6 text-center text-red-500">
                  <p>{error}</p>
                </div>
              )}
              
              {!loading && !error && query.length > 0 && results.length === 0 && (
                <div className="p-6 text-center text-muted-foreground">
                  <p>No results found for "{query}"</p>
                </div>
              )}
              
              {results.length > 0 && (
                <div className="p-2">
                  {/* Show applied category filter if selected */}
                  {selectedCategory && (
                    <div className="px-2 py-1 flex items-center">
                      <span className="text-xs text-muted-foreground mr-2">Filtered by:</span>
                      <Badge 
                        variant="outline" 
                        className="flex items-center gap-1"
                        onClick={clearCategoryFilter}
                      >
                        <Tag className="h-3 w-3" />
                        {selectedCategory}
                        <X className="h-3 w-3 ml-1 cursor-pointer" />
                      </Badge>
                    </div>
                  )}
                  
                  {/* Results list */}
                  <div className="space-y-2">
                    {results.map((result) => (
                      <Card 
                        key={result.id} 
                        className="p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => handleResultClick(result.slug)}
                      >
                        <div className="flex justify-between items-start">
                          <h3 className="font-medium text-primary flex items-center">
                            <BookOpen className="h-3 w-3 mr-1 flex-shrink-0" />
                            {result.title}
                          </h3>
                          {result.category && (
                            <Badge 
                              variant="secondary" 
                              className="text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCategoryClick(result.category || 'Uncategorized');
                              }}
                            >
                              {result.category}
                            </Badge>
                          )}
                        </div>
                        
                        {result.matched_content && (
                          <div className="mt-2 text-xs bg-muted/50 p-1.5 rounded">
                            <p className="text-muted-foreground">
                              {result.matched_content}
                            </p>
                          </div>
                        )}
                        
                        <div className="mt-2 text-xs text-muted-foreground">
                          Updated {formatTimeAgo(result.updated_at)}
                        </div>
                      </Card>
                    ))}
                  </div>
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
