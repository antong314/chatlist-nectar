import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWikiIndex } from '@/features/wiki/hooks';
import WikiHeader from './WikiHeader';
import WikiSidebar from './WikiSidebar';

interface WikiLayoutProps {
  children: React.ReactNode;
  title?: string;
  isEditing?: boolean;
}

const WikiLayout: React.FC<WikiLayoutProps> = ({
  children,
  title = 'San Mateo Love Wiki',
  isEditing = false,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();
  const {
    newPageDialogOpen,
    setNewPageDialogOpen,
    newPageTitle,
    setNewPageTitle,
    handleCreatePage,
    categories,
  } = useWikiIndex();
  const [selectedCategory, setSelectedCategory] = useState('Uncategorized');

  useEffect(() => {
    const handleResize = () => setSidebarOpen(window.innerWidth >= 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="directory-page min-h-screen pb-12">
      <WikiHeader
        title={title}
        onMenuToggle={() => setSidebarOpen((open) => !open)}
        isEditing={isEditing}
      />

      <div className="directory-container">
        <div className="flex items-start gap-5">
          <WikiSidebar
            isOpen={sidebarOpen}
            onToggle={() => setSidebarOpen((open) => !open)}
            onCreatePage={() => setNewPageDialogOpen(true)}
          />

          <main className="min-w-0 flex-1">
            {children}
          </main>
        </div>
      </div>

      <Dialog open={newPageDialogOpen} onOpenChange={setNewPageDialogOpen}>
        <DialogContent className="border-stone-200 bg-[var(--directory-paper)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-header text-2xl text-[var(--directory-ink)]">Create a new page</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="layout-page-title">Page title</Label>
              <Input
                id="layout-page-title"
                value={newPageTitle}
                onChange={(event) => setNewPageTitle(event.target.value)}
                placeholder="Enter page title"
                className="mt-1.5 rounded-xl border-stone-200 focus-visible:ring-[var(--directory-green)]"
              />
            </div>
            <div>
              <Label htmlFor="layout-page-category">Category</Label>
              <select
                id="layout-page-category"
                className="mt-1.5 flex h-10 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-[var(--directory-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--directory-green)]"
                value={selectedCategory}
                onChange={(event) => setSelectedCategory(event.target.value)}
              >
                {categories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setNewPageDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-xl bg-[var(--directory-green)] hover:bg-[var(--directory-green-hover)]"
              onClick={() => handleCreatePage({
                title: newPageTitle,
                category: selectedCategory || 'Uncategorized',
              })}
            >
              Create page
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WikiLayout;
