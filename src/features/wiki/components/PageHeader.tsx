import React from 'react';
import { Button } from "@/components/ui/button";
import { Calendar, Edit, Trash2, Save } from "lucide-react";

interface PageHeaderProps {
  title: string;
  lastEdited?: string;
  updatedAt?: string;
  isEditing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSave?: () => void;
  onTitleChange?: (newTitle: string) => void;
}

const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  lastEdited,
  updatedAt,
  isEditing,
  onEdit,
  onDelete,
  onSave,
  onTitleChange,
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
    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 pb-4 border-b">
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
        <div className="flex items-center text-sm text-muted-foreground mt-2">
          <Calendar className="h-4 w-4 mr-1" />
          <span>Last edited: {displayDate}</span>
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
