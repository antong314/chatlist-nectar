import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Menu, Newspaper, BookOpen, FileText, ChevronDown, ChevronUp } from "lucide-react";
import WikiSearch from "./WikiSearch";

interface WikiHeaderProps {
  title: string;
  isEditing?: boolean;
  onMenuToggle: () => void;
}

const WikiHeader: React.FC<WikiHeaderProps> = ({
  title,
  isEditing = false,
  onMenuToggle
}) => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  return (
    <header className="border-b bg-white sticky top-0 z-50">
      {/* Main header row */}
      <div className="flex items-center justify-between px-4 h-16">
        <div className="flex items-center">
          <Button 
            variant="ghost" 
            size="icon" 
            className="mr-2 md:mr-4" 
            onClick={onMenuToggle}
            aria-label="Toggle menu"
          >
            <Menu className="h-4 w-4 md:h-5 md:w-5" />
          </Button>
          
          <div className="flex items-center">
            <div className="bg-gray-100 p-1.5 md:p-2 rounded-md mr-2">
              <FileText className="h-4 w-4 md:h-5 md:w-5 text-gray-700" />
            </div>
            <div className="flex items-center">
              <Link to="/wiki" className="text-xl md:text-2xl font-bold">Machuca Wiki</Link>
              
              {/* Desktop navigation links - visible on all screen sizes */}
              <div className="hidden md:flex items-center ml-4">
                <div className="h-6 w-px bg-gray-300"></div>
                <Link to="/" className="ml-4 text-gray-500 hover:text-gray-800 transition-colors flex items-center">
                  <BookOpen className="h-5 w-5 mr-1" />
                  <span className="text-lg">MV Directory</span>
                </Link>
                <div className="ml-4 h-6 w-px bg-gray-300"></div>
                <Link to="/elements" className="ml-4 text-gray-500 hover:text-gray-800 transition-colors flex items-center">
                  <Newspaper className="h-5 w-5 mr-1" />
                  <span className="text-lg">Elements</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
        
        {/* Desktop search only */}
        <div className="hidden md:block">
          <WikiSearch variant="inline" />
        </div>
        
        {/* Mobile navigation toggle and search */}
        <div className="flex md:hidden items-center gap-2">
          <WikiSearch variant="icon" />
          <Button 
            variant="ghost" 
            size="sm" 
            className="flex items-center" 
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            aria-label="Toggle navigation"
          >
            <span className="sr-only">Navigation</span>
            {mobileNavOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
      
      {/* Mobile navigation dropdown */}
      {mobileNavOpen && (
        <div className="md:hidden border-t px-4 py-2 bg-gray-50">
          <div className="flex flex-col space-y-2">
            <Link 
              to="/" 
              className="text-gray-500 hover:text-gray-800 transition-colors flex items-center p-2"
              onClick={() => setMobileNavOpen(false)}
            >
              <BookOpen className="h-4 w-4 mr-2" />
              <span>MV Directory</span>
            </Link>
            <Link 
              to="/elements" 
              className="text-gray-500 hover:text-gray-800 transition-colors flex items-center p-2"
              onClick={() => setMobileNavOpen(false)}
            >
              <Newspaper className="h-4 w-4 mr-2" />
              <span>Elements</span>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
};

export default WikiHeader;
