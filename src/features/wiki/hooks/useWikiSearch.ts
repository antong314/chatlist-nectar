import { useState, useEffect, useCallback } from 'react';
import { useDebounce } from '../../../hooks/useDebounce';
import { searchWikiPages } from '@/features/wiki/api';
import { WikiSearchResult, WikiSearchParams } from '@/features/wiki/types';

export const useWikiSearch = (initialQuery = '') => {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<WikiSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);

  // Debounce the search query to avoid too many API calls
  const debouncedQuery = useDebounce(query, 300);

  // Search function
  const searchWiki = useCallback(async (searchQuery: string, category?: string) => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const searchParams: WikiSearchParams = {
        query: searchQuery,
        category,
        limit: 20,
      };

      const searchResults = await searchWikiPages(searchParams);
      setResults(searchResults);
    } catch (err) {
      console.error('Error searching wiki:', err);
      setError('Failed to search the wiki. Please try again.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Effect to trigger search when debounced query changes
  useEffect(() => {
    if (debouncedQuery) {
      searchWiki(debouncedQuery, selectedCategory);
    } else {
      setResults([]);
    }
  }, [debouncedQuery, selectedCategory, searchWiki]);

  // Clear search results
  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    setSelectedCategory(undefined);
  }, []);

  // Reset just the category filter
  const clearCategoryFilter = useCallback(() => {
    setSelectedCategory(undefined);
    if (debouncedQuery) {
      searchWiki(debouncedQuery);
    }
  }, [debouncedQuery, searchWiki]);

  return {
    query,
    setQuery,
    results,
    loading,
    error,
    selectedCategory,
    setSelectedCategory,
    clearSearch,
    clearCategoryFilter,
  };
};
