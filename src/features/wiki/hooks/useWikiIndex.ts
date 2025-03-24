import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { WikiPage } from '@/features/wiki/types';
import { getWikiPages, createWikiPage, getWikiCategories } from '@/features/wiki/api';

export const useWikiIndex = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [newPageDialogOpen, setNewPageDialogOpen] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState('');
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [categories, setCategories] = useState<string[]>(['Uncategorized']); // Start with default until loaded
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Function to fetch all wiki pages and categories
  const refreshData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch wiki pages and categories in parallel
      const [wikiPages, wikiCategories] = await Promise.all([
        getWikiPages(),
        getWikiCategories()
      ]);
      
      setPages(wikiPages);
      setCategories(wikiCategories); // Set categories dynamically from DB
      console.log('Dynamic categories refreshed:', wikiCategories);
      setError(null);
    } catch (err) {
      console.error('Error fetching wiki data:', err);
      setError('Failed to load wiki data');
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  // Listen for custom refresh events
  useEffect(() => {
    const handleWikiDataChanged = () => {
      console.log('Wiki data change event received, refreshing data...');
      refreshData();
    };
    
    // Add event listener for wiki data changes
    document.addEventListener('wiki-data-changed', handleWikiDataChanged);
    
    // Initial data fetch
    refreshData();
    
    // Clean up event listener on unmount
    return () => {
      document.removeEventListener('wiki-data-changed', handleWikiDataChanged);
    };
  }, [refreshData]);
  
  const handlePageClick = (slug: string) => {
    navigate(`/wiki/${slug}`);
  };
  
  const handleCreatePageClick = () => {
    setNewPageDialogOpen(true);
  };
  
  const handleCreatePage = async (pageData?: Partial<WikiPage>) => {
    if ((pageData?.title || newPageTitle).trim()) {
      try {
        // Create a new page with initial empty content
        // Use provided data or defaults
        const title = pageData?.title || newPageTitle;
        const newPage = await createWikiPage({
          title,
          content: JSON.stringify([{ type: 'paragraph', content: [{ type: 'text', text: '' }] }]),
          excerpt: pageData?.excerpt || `A page about ${title}`,
          category: pageData?.category || 'Uncategorized' // Default to Uncategorized category
        });
        
        toast({
          title: "Page created",
          description: `"${newPageTitle}" has been created successfully`
        });
        
        setNewPageDialogOpen(false);
        setNewPageTitle('');
        // Navigate to the new page with state indicating it's a new page
        navigate(`/wiki/${newPage.slug}`, { state: { isNewPage: true } });
      } catch (err) {
        console.error('Error creating wiki page:', err);
        toast({
          title: "Error creating page",
          description: "There was a problem creating the page",
          variant: "destructive"
        });
      }
    }
  };
  
  return {
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
    refreshData
  };
};
