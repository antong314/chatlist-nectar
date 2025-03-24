import React from 'react';
import { Button } from "@/components/ui/button";
import { Calendar, Edit, Trash2, Save } from "lucide-react";
import { getCategoryIcon } from '@/features/wiki/utils/categoryIcons';
import { Label } from "@/components/ui/label";
// Categories now come from props instead of a static constant

interface PageHeaderProps {
  title: string;
  lastEdited?: string;
  updatedAt?: string;
  category?: string;
  categories?: string[];
  isEditing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSave?: () => void;
  onTitleChange?: (newTitle: string) => void;
  onCategoryChange?: (category: string) => void;
}

const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  lastEdited,
  updatedAt,
  category,
  categories = ['Uncategorized'], // Default to just Uncategorized if no categories provided
  isEditing,
  onEdit,
  onDelete,
  onSave,
  onTitleChange,
  onCategoryChange,
}) => {
  // Format the date to be more readable
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Not available';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };
  
  // Use updatedAt if available, fallback to lastEdited for backward compatibility
  const displayDate = updatedAt ? formatDate(updatedAt) : (lastEdited || 'Not available');
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4">
      <div>
        {isEditing && onTitleChange ? (
          <input 
            type="text" 
            value={title} 
            onChange={(e) => onTitleChange(e.target.value)}
            className="text-3xl font-bold text-gray-900 border-b border-gray-300 focus:border-primary focus:outline-none bg-transparent w-full mb-1 px-1"
          />
        ) : (
          <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
        )}
        <div className="mt-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 text-sm text-muted-foreground">
            {/* Last edited info */}
            <div className="flex items-center">
              <Calendar className="h-4 w-4 mr-1" />
              <span>Last edited: {displayDate}</span>
            </div>
            
            {/* Divider for visual separation on desktop */}
            <div className="hidden sm:block h-4 w-px bg-gray-200"></div>
            
            {/* Category display or edit */}
            <div className="flex items-center mt-2 sm:mt-0">
              {React.createElement(getCategoryIcon(category || 'Uncategorized'), { className: "h-4 w-4 mr-1" })}
              {isEditing && onCategoryChange ? (
                <div className="flex items-center space-x-2">
                  <Label htmlFor="category" className="text-xs font-medium">Category:</Label>
                  <select
                    id="category"
                    className="text-sm rounded-md border border-input bg-background px-2 py-1 text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={category || 'Uncategorized'}
                    onChange={(e) => onCategoryChange && onCategoryChange(e.target.value)}
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <span>Category: {category || 'Uncategorized'}</span>
              )}
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex items-center mt-4 sm:mt-0 space-x-2">
        {isEditing && onSave ? (
          <Button 
            variant="outline" 
            size="sm" 
            className="flex items-center" 
            onClick={onSave}
          >
            <Save className="h-4 w-4 mr-1" />
            Save
          </Button>
        ) : (
          <>
            <Button 
              variant="outline" 
              size="sm" 
              className="flex items-center" 
              onClick={onEdit}
            >
              <Edit className="h-4 w-4 mr-1" />
              Edit
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              className="flex items-center text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default PageHeader;
