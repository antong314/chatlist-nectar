import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigationType } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { initializeGA, trackPageView } from "@/utils/analytics";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

const DirectoryPage = lazy(() =>
  import("./features/directory/pages/DirectoryPage").then(({ DirectoryPage }) => ({
    default: DirectoryPage,
  })),
);
const ProviderPage = lazy(() =>
  import("./features/directory/pages/ProviderPage").then(({ ProviderPage }) => ({
    default: ProviderPage,
  })),
);
const WikiIndexPage = lazy(() => import("./features/wiki/pages/WikiIndexPage"));
const WikiPage = lazy(() => import("./features/wiki/pages/WikiPage"));
const Elements = lazy(() => import("./pages/Elements"));

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

const RouteLoadingFallback = () => (
  <main
    className="flex min-h-screen items-center justify-center bg-[#f8f5ed] px-4 text-[#24573a]"
    aria-busy="true"
    aria-live="polite"
  >
    <p className="text-sm font-medium">Loading San Mateo Love…</p>
  </main>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <RouteTracker />
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            {/* Legacy route kept for now - will be removed once transition is complete */}
            <Route path="/" element={<Index />} />

            {/* Feature-based routes */}
            <Route path="/directory" element={<DirectoryPage />} />
            <Route path="/provider/:providerId" element={<ProviderPage />} />
            <Route path="/wiki" element={<WikiIndexPage />} />
            <Route path="/wiki/:pageId" element={<WikiPage />} />
            <Route path="/elements" element={<Elements />} />

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
