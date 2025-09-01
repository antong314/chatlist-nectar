import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ChevronLeft, 
  ChevronRight, 
  FilePlus, 
  Newspaper, 
  Loader2, 
  ChevronDown, 
  ChevronUp,
  File
} from "lucide-react";
import { getCategoryIcon, getCategoryEmoji } from '@/features/wiki/utils/categoryIcons';
import { useWikiIndex } from '@/features/wiki/hooks';
import { WikiPage } from '@/features/wiki/types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface WikiSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  onCreatePage: () => void;
}

const WikiSidebar: React.FC<WikiSidebarProps> = ({ 
  isOpen, 
  onToggle,
  onCreatePage 
}) => {
  const location = useLocation();
  const currentPath = location.pathname;
  
  // Get real pages data from the hook
  const { pages, categories, isLoading } = useWikiIndex();
  
  return (
    <>
      {/* Mobile sidebar backdrop */}
      {isOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/30 z-40"
          onClick={onToggle}
        />
      )}
      
      {/* Sidebar */}
      <aside
        className={`
          fixed top-16 left-0 z-40 h-[calc(100vh-4rem)] bg-machuca-off-white border-r border-machuca-jungle-green/20
          transform transition-all duration-300 ease-in-out overflow-hidden
          ${isOpen ? 'translate-x-0 w-64' : '-translate-x-full w-0 md:w-0 opacity-0'}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-4 border-b border-machuca-jungle-green/20 flex items-center justify-between bg-machuca-sidebar-bg">
            <h2 className="font-header font-semibold text-lg flex items-center text-machuca-jungle-green">
              <span className="mr-2 text-xl">🌿</span>
              <Newspaper className="h-5 w-5 mr-2 text-machuca-earth-brown" />
              Pages
            </h2>

            <Button
              onClick={onCreatePage}
              size="sm"
              className="px-2 bg-machuca-jungle-green hover:bg-machuca-earth-brown text-white"
              title="Create new page"
            >
              <FilePlus className="h-5 w-5" />
            </Button>
          </div>
          
          {/* Pages list by category */}
          <ScrollArea className="flex-1">
            <nav className="px-2 py-4">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mb-2" />
                  <span className="text-sm">Loading pages...</span>
                </div>
              ) : pages.length > 0 ? (
                // Group pages by category
                <>
                  {console.log('Available wiki pages:', pages)}
                  {console.log('Dynamic categories from hook:', categories)}
                  
                  {/* First, find all unique categories that exist in the pages */}
                  {(() => {
                    const uniqueCategories = [...new Set(pages.map(page => page.category || 'Uncategorized'))];
                    console.log('Unique categories found in pages:', uniqueCategories);
                    return null;
                  })()}
                  
                  {/* Now map through categories from our dynamic list */}
                  {categories.map((category) => {
                    // Check predefined category
                    const categoryPages = pages.filter(page => {
                      // Make comparison case-insensitive
                      const pageCategory = page.category || 'Uncategorized';
                      const result = pageCategory.toLowerCase() === category.toLowerCase();
                      return result;
                    });
                    
                    // Process category pages
                    if (categoryPages.length === 0) return null;
                    
                    return (
                      <CategoryItem
                        key={category}
                        category={category}
                        pages={categoryPages}
                        currentPath={currentPath}
                      />
                    );
                  })}
                  
                  {/* Add any categories that weren't in our predefined list */}
                  {(() => {
                    const predefinedCategoriesLower = categories.map(c => c.toLowerCase());
                    const uncategorizedPages = pages.filter(page => {
                      const pageCategory = page.category || 'Uncategorized';
                      // Show pages with categories not in our predefined list
                      return !predefinedCategoriesLower.includes(pageCategory.toLowerCase());
                    });
                    
                    if (uncategorizedPages.length === 0) return null;
                    
                    console.log(`Found ${uncategorizedPages.length} pages with non-standard categories`);
                    
                    // Group these pages by their actual category
                    const otherCategories = [...new Set(uncategorizedPages.map(p => p.category || 'Other'))];
                    
                    return otherCategories.map(otherCategory => {
                      const pagesInCategory = uncategorizedPages.filter(
                        p => (p.category || 'Other').toLowerCase() === otherCategory.toLowerCase()
                      );
                      
                      return (
                        <CategoryItem
                          key={`other-${otherCategory}`}
                          category={otherCategory}
                          pages={pagesInCategory}
                          currentPath={currentPath}
                        />
                      );
                    });
                  })()}
                </>
              ) : (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No pages found. Create your first page with the + button above.
                </div>
              )}
            </nav>
          </ScrollArea>
          
          {/* Mobile close button */}
          <div className="md:hidden p-4 border-t">
            <Button 
              onClick={onToggle}
              variant="outline"
              className="w-full flex items-center justify-center"
              size="sm"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Close Sidebar
            </Button>
          </div>
        </div>
      </aside>
      
      {/* Toggle button for desktop - shown when sidebar is closed */}
      {!isOpen && (
        <button
          onClick={onToggle}
          className="hidden md:flex fixed top-24 left-0 z-40 bg-white border border-l-0 h-12 w-6 items-center justify-center rounded-r-md shadow-sm hover:bg-gray-50"
          aria-label="Open sidebar"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </>
  );
};

// Category item component with collapsible content
interface CategoryItemProps {
  category: string;
  pages: WikiPage[];
  currentPath: string;
}

const CategoryItem: React.FC<CategoryItemProps> = ({
  category,
  pages,
  currentPath
}) => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="mb-3">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="w-full flex items-center justify-between px-3 py-2 mb-2 text-left font-header font-medium machuca-sidebar-section hover:bg-machuca-sidebar-active transition-colors duration-200"
          >
            <span className="flex items-center text-machuca-jungle-green">
              <span className="mr-2 text-base">{getCategoryEmoji(category)}</span>
              {React.createElement(getCategoryIcon(category), { className: "h-4 w-4 mr-2 text-machuca-earth-brown" })}
              {category}
            </span>
            {isOpen ? (
              <ChevronUp className="h-4 w-4 text-machuca-earth-brown" />
            ) : (
              <ChevronDown className="h-4 w-4 text-machuca-earth-brown" />
            )}
          </Button>
        </CollapsibleTrigger>

        {/* Decorative divider with leaf motif */}
        <div className="machuca-divider mx-3 mb-2"></div>

        <CollapsibleContent>
          <div className="pl-2 border-l border-machuca-jungle-green/30 ml-4 mt-1">
            {pages.map((page) => (
              <Link
                key={page.id}
                to={`/wiki/${page.slug || page.id}`}
                className={`
                  flex items-center px-3 py-2 mb-1 rounded-md text-sm font-body transition-colors duration-200
                  ${currentPath === `/wiki/${page.slug || page.id}`
                    ? 'machuca-sidebar-active text-machuca-jungle-green font-medium border border-machuca-jungle-green/30'
                    : 'hover:bg-machuca-sidebar-bg text-machuca-neutral-gray hover:text-machuca-jungle-green'
                  }
                `}
              >
                <File className="h-3.5 w-3.5 mr-2 flex-shrink-0 text-machuca-earth-brown" />
                {page.title}
              </Link>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default WikiSidebar;
