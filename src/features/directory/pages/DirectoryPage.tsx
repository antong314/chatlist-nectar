import React from 'react';
import { Outlet } from 'react-router-dom';
import Index from '@/pages/Index'; // This will be replaced once we move the Index content

export function DirectoryPage() {
  // For now, this is a simple wrapper around the Index page
  // In the future, we could add more directory-specific features here
  return <Index />;
}
