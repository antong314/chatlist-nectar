import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Book, Plus, ChevronUp, ChevronDown } from "lucide-react";
import { getCategoryIcon, getCategoryEmoji } from '@/features/wiki/utils/categoryIcons';
import { getCategoryStyle } from '@/styles/machuca-theme';
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

  // Get category-specific styling
  const categoryStyle = getCategoryStyle(page.category || 'default');

  // Determine background class based on category
  const getBackgroundClass = (category: string) => {
    const normalizedCategory = category?.toLowerCase() || 'default';
    switch (normalizedCategory) {
      case 'shopping':
        return 'machuca-card-shopping';
      case 'local know-how':
        return 'machuca-card-local-know-how';
      case 'nature':
        return 'machuca-card-nature';
      default:
        return 'bg-white';
    }
  };

  return (
    <Card
      className={`
        h-full cursor-pointer machuca-card flex flex-col
        ${getBackgroundClass(page.category || 'default')}
        hover:border-machuca-jungle-green
      `}
      onClick={onClick}
      style={{
        backgroundColor: categoryStyle.color,
      }}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-xl font-header font-semibold text-machuca-jungle-green flex items-center">
          <span className="mr-2 text-lg">{getCategoryEmoji(page.category || 'default')}</span>
          {page.title}
        </CardTitle>
        {excerpt && excerpt !== 'Click to view this wiki page' && (
          <p className="text-sm text-machuca-neutral-gray font-body mt-1 line-clamp-2">
            {excerpt}
          </p>
        )}
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-end">
        <div className="flex items-center text-xs text-machuca-neutral-gray font-body">
          <Book className="h-3 w-3 mr-1 text-machuca-earth-brown" />
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-header font-bold text-machuca-jungle-green">Machuca Wiki</h1>
            <p className="text-machuca-neutral-gray mt-1 font-body">
              Browse and edit pages for our community
            </p>
          </div>

          <Button
            onClick={handleCreatePageClick}
            className="flex items-center self-start sm:self-auto bg-machuca-jungle-green hover:bg-machuca-earth-brown transition-colors duration-200"
          >
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
    <div className="border border-machuca-jungle-green/20 rounded-xl overflow-hidden bg-white shadow-sm">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full flex items-center justify-between p-4 bg-machuca-sidebar-bg hover:bg-machuca-jungle-green/10 rounded-none border-b border-machuca-jungle-green/20 text-left h-auto transition-colors duration-200"
          >
            <span className="flex items-center text-lg font-header font-semibold text-machuca-jungle-green">
              <span className="mr-3 text-xl">{getCategoryEmoji(category)}</span>
              {React.createElement(getCategoryIcon(category), { className: "h-5 w-5 mr-2 text-machuca-earth-brown" })}
              {category}
            </span>
            {isOpen ? (
              <ChevronUp className="h-5 w-5 text-machuca-earth-brown" />
            ) : (
              <ChevronDown className="h-5 w-5 text-machuca-earth-brown" />
            )}
          </Button>
        </CollapsibleTrigger>

        {/* Decorative divider with leaf motif */}
        <div className="machuca-divider mx-4"></div>

        <CollapsibleContent>
          <div className="p-4 bg-gradient-to-b from-white to-machuca-off-white">
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
