import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronLeft, ChevronRight, FilePlus, Newspaper, Loader2 } from "lucide-react";
import { useWikiIndex } from '@/features/wiki/hooks';

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
  const { pages, isLoading } = useWikiIndex();
  
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
          fixed top-16 left-0 z-40 h-[calc(100vh-4rem)] bg-white border-r
          transform transition-all duration-300 ease-in-out overflow-hidden
          ${isOpen ? 'translate-x-0 w-64' : '-translate-x-full w-0 md:w-0 opacity-0'}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-lg flex items-center">
              <Newspaper className="h-5 w-5 mr-2" />
              Pages
            </h2>
            
            <Button
              onClick={onCreatePage}
              size="sm"
              className="px-2"
              variant="ghost"
              title="Create new page"
            >
              <FilePlus className="h-5 w-5" />
            </Button>
          </div>
          
          {/* Pages list */}
          <ScrollArea className="flex-1">
            <nav className="px-2 py-4">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mb-2" />
                  <span className="text-sm">Loading pages...</span>
                </div>
              ) : pages.length > 0 ? (
                pages.map((page) => (
                  <Link 
                    key={page.id}
                    to={`/wiki/${page.slug || page.id}`}
                    className={`
                      block px-3 py-2 mb-1 rounded-md 
                      ${currentPath === `/wiki/${page.slug || page.id}` 
                        ? 'bg-primary/10 text-primary font-medium' 
                        : 'hover:bg-gray-100'
                      }
                    `}
                  >
                    {page.title}
                  </Link>
                ))
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

export default WikiSidebar;
