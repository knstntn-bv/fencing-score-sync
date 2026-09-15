import React, { useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import AuthGate from "@/components/AuthGate";
import ClubRoute from "@/components/ClubRoute";
import { useMatchOutboxFlush } from "@/hooks/useMatchOutbox";
import { readSettings, writeSettings, type ClubSettings } from "@/lib/settings";
import Index from "./pages/Index";
import Settings from "./pages/Settings";
import Account from "./pages/Account";
import Fencers from "./pages/Fencers";
import FencerStats from "./pages/FencerStats";
import History from "./pages/History";
import Tournaments from "./pages/Tournaments";
import Tournament from "./pages/Tournament";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function OutboxFlush() {
  useMatchOutboxFlush();
  return null;
}

const App = () => {
  const [settings, setSettings] = useState<ClubSettings>(readSettings);

  const saveSettings = (next: ClubSettings) => {
    setSettings(writeSettings(next));
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <OutboxFlush />
          <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthGate>
              <Routes>
                <Route path="/" element={<Index settings={settings} />} />
                <Route
                  path="/fencers"
                  element={
                    <ClubRoute>
                      <Fencers />
                    </ClubRoute>
                  }
                />
                <Route
                  path="/fencers/:id/stats"
                  element={
                    <ClubRoute>
                      <FencerStats />
                    </ClubRoute>
                  }
                />
                <Route
                  path="/tournaments"
                  element={
                    <ClubRoute>
                      <Tournaments />
                    </ClubRoute>
                  }
                />
                <Route
                  path="/tournaments/:id"
                  element={
                    <ClubRoute>
                      <Tournament />
                    </ClubRoute>
                  }
                />
                <Route
                  path="/history"
                  element={
                    <ClubRoute>
                      <History />
                    </ClubRoute>
                  }
                />
                <Route
                  path="/stats"
                  element={
                    <ClubRoute>
                      <Navigate to="/history?tab=stats" replace />
                    </ClubRoute>
                  }
                />
                <Route path="/settings" element={<Settings settings={settings} onSave={saveSettings} />} />
                <Route path="/settings/account" element={<Account />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AuthGate>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
