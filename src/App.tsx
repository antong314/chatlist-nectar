import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import { DirectoryPage } from "./features/directory/pages";
import { WikiIndexPage, WikiPage } from "./features/wiki/pages";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Legacy route kept for now - will be removed once transition is complete */}
          <Route path="/" element={<Index />} />
          
          {/* Feature-based routes */}
          <Route path="/directory" element={<DirectoryPage />} />
          <Route path="/wiki" element={<WikiIndexPage />} />
          <Route path="/wiki/:pageId" element={<WikiPage />} />
          
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
