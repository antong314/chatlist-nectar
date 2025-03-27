import React, { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { WikiPageVersion } from '@/features/wiki/types';
import { History, ArrowLeft, RotateCcw, AlertTriangle } from 'lucide-react';
import { formatDistance } from 'date-fns';
import { useToast } from '@/components/ui/use-toast';
import WikiEditor from '@/features/wiki/components/WikiEditor';

interface WikiHistoryDialogProps {
  open: boolean;
  onClose: () => void;
  versions: WikiPageVersion[];
  selectedVersion: WikiPageVersion | null;
  onSelectVersion: (version: WikiPageVersion) => void;
  onRestoreVersion: (version: number) => Promise<void>;
  isLoading: boolean;
  isRestoring: boolean;
  pageTitle: string;
}

const WikiHistoryDialog: React.FC<WikiHistoryDialogProps> = ({
  open,
  onClose,
  versions,
  selectedVersion,
  onSelectVersion,
  onRestoreVersion,
  isLoading,
  isRestoring,
  pageTitle
}) => {
  const [confirmingRestore, setConfirmingRestore] = useState(false);
  const [versionToRestore, setVersionToRestore] = useState<number | null>(null);
  const { toast } = useToast();
  
  const handleSelectVersion = (version: WikiPageVersion) => {
    onSelectVersion(version);
  };
  
  const initiateRestore = (version: number) => {
    setVersionToRestore(version);
    setConfirmingRestore(true);
  };
  
  const confirmRestore = async () => {
    if (versionToRestore !== null) {
      try {
        await onRestoreVersion(versionToRestore);
        setConfirmingRestore(false);
        setVersionToRestore(null);
      } catch (error) {
        console.error('Error restoring version:', error);
        toast({
          title: 'Error',
          description: 'Failed to restore version. Please try again.',
          variant: 'destructive'
        });
      }
    }
  };
  
  const cancelRestore = () => {
    setConfirmingRestore(false);
    setVersionToRestore(null);
  };
  
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return `${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`;
    } catch (e) {
      return dateString;
    }
  };
  
  const formatTimeAgo = (dateString: string) => {
    try {
      return formatDistance(new Date(dateString), new Date(), { addSuffix: true });
    } catch (e) {
      return '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      {confirmingRestore ? (
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Confirm Restore
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to restore to version {versionToRestore}? 
              This will create a new version based on the content from version {versionToRestore}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex justify-between sm:justify-between">
            <Button variant="outline" onClick={cancelRestore} disabled={isRestoring}>
              Cancel
            </Button>
            <Button 
              onClick={confirmRestore} 
              disabled={isRestoring}
              className="gap-2"
            >
              {isRestoring ? <Spinner size="sm" /> : <RotateCcw className="h-4 w-4" />}
              Restore Version {versionToRestore}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : (
        <DialogContent className="sm:max-w-3xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Version History for {pageTitle}
            </DialogTitle>
            <DialogDescription>
              Browse previous versions of this page and restore if needed.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-1 gap-4 mt-4 overflow-hidden">
            {/* Versions list */}
            <div className="w-1/3 border rounded-md overflow-hidden">
              <div className="bg-muted p-2 font-medium text-sm">Versions</div>
              <ScrollArea className="h-[calc(100%-2.5rem)]">
                {isLoading ? (
                  <div className="flex justify-center items-center h-40">
                    <Spinner />
                  </div>
                ) : versions.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No version history available
                  </div>
                ) : (
                  <div className="p-1">
                    {versions.map((version) => (
                      <div 
                        key={`${version.id}-${version.version}`}
                        className={`p-3 mb-1 rounded-md cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors ${
                          selectedVersion?.version === version.version ? 'bg-accent text-accent-foreground' : ''
                        }`}
                        onClick={() => handleSelectVersion(version)}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-medium">Version {version.version}</span>
                          {version.is_current && (
                            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {formatTimeAgo(version.updated_at)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
            
            {/* Version details */}
            <div className="w-2/3 border rounded-md overflow-hidden flex flex-col">
              <div className="bg-muted p-2 font-medium text-sm">
                {selectedVersion ? `Version ${selectedVersion.version} Details` : 'Select a Version'}
              </div>
              <ScrollArea className="flex-1">
                {!selectedVersion ? (
                  <div className="p-4 text-center text-muted-foreground h-full flex items-center justify-center">
                    Select a version to view details
                  </div>
                ) : (
                  <div className="p-4">
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold">{selectedVersion.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        Last edited on {formatDate(selectedVersion.updated_at)}
                      </p>
                      {selectedVersion.category && (
                        <p className="text-sm text-muted-foreground">
                          Category: {selectedVersion.category}
                        </p>
                      )}
                    </div>
                    
                    <Separator className="my-4" />
                    
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <h4 className="text-sm font-medium mb-2">Content Preview:</h4>
                      <div className="bg-muted/50 rounded-md overflow-hidden">
                        {/* Use the same WikiEditor component in read-only mode */}
                        <WikiEditor
                          initialContent={selectedVersion.content}
                          readOnly={true}
                          onChange={() => {}}
                          className="max-h-[300px] overflow-auto"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
          
          <DialogFooter className="flex justify-between items-center">
            <Button variant="outline" onClick={onClose} className="gap-1">
              <ArrowLeft className="h-4 w-4" />
              Back to Page
            </Button>
            {selectedVersion && !selectedVersion.is_current && (
              <Button 
                onClick={() => initiateRestore(selectedVersion.version)}
                className="gap-2 ml-2"
              >
                <RotateCcw className="h-4 w-4" />
                Restore to This Version
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
};

export default WikiHistoryDialog;
