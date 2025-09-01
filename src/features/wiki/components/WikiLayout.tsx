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
}

const WikiLayout: React.FC<WikiLayoutProps> = ({ 
  children, 
  title = "Machuca Wiki", 
  isEditing = false
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();
  
  // Use the shared wiki index hook for new page functionality
  const { 
    newPageDialogOpen, 
    setNewPageDialogOpen, 
    newPageTitle, 
    setNewPageTitle, 
    handleCreatePage,
    categories              // Get categories list from the hook 
  } = useWikiIndex();
  
  // Local state for selected category in this dialog
  const [selectedCategory, setSelectedCategory] = useState<string>('Uncategorized');

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
      />
      
      <div className="flex flex-1">
        <WikiSidebar 
          isOpen={sidebarOpen} 
          onToggle={toggleSidebar} 
          onCreatePage={openNewPageDialog} 
        />
        
        <main
          className={`flex-1 transition-all duration-300 ease-in-out bg-gradient-to-b from-machuca-off-white via-machuca-off-white to-machuca-sidebar-bg ${
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
          <div className="py-4 space-y-4">
            <div>
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
            
            <div>
              <Label htmlFor="category" className="text-right">
                Category
              </Label>
              <select
                id="category"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mt-1"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                {categories.map(category => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewPageDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              // Create page with the selected category and pass the necessary data
              handleCreatePage({
                title: newPageTitle,
                category: selectedCategory || 'Uncategorized'
              });
            }}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WikiLayout;
