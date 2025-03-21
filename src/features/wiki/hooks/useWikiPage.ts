import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { WikiPage } from '@/features/wiki/types';
import { getWikiPage, updateWikiPage, deleteWikiPage } from '@/features/wiki/api';

export const useWikiPage = (slug: string) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  
  // Check if this is a new page from navigation state
  const isNewPage = location.state?.isNewPage === true;
  
  // State
  const [page, setPage] = useState<WikiPage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  // Fetch page when slug changes
  useEffect(() => {
    const fetchPage = async () => {
      setIsLoading(true);
      try {
        const fetchedPage = await getWikiPage(slug);
        setPage(fetchedPage);
        setEditedContent(fetchedPage.content || '');
        
        // Auto-enter edit mode if this is a new page (either from navigation state or by timestamp)
        const isNewlyCreated = fetchedPage.created_at && 
          (new Date().getTime() - new Date(fetchedPage.created_at).getTime() < 5000);
        
        // Auto-enter edit mode for newly created pages
        setIsEditing(isNewPage || isNewlyCreated);
        setError(null);
      } catch (err) {
        console.error('Error fetching wiki page:', err);
        setError('Failed to load the wiki page');
        // Navigate to wiki index if page not found
        navigate('/wiki');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchPage();
  }, [slug, navigate]);
  
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
    
    console.log('Saving content:', editedContent);
    console.log('Current page:', page);
    
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
      
      // Create a copy of the current page with updated content
      const pageUpdate = { 
        content: editedContent,
        title: page.title, // Include title to ensure it's preserved
        excerpt: page.excerpt || `A page about ${page.title}` // Ensure excerpt is preserved
      };
      
      console.log('Sending update with payload:', pageUpdate);
      
      const updatedPage = await updateWikiPage(page.slug, pageUpdate);
      console.log('Received updated page:', updatedPage);
      
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
    isLoading,
    error,
    isEditing,
    editedContent,
    deleteDialogOpen,
    setEditedContent,
    setDeleteDialogOpen,
    handleEdit,
    handleSave,
    handleDelete,
    confirmDelete
  };
};
