import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { WikiPage } from '@/features/wiki/types';
import { getWikiPages, createWikiPage } from '@/features/wiki/api';

export const useWikiIndex = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [newPageDialogOpen, setNewPageDialogOpen] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState('');
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Fetch all wiki pages
  useEffect(() => {
    const fetchPages = async () => {
      setIsLoading(true);
      try {
        const wikiPages = await getWikiPages();
        setPages(wikiPages);
        setError(null);
      } catch (err) {
        console.error('Error fetching wiki pages:', err);
        setError('Failed to load wiki pages');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchPages();
  }, []);
  
  const handlePageClick = (slug: string) => {
    navigate(`/wiki/${slug}`);
  };
  
  const handleCreatePageClick = () => {
    setNewPageDialogOpen(true);
  };
  
  const handleCreatePage = async () => {
    if (newPageTitle.trim()) {
      try {
        // Create a new page with initial empty content
        const newPage = await createWikiPage({
          title: newPageTitle,
          content: JSON.stringify([{ type: 'paragraph', content: [{ type: 'text', text: '' }] }]),
          excerpt: `A page about ${newPageTitle}`
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
    isLoading,
    error,
    newPageDialogOpen,
    setNewPageDialogOpen,
    newPageTitle,
    setNewPageTitle,
    handlePageClick,
    handleCreatePageClick,
    handleCreatePage
  };
};
