import React, { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import WikiLayout from '@/features/wiki/components/WikiLayout';
import PageHeader from '@/features/wiki/components/PageHeader';
import WikiEditor from '@/features/wiki/components/WikiEditor';
import DeletePageDialog from '@/features/wiki/components/DeletePageDialog';
import WikiHistoryDialog from '@/features/wiki/components/WikiHistoryDialog';
import { useWikiPage } from '@/features/wiki/hooks';
import { trackWikiPageView } from '@/utils/analytics';
import { trackEvent } from '@/utils/analytics';

const WikiPage: React.FC = () => {
  const { pageId = 'welcome' } = useParams();
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const prevEditingState = useRef<boolean>(false);
  const {
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
  } = useWikiPage(pageId);
  
  // Track page view when the page loads and data is available
  useEffect(() => {
    if (page && !isLoading && !error) {
      trackWikiPageView(
        pageId, 
        page.title || 'Untitled Wiki Page', 
        page.category || 'Uncategorized'
      );
    }
  }, [pageId, page, isLoading, error]);
  
  // Function to focus the editor
  const focusEditor = () => {
    console.log('Attempting to focus editor...');
    // Short delay to ensure the editor is in edit mode
    const focusTimer = setTimeout(() => {
      if (editorContainerRef.current) {
        // Find all contenteditable elements within our container
        const editableElements = editorContainerRef.current.querySelectorAll('[contenteditable=true]');
        
        if (editableElements && editableElements.length > 0) {
          // Focus the first contenteditable element
          const editableElement = editableElements[0] as HTMLElement;
          editableElement.focus();
          console.log('Editor focused from WikiPage component');
          
          // Try to place cursor at the end of the text
          try {
            const selection = window.getSelection();
            const range = document.createRange();
            
            // If the element has child nodes, select the last one
            if (editableElement.childNodes.length > 0) {
              const lastNode = editableElement.childNodes[editableElement.childNodes.length - 1];
              if (lastNode.nodeType === Node.TEXT_NODE) {
                // If it's a text node, place cursor at the end of the text
                range.setStart(lastNode, lastNode.textContent?.length || 0);
              } else {
                // Otherwise append to the element
                range.selectNodeContents(lastNode);
                range.collapse(false); // collapse to end
              }
            } else {
              // If no child nodes, just select the element itself
              range.selectNodeContents(editableElement);
              range.collapse(false); // collapse to end
            }
            
            selection?.removeAllRanges();
            selection?.addRange(range);
          } catch (selectionErr) {
            console.warn('Could not set cursor position, but element is focused:', selectionErr);
          }
        } else {
          console.warn('No contenteditable elements found');
        }
      } else {
        console.warn('Editor container ref is null');
      }
    }, 500); // Longer delay to ensure editor is fully rendered
    
    return focusTimer;
  };
  
  // Focus the editor when switching to edit mode
  useEffect(() => {
    // Only run this effect when isEditing transitions from false to true
    if (isEditing && !prevEditingState.current) {
      const timer = focusEditor();
      return () => clearTimeout(timer);
    }
    
    // Update the ref to track the current editing state
    prevEditingState.current = isEditing;
  }, [isEditing]);
  
  // Listen for the custom edit mode event
  useEffect(() => {
    const handleEditModeActivated = () => {
      console.log('Edit mode activated event received');
      if (isEditing) {
        const timer = focusEditor();
        return () => clearTimeout(timer);
      }
    };
    
    // Add event listener
    document.addEventListener('wiki-edit-mode-activated', handleEditModeActivated);
    
    // Clean up
    return () => {
      document.removeEventListener('wiki-edit-mode-activated', handleEditModeActivated);
    };
  }, [isEditing]);
  
  // Show loading state
  if (isLoading) {
    return (
      <WikiLayout title="Loading...">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite] mb-4"></div>
            <p className="text-muted-foreground">Loading wiki page...</p>
          </div>
        </div>
      </WikiLayout>
    );
  }
  
  // Show error state
  if (error || !page) {
    return (
      <WikiLayout title="Error">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center text-destructive">
            <h2 className="text-xl font-semibold mb-2">Page not found</h2>
            <p className="text-muted-foreground">{error || 'The requested wiki page could not be loaded'}</p>
          </div>
        </div>
      </WikiLayout>
    );
  }
  
  return (
    <WikiLayout 
      title={isEditing ? editedTitle : page.title} 
      isEditing={isEditing}
    >
      <div className="animate-fade-in">
        <PageHeader
          title={isEditing ? editedTitle : page.title}
          isEditing={isEditing}
          lastEdited={page.lastEdited || ''}
          updatedAt={page.updated_at}
          category={isEditing ? editedCategory : page.category}
          categories={categories}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onSave={handleSave}
          onTitleChange={setEditedTitle}
          onCategoryChange={setEditedCategory}
          onViewHistory={() => {
            toggleVersionHistory();
            trackEvent('Wiki', 'View History', page.title);
          }}
        />
        
        <div className="relative" ref={editorContainerRef}>
          <WikiEditor
            initialContent={page.content || ''}
            readOnly={!isEditing}
            onChange={(content) => {
              setEditedContent(content);
            }}
            className="min-h-[60vh] transition-all duration-300"
            autoFocus={isEditing}
          />
        </div>
      </div>
      
      <DeletePageDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
      />
      
      {/* Version history dialog */}
      <WikiHistoryDialog
        open={versionHistoryOpen}
        onClose={() => toggleVersionHistory()}
        versions={versions}
        selectedVersion={selectedVersion}
        onSelectVersion={selectVersion}
        onRestoreVersion={handleRestoreVersion}
        isLoading={loadingVersions}
        isRestoring={restoringVersion}
        pageTitle={page.title}
      />
    </WikiLayout>
  );
};

export default WikiPage;
