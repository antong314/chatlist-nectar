import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Book, Plus } from "lucide-react";
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
      <CardContent className="flex-1 flex flex-col">
        <p className="text-sm text-muted-foreground mb-4 flex-1">{excerpt}</p>
        <div className="flex items-center text-xs text-muted-foreground">
          <Book className="h-3 w-3 mr-1" />
          <span>Last edited: {lastEdited}</span>
        </div>
      </CardContent>
    </Card>
  );
};

const WikiIndexPage: React.FC = () => {
  const {
    pages,
    isLoading,
    error,
    newPageDialogOpen,
    setNewPageDialogOpen,
    newPageTitle,
    setNewPageTitle,
    handlePageClick,
    handleCreatePageClick,
    handleCreatePage
  } = useWikiIndex();
  
  return (
    <WikiLayout title="Machuca Wiki">
      <div className="animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Machuca Wiki</h1>
            <p className="text-muted-foreground mt-1">
              Browse and edit pages for our community
            </p>
          </div>
          
          <Button onClick={handleCreatePageClick} className="flex items-center">
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pages.map((page) => (
              <PageTile 
                key={page.id} 
                page={page} 
                onClick={() => handlePageClick(page.slug)} 
              />
            ))}
          </div>
        )}
      </div>
      
      <Dialog open={newPageDialogOpen} onOpenChange={setNewPageDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Page</DialogTitle>
          </DialogHeader>
          <div className="py-4">
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewPageDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreatePage}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WikiLayout>
  );
};

export default WikiIndexPage;
