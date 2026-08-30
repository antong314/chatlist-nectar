import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { WikiPage, WikiPageVersion } from '@/features/wiki/types';
import { 
  getWikiPage, 
  getWikiCategories, 
  getWikiPageVersions
} from '@/features/wiki/api';
import {
  completeVerifiedWikiWrite,
  prepareWhatsappLaunch,
  startWhatsappVerification,
  useVerifiedWhatsappSession,
  type VerificationActionType,
  type WhatsappVerificationChallenge,
} from '@/features/verification';

export const useWikiPage = (slug: string) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { session, isLoading: isLoadingSession, refresh: refreshVerifiedSession } = useVerifiedWhatsappSession();
  
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
  const [verificationChallenge, setVerificationChallenge] = useState<WhatsappVerificationChallenge | null>(null);
  const [verificationAction, setVerificationAction] = useState<VerificationActionType | null>(null);
  const [verificationError, setVerificationError] = useState('');
  const [whatsappAutoLaunchFailed, setWhatsappAutoLaunchFailed] = useState(false);
  const [isStartingVerification, setIsStartingVerification] = useState(false);
  
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
  
  const finishVerifiedWrite = async (challenge: WhatsappVerificationChallenge, action: VerificationActionType) => {
    await completeVerifiedWikiWrite(challenge);
    await refreshVerifiedSession();
    setVerificationChallenge(null);
    setVerificationAction(null);
    setVerificationError('');
    document.dispatchEvent(new Event('wiki-data-changed'));
    if (action === 'wiki_delete') {
      toast({ title: 'Page deleted', description: 'The page was deleted and the change was recorded.' });
      navigate('/wiki');
      return;
    }
    const refreshedPage = await getWikiPage(slug);
    setPage(refreshedPage);
    setEditedContent(refreshedPage.content || '');
    setEditedTitle(refreshedPage.title);
    setEditedCategory(refreshedPage.category || 'Uncategorized');
    setIsEditing(false);
    setVersionHistoryOpen(false);
    setVersions([]);
    toast({ title: action === 'wiki_update' ? 'Page updated' : 'Page saved', description: 'Your change was saved and attributed to your verified WhatsApp number.' });
  };

  const beginVerifiedWrite = async (actionType: VerificationActionType, payload: Record<string, unknown>) => {
    if (verificationChallenge || isLoadingSession || isStartingVerification) return;
    const whatsappLaunch = session.authenticated ? null : prepareWhatsappLaunch();
    setIsStartingVerification(true);
    setVerificationError('');
    try {
      const challenge = await startWhatsappVerification({ actionType, payload });
      setVerificationAction(actionType);
      if (challenge.requiresWhatsappApproval) {
        setWhatsappAutoLaunchFailed(!whatsappLaunch?.open(challenge.whatsappUrl));
        setVerificationChallenge(challenge);
      } else {
        whatsappLaunch?.cancel();
        await finishVerifiedWrite(challenge, actionType);
      }
    } catch (writeError) {
      whatsappLaunch?.cancel();
      const message = writeError instanceof Error ? writeError.message : 'The wiki change could not be saved.';
      setVerificationError(message);
      throw writeError;
    } finally {
      setIsStartingVerification(false);
    }
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
      
      await beginVerifiedWrite('wiki_update', {
        slug: page.slug,
        title: pageUpdate.title,
        content: pageUpdate.content,
        category: pageUpdate.category,
        expectedVersion: page.version,
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
      await beginVerifiedWrite('wiki_delete', {
        slug: page.slug,
        title: page.title,
        category: page.category || 'Uncategorized',
        expectedVersion: page.version,
      });
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
      const version = versions.find((candidate) => candidate.version === versionToRestore);
      if (!version || !page) throw new Error('That wiki version is no longer available.');
      await beginVerifiedWrite('wiki_update', {
        slug: page.slug,
        title: version.title,
        content: version.content,
        category: version.category || 'Uncategorized',
        expectedVersion: page.version,
      });
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
    fetchVersionHistory,
    verificationChallenge,
    verificationError,
    whatsappAutoLaunchFailed,
    isLoadingSession,
    isStartingVerification,
    completeApprovedWikiWrite: async () => {
      if (!verificationChallenge || !verificationAction) return;
      await finishVerifiedWrite(verificationChallenge, verificationAction);
    },
    resetWikiVerification: () => {
      setVerificationChallenge(null);
      setVerificationAction(null);
      setVerificationError('');
      setWhatsappAutoLaunchFailed(false);
    }
  };
};
