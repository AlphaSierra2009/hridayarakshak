import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import React from "react";
import Index from "./pages/Index";
import Hospitals from "./pages/Hospitals";
import NotFound from "./pages/NotFound";
import AlertsPage from "./pages/Alerts";
import ArduinoConnect from "./components/ArduinoConnect";
import Header from "./components/Header";

const queryClient = new QueryClient();

const App = () => (
  <div className="dark bg-neutral-900 text-white min-h-screen transition-all duration-300">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          {/* Skip link for keyboard users */}
          <a className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 p-2 rounded bg-primary text-white" href="#main">Skip to content</a>
          <Header />
          <main id="main" role="main" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/arduino" element={<ArduinoConnect />} />
              <Route path="/hospitals" element={<Hospitals />} />
              <Route path="/alerts" element={/* lazy-load page */ <React.Suspense fallback={<div>Loading...</div>}><AlertsPage /></React.Suspense>} />

              {/* Add all custom routes ABOVE this line */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </div>
);

export default App;