import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster as Sonner } from "@/components/ui/sonner";
import ErrorBoundary from "@/components/ErrorBoundary";

import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Login from "./pages/Login";

import Index from "./pages/Index";
import Hospitals from "./pages/Hospitals";
import NotFound from "./pages/NotFound";
import AlertsPage from "./pages/Alerts";
import ArduinoConnect from "./components/ArduinoConnect";
import Header from "./components/Header";
const queryClient = new QueryClient();

const AppRoutes = () => {
  const { user } = useAuth();

  if (!user) {
    return <Login />;
  }

  return (
    <>
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 p-2 rounded bg-primary text-white"
        href="#main"
      >
        Skip to content
      </a>
      <Header />
      <main
        id="main"
        role="main"
        className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6"
      >
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/arduino" element={<ArduinoConnect />} />
          <Route path="/hospitals" element={<Hospitals />} />
          <Route
            path="/alerts"
            element={
              <React.Suspense fallback={<div>Loading...</div>}>
                <AlertsPage />
              </React.Suspense>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </>
  );
};

const App = () => (
  <div className="dark bg-neutral-900 text-white min-h-screen transition-all duration-300">
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <ErrorBoundary>
            <TooltipProvider>
              <Sonner />
              <AppRoutes />
            </TooltipProvider>
          </ErrorBoundary>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </div>
);

export default App;