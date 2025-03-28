import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Book, Plus, ChevronUp, ChevronDown } from "lucide-react";
import { getCategoryIcon } from '@/features/wiki/utils/categoryIcons';
import { trackPageView, trackEvent } from '@/utils/analytics';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import WikiLayout from '@/features/wiki/components/WikiLayout';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useWikiIndex } from '@/features/wiki/hooks';
import { WikiPage } from '@/features/wiki/types';

const PageTile: React.FC<{ 
  page: WikiPage, 
  onClick: () => void 
}> = ({ page, onClick }) => {
  // Extract an excerpt from the content if not provided directly
  const excerpt = page.excerpt || 'Click to view this wiki page';
  
  // Format the date to be more readable
  const formatDate = (dateString: string) => {
    if (!dateString) return 'Not available';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };
  
  // Use updated_at if available, fallback to lastEdited for backward compatibility
  const lastEdited = page.updated_at ? formatDate(page.updated_at) : (page.lastEdited || 'Not available');
  
  return (
    <Card 
      className="h-full cursor-pointer hover:shadow-md transition-all duration-200 hover:border-primary/30 flex flex-col"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-xl font-medium">{page.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-end">
        <div className="flex items-center text-xs text-muted-foreground">
          <Book className="h-3 w-3 mr-1" />
          <span>Last edited: {lastEdited}</span>
        </div>
      </CardContent>
    </Card>
  );
};

const WikiIndexPage: React.FC = () => {
  // Track page view when component mounts
  useEffect(() => {
    trackPageView('/wiki', 'Wiki Index');
  }, []);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('cat-4'); // Default to Uncategorized
  
  const {
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
    handleCreatePage: createPage
  } = useWikiIndex();
  
  return (
    <WikiLayout title="Machuca Wiki">
      <div className="animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Machuca Wiki</h1>
            <p className="text-muted-foreground mt-1">
              Browse and edit pages for our community
            </p>
          </div>
          
          <Button onClick={handleCreatePageClick} className="flex items-center self-start sm:self-auto">
            <Plus className="h-4 w-4 mr-1" />
            New Page
          </Button>
        </div>
        
        {isLoading ? (
          <div className="flex items-center justify-center min-h-[40vh]">
            <div className="text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite] mb-4"></div>
              <p className="text-muted-foreground">Loading wiki pages...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center min-h-[40vh]">
            <div className="text-center text-destructive">
              <h2 className="text-xl font-semibold mb-2">Error</h2>
              <p className="text-muted-foreground">{error}</p>
            </div>
          </div>
        ) : pages.length === 0 ? (
          <div className="border rounded-md p-8 text-center">
            <h3 className="font-medium text-lg mb-2">No wiki pages found</h3>
            <p className="text-muted-foreground mb-4">Create your first wiki page to get started</p>
            <Button onClick={handleCreatePageClick} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Create a page
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Standard categories from our predefined list */}
            {categories.map((category) => {
              // Check category for filtering
              const categoryPages = pages.filter(page => {
                // Make comparison case-insensitive
                const pageCategory = page.category || 'Uncategorized';
                return pageCategory.toLowerCase() === category.toLowerCase();
              });
              
              if (categoryPages.length === 0) return null;
              
              return (
                <CategorySection 
                  key={category}
                  category={category}
                  pages={categoryPages}
                  onPageClick={handlePageClick}
                />
              );
            })}
            
            {/* Custom categories not in our predefined list */}
            {(() => {
              const predefinedCategoriesLower = categories.map(c => c.toLowerCase());
              const pagesWithCustomCategories = pages.filter(page => {
                const pageCategory = page.category || 'Uncategorized';
                return !predefinedCategoriesLower.includes(pageCategory.toLowerCase());
              });
              
              if (pagesWithCustomCategories.length === 0) return null;
              
              // Group by their actual category values
              const customCategories = [...new Set(pagesWithCustomCategories.map(p => p.category || 'Other'))];
              
              return customCategories.map(customCategory => {
                const pagesInCategory = pagesWithCustomCategories.filter(
                  p => (p.category || 'Other').toLowerCase() === customCategory.toLowerCase()
                );
                
                return (
                  <CategorySection 
                    key={`custom-${customCategory}`}
                    category={customCategory}
                    pages={pagesInCategory}
                    onPageClick={handlePageClick}
                  />
                );
              });
            })()
            }
          </div>
        )}
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
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
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
              // Create page with the selected category
              // Use the selected category directly
              createPage({
                title: newPageTitle,
                category: selectedCategoryId || 'Uncategorized'
              });
            }}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WikiLayout>
  );
};

// Category Section Component
interface CategorySectionProps {
  category: string;
  pages: WikiPage[];
  onPageClick: (slug: string) => void;
}

const CategorySection: React.FC<CategorySectionProps> = ({ 
  category, 
  pages, 
  onPageClick 
}) => {
  const [isOpen, setIsOpen] = useState(true);
  
  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button 
            variant="ghost" 
            className="w-full flex items-center justify-between p-4 bg-muted/30 hover:bg-muted/50 rounded-none border-b text-left h-auto"
          >
            <span className="flex items-center text-lg font-medium">
              {React.createElement(getCategoryIcon(category), { className: "h-5 w-5 mr-2" })}
              {category}
            </span>
            {isOpen ? (
              <ChevronUp className="h-5 w-5" />
            ) : (
              <ChevronDown className="h-5 w-5" />
            )}
          </Button>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pages.map((page) => (
                <PageTile 
                  key={page.id} 
                  page={page} 
                  onClick={() => onPageClick(page.slug)} 
                />
              ))}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default WikiIndexPage;
