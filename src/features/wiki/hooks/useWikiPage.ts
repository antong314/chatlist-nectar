import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { WikiPage, WikiPageVersion } from '@/features/wiki/types';
import { 
  getWikiPage, 
  updateWikiPage, 
  deleteWikiPage, 
  getWikiCategories, 
  getWikiPageVersions,
  restoreWikiPageVersion
} from '@/features/wiki/api';

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
  
  // Version history state
  const [versions, setVersions] = useState<WikiPageVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<WikiPageVersion | null>(null);
  const [restoringVersion, setRestoringVersion] = useState(false);
  
  // Fetch page when slug changes
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      // Reset version history when changing pages
      setVersions([]);
      setSelectedVersion(null);
      setVersionHistoryOpen(false);
      
      try {
        // Fetch page and categories in parallel for better performance
        const [fetchedPage, wikiCategories] = await Promise.all([
          getWikiPage(slug),
          getWikiCategories()
        ]);
        
        // Update categories state with dynamically fetched categories
        setCategories(wikiCategories);
        // Dynamic categories loaded
        
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
      
      // Dispatch custom event to notify other components that wiki data has changed
      const wikiDataChangedEvent = new Event('wiki-data-changed');
      document.dispatchEvent(wikiDataChangedEvent);
      console.log('Dispatched wiki-data-changed event after updating page');
      
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
      
      // Dispatch custom event to notify other components that wiki data has changed
      const wikiDataChangedEvent = new Event('wiki-data-changed');
      document.dispatchEvent(wikiDataChangedEvent);
      console.log('Dispatched wiki-data-changed event after deleting page');
      
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
  
  // Fetch version history
  const fetchVersionHistory = async () => {
    if (!slug) return;
    
    // Always use current slug when fetching version history
    const currentSlug = slug;
    console.log(`Fetching version history for page with slug: ${currentSlug}`);
    
    setLoadingVersions(true);
    try {
      const pageVersions = await getWikiPageVersions(currentSlug);
      console.log(`Retrieved ${pageVersions.length} versions for slug: ${currentSlug}`);
      setVersions(pageVersions);
      
      // Set the current version as the default selected version
      const currentVersion = pageVersions.find(v => v.is_current);
      if (currentVersion) {
        setSelectedVersion(currentVersion);
      }
    } catch (err) {
      console.error(`Failed to fetch version history for ${currentSlug}:`, err);
      toast({
        title: 'Error',
        description: `Failed to load version history: ${err instanceof Error ? err.message : 'Unknown error'}`,
        variant: 'destructive',
      });
    } finally {
      setLoadingVersions(false);
    }
  };
  
  // Toggle version history dialog
  const toggleVersionHistory = () => {
    const newState = !versionHistoryOpen;
    setVersionHistoryOpen(newState);
    
    // If opening the dialog, fetch the version history
    if (newState && versions.length === 0) {
      fetchVersionHistory();
    }
  };
  
  // Select a version to view
  const selectVersion = (version: WikiPageVersion) => {
    setSelectedVersion(version);
  };
  
  // Restore a specific version
  const handleRestoreVersion = async (versionToRestore: number) => {
    if (!slug) return;
    
    setRestoringVersion(true);
    try {
      const restoredPage = await restoreWikiPageVersion(slug, versionToRestore);
      
      // Update the current page with the restored content
      setPage(restoredPage);
      
      // Refresh the version history
      await fetchVersionHistory();
      
      // Dispatch custom event to notify other components that wiki data has changed
      const wikiDataChangedEvent = new Event('wiki-data-changed');
      document.dispatchEvent(wikiDataChangedEvent);
      
      toast({
        title: 'Version restored',
        description: `Page has been restored to version ${versionToRestore}.`,
      });
      
      // Close the version history dialog
      setVersionHistoryOpen(false);
    } catch (err) {
      console.error('Failed to restore version:', err);
      toast({
        title: 'Error',
        description: `Failed to restore version: ${err instanceof Error ? err.message : 'Unknown error'}`,
        variant: 'destructive',
      });
    } finally {
      setRestoringVersion(false);
    }
  };
  
  return {
    // Page data
    page,
    categories,
    isLoading,
    error,
    
    // Editing state
    isEditing,
    editedContent,
    editedTitle,
    editedCategory,
    
    // Edit actions
    setEditedContent,
    setEditedTitle,
    setEditedCategory,
    handleEdit,
    handleSave,
    
    // Delete actions
    deleteDialogOpen,
    setDeleteDialogOpen,
    handleDelete,
    confirmDelete,
    
    // Version history
    versions,
    loadingVersions,
    versionHistoryOpen,
    selectedVersion,
    restoringVersion,
    toggleVersionHistory,
    selectVersion,
    handleRestoreVersion,
    fetchVersionHistory
  };
};
