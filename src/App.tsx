import React, { useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import AuthGate from "@/components/AuthGate";
import { useMatchOutboxFlush } from "@/hooks/useMatchOutbox";
import { readSettings, writeSettings, type ClubSettings } from "@/lib/settings";
import Index from "./pages/Index";
import Settings from "./pages/Settings";
import Fencers from "./pages/Fencers";
import History from "./pages/History";
import Stats from "./pages/Stats";
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
                <Route path="/fencers" element={<Fencers />} />
                <Route path="/history" element={<History />} />
                <Route path="/stats" element={<Stats />} />
                <Route path="/settings" element={<Settings settings={settings} onSave={saveSettings} />} />
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
