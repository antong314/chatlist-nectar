
import React, { useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";

interface ContactsHeaderProps {
  title: string;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onAddClick: () => void;
}

export function ContactsHeader({ 
  title, 
  searchQuery, 
  setSearchQuery, 
  onAddClick 
}: ContactsHeaderProps) {
  // Create a ref for the search input to auto-focus it
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Focus the search input when component mounts
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);
  return (
    <div className="flex flex-col space-y-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-gray-100 p-2 rounded-md">
            <svg 
              className="w-6 h-6 text-gray-700" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24" 
              xmlns="http://www.w3.org/2000/svg"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold">{title}</h1>
        </div>
        <Button onClick={onAddClick} className="add-entry-btn">
          <Plus className="w-4 h-4" />
          Add Entry
        </Button>
      </div>
      
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <Input
          type="text"
          placeholder="Search by name, category, or description..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 py-6 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all duration-200"
          autoFocus
          ref={inputRef}
        />
      </div>
    </div>
  );
}
