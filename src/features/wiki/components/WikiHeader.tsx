import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Menu, Save, Newspaper, BookOpen, FileText } from "lucide-react";

interface WikiHeaderProps {
  title: string;
  isEditing?: boolean;
  onMenuToggle: () => void;
  onSave?: () => void;
}

const WikiHeader: React.FC<WikiHeaderProps> = ({
  title,
  isEditing = false,
  onMenuToggle,
  onSave
}) => {
  return (
    <header className="h-16 border-b bg-white sticky top-0 z-50">
      <div className="h-full flex items-center justify-between px-4">
        <div className="flex items-center">
          <Button 
            variant="ghost" 
            size="icon" 
            className="mr-2 md:mr-4" 
            onClick={onMenuToggle}
            aria-label="Toggle menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          
          <div className="flex items-center space-x-2">
            <div className="bg-gray-100 p-2 rounded-md">
              <FileText className="h-5 w-5 text-gray-700" />
            </div>
            <div className="flex items-center space-x-4">
              <Link to="/wiki" className="text-2xl font-bold">Machuca Wiki</Link>
              <div className="h-6 w-px bg-gray-300"></div>
              <Link to="/" className="text-gray-500 hover:text-gray-800 transition-colors flex items-center">
                <BookOpen className="h-5 w-5 mr-1.5" />
                <span className="text-lg">MV Directory</span>
              </Link>
            </div>
          </div>
        </div>
        
        <div className="flex items-center">
          {isEditing && onSave && (
            <Button 
              onClick={onSave}
              className="flex items-center"
              size="sm"
            >
              <Save className="h-4 w-4 mr-1" />
              Save
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};

export default WikiHeader;
