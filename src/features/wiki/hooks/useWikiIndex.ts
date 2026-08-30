import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { WikiPage } from '@/features/wiki/types';
import { getWikiPages, getWikiCategories } from '@/features/wiki/api';
import {
  completeVerifiedWikiWrite,
  prepareWhatsappLaunch,
  startWhatsappVerification,
  useVerifiedWhatsappSession,
  type WhatsappVerificationChallenge,
} from '@/features/verification';

const createSlug = (title: string) => title.toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

export const useWikiIndex = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { session, isLoading: isLoadingSession, refresh: refreshVerifiedSession } = useVerifiedWhatsappSession();
  const [newPageDialogOpen, setNewPageDialogOpen] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState('');
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [categories, setCategories] = useState<string[]>(['Uncategorized']); // Start with default until loaded
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verificationChallenge, setVerificationChallenge] = useState<WhatsappVerificationChallenge | null>(null);
  const [verificationError, setVerificationError] = useState('');
  const [whatsappAutoLaunchFailed, setWhatsappAutoLaunchFailed] = useState(false);
  const [pendingTitle, setPendingTitle] = useState('');
  const [isStartingVerification, setIsStartingVerification] = useState(false);
  
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
      // Dynamic categories refreshed
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
    if ((pageData?.title || newPageTitle).trim() && !verificationChallenge && !isStartingVerification) {
      setVerificationError('');
      setIsStartingVerification(true);
      const whatsappLaunch = session.authenticated ? null : prepareWhatsappLaunch();
      try {
        // Create a new page with initial empty content
        // Use provided data or defaults
        const title = pageData?.title || newPageTitle;
        const content = JSON.stringify([{ type: 'paragraph', content: [{ type: 'text', text: '' }] }]);
        const challenge = await startWhatsappVerification({
          actionType: 'wiki_create',
          payload: {
            slug: createSlug(title),
            title,
            content,
            category: pageData?.category || 'Uncategorized',
          },
        });
        setPendingTitle(title);
        if (challenge.requiresWhatsappApproval) {
          setWhatsappAutoLaunchFailed(!whatsappLaunch?.open(challenge.whatsappUrl));
          setVerificationChallenge(challenge);
        } else {
          whatsappLaunch?.cancel();
          const result = await completeVerifiedWikiWrite(challenge);
          await refreshVerifiedSession();
          const slug = typeof result.page?.slug === 'string' ? result.page.slug : createSlug(title);
          setNewPageDialogOpen(false);
          setNewPageTitle('');
          navigate(`/wiki/${slug}`, { state: { isNewPage: true } });
        }
      } catch (err) {
        whatsappLaunch?.cancel();
        console.error('Error creating wiki page:', err);
        
        // Extract the specific error message if available
        const errorMessage = err instanceof Error
          ? err.message
          : "There was a problem creating the page";
        setVerificationError(errorMessage);
        
        toast({
          title: "Error creating page",
          description: errorMessage,
          variant: "destructive"
        });
      } finally {
        setIsStartingVerification(false);
      }
    }
  };

  const completeApprovedCreate = async () => {
    if (!verificationChallenge) return;
    const result = await completeVerifiedWikiWrite(verificationChallenge);
    await refreshVerifiedSession();
    const slug = typeof result.page?.slug === 'string' ? result.page.slug : createSlug(pendingTitle);
    setVerificationChallenge(null);
    setVerificationError('');
    setNewPageDialogOpen(false);
    setNewPageTitle('');
    toast({ title: 'Page created', description: `“${pendingTitle}” is ready to edit.` });
    navigate(`/wiki/${slug}`, { state: { isNewPage: true } });
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
    refreshData,
    verificationChallenge,
    verificationError,
    whatsappAutoLaunchFailed,
    isLoadingSession,
    isStartingVerification,
    completeApprovedCreate,
    resetCreateVerification: () => {
      setVerificationChallenge(null);
      setVerificationError('');
      setWhatsappAutoLaunchFailed(false);
    },
  };
};
