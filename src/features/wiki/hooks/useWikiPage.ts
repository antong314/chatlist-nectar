import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { WikiPage } from '@/features/wiki/types';
import { getWikiPage, updateWikiPage, deleteWikiPage, getWikiCategories } from '@/features/wiki/api';

export const useWikiPage = (slug: string) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  
  // Check if this is a new page from navigation state
  const isNewPage = location.state?.isNewPage === true;
  
  // State
  const [page, setPage] = useState<WikiPage | null>(null);
  const [categories, setCategories] = useState<string[]>(['Uncategorized']);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [editedTitle, setEditedTitle] = useState('');
  const [editedCategory, setEditedCategory] = useState<string>('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  // Fetch page when slug changes
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Fetch page and categories in parallel for better performance
        const [fetchedPage, wikiCategories] = await Promise.all([
          getWikiPage(slug),
          getWikiCategories()
        ]);
        
        // Update categories state with dynamically fetched categories
        setCategories(wikiCategories);
        console.log('Dynamic categories loaded in useWikiPage:', wikiCategories);
        
        setPage(fetchedPage);
        setEditedContent(fetchedPage.content || '');
        setEditedTitle(fetchedPage.title);
        setEditedCategory(fetchedPage.category || 'Uncategorized');
        
        // Auto-enter edit mode if this is a new page (either from navigation state or by timestamp)
        const isNewlyCreated = fetchedPage.created_at && 
          (new Date().getTime() - new Date(fetchedPage.created_at).getTime() < 5000);
        
        // Auto-enter edit mode for newly created pages
        setIsEditing(isNewPage || isNewlyCreated);
        setError(null);
      } catch (err) {
        console.error('Error fetching wiki data:', err);
        setError('Failed to load the wiki page');
        // Navigate to wiki index if page not found
        navigate('/wiki');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, [slug, navigate, isNewPage]);
  
  const handleEdit = () => {
    setIsEditing(true);
    
    // Dispatch a custom event to signal that edit mode has been activated
    // This can be listened for by components that need to respond to edit mode changes
    setTimeout(() => {
      document.dispatchEvent(new CustomEvent('wiki-edit-mode-activated'));
    }, 100);
  };
  
  const handleSave = async () => {
    if (!page) {
      console.error('Cannot save: page is null');
      return;
    }
    
    // Prepare to save the edited content
    
    try {
      // Make sure we have content to save
      if (!editedContent) {
        console.warn('No content to save');
        toast({
          title: "Warning",
          description: "No content changes detected to save",
          variant: "default"
        });
        return;
      }
      
      // Create a copy of the current page with updated content, title, and category
      const pageUpdate = { 
        content: editedContent,
        title: editedTitle || page.title, // Use edited title if available
        excerpt: page.excerpt || `A page about ${editedTitle || page.title}`, // Ensure excerpt is preserved
        category: editedCategory || 'Uncategorized'
      };
      
      const updatedPage = await updateWikiPage(page.slug, pageUpdate);
      
      // Update local state with the returned page
      setPage(updatedPage);
      setIsEditing(false);
      
      toast({
        title: "Page updated",
        description: "Your changes have been saved successfully"
      });
    } catch (err) {
      console.error('Error saving wiki page:', err);
      toast({
        title: "Error saving page",
        description: "There was a problem saving your changes",
        variant: "destructive"
      });
    }
  };
  
  const handleDelete = () => {
    setDeleteDialogOpen(true);
  };
  
  const confirmDelete = async () => {
    if (!page) return;
    
    try {
      await deleteWikiPage(page.slug);
      toast({
        title: "Page deleted",
        description: "The page has been deleted successfully"
      });
      navigate('/wiki');
    } catch (err) {
      console.error('Error deleting wiki page:', err);
      toast({
        title: "Error deleting page",
        description: "There was a problem deleting the page",
        variant: "destructive"
      });
    } finally {
      setDeleteDialogOpen(false);
    }
  };
  
  return {
    page,
    categories,
    isLoading,
    error,
    isEditing,
    editedContent,
    editedTitle,
    editedCategory,
    deleteDialogOpen,
    setEditedContent,
    setEditedTitle,
    setEditedCategory,
    setDeleteDialogOpen,
    handleEdit,
    handleSave,
    handleDelete,
    confirmDelete
  };
};
