import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useWikiIndex } from '@/features/wiki/hooks';
import { Toaster } from "@/components/ui/toaster";
import WikiSidebar from './WikiSidebar';
import WikiHeader from './WikiHeader';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

interface WikiLayoutProps {
  children: React.ReactNode;
  title?: string;
  isEditing?: boolean;
  onSave?: () => void;
}

const WikiLayout: React.FC<WikiLayoutProps> = ({ 
  children, 
  title = "Machuca Wiki", 
  isEditing = false,
  onSave
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();
  
  // Use the shared wiki index hook for new page functionality
  const { 
    newPageDialogOpen, 
    setNewPageDialogOpen, 
    newPageTitle, 
    setNewPageTitle, 
    handleCreatePage 
  } = useWikiIndex();

  // Close sidebar on mobile by default
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close sidebar on route change on mobile
  useEffect(() => {
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, [location.pathname]);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const openNewPageDialog = () => {
    setNewPageDialogOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <WikiHeader 
        title={title} 
        onMenuToggle={toggleSidebar} 
        isEditing={isEditing}
        onSave={onSave}
      />
      
      <div className="flex flex-1">
        <WikiSidebar 
          isOpen={sidebarOpen} 
          onToggle={toggleSidebar} 
          onCreatePage={openNewPageDialog} 
        />
        
        <main 
          className={`flex-1 transition-all duration-300 ease-in-out ${
            sidebarOpen ? 'md:ml-64' : 'ml-0'
          }`}
        >
          <div className="px-4 py-6 md:px-8 md:py-8 max-w-5xl mx-auto">
            {children}
          </div>
        </main>
      </div>

      <Dialog open={newPageDialogOpen} onOpenChange={setNewPageDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Page</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="title" className="text-right">
              Page Title
            </Label>
            <Input
              id="title"
              value={newPageTitle}
              onChange={(e) => setNewPageTitle(e.target.value)}
              placeholder="Enter page title"
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewPageDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreatePage}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WikiLayout;
