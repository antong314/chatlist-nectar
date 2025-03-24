import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigationType } from "react-router-dom";
import { useEffect } from "react";
import { initializeGA, trackPageView } from "@/utils/analytics";
import Index from "./pages/Index";
import { DirectoryPage } from "./features/directory/pages";
import { WikiIndexPage, WikiPage } from "./features/wiki/pages";
import NotFound from "./pages/NotFound";
import Elements from "./pages/Elements";

const queryClient = new QueryClient();

// Google Analytics Measurement ID
const GA_MEASUREMENT_ID = 'G-4EWWN4T29Y';

// Initialize Google Analytics
initializeGA(GA_MEASUREMENT_ID);

// Route change tracker component
const RouteTracker = () => {
  const location = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    // Only track page views on actual navigation (not on initial load which is handled separately)
    if (navigationType !== 'POP') {
      trackPageView(location.pathname);
    }
  }, [location, navigationType]);

  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <RouteTracker />
        <Routes>
          {/* Legacy route kept for now - will be removed once transition is complete */}
          <Route path="/" element={<Index />} />
          
          {/* Feature-based routes */}
          <Route path="/directory" element={<DirectoryPage />} />
          <Route path="/wiki" element={<WikiIndexPage />} />
          <Route path="/wiki/:pageId" element={<WikiPage />} />
          <Route path="/elements" element={<Elements />} />
          
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
