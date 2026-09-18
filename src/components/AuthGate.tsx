import { useEffect, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { HELP_PAGE_FILE, isHelpRoute } from "@/lib/helpPage";
import Login from "@/pages/Login";
import Onboarding from "@/pages/Onboarding";

export default function AuthGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const helpRoute = isHelpRoute(location.pathname);
  const { configured, loading, user, personName, accountError, retryAccount, signOut, guestBout } =
    useAuth();

  useEffect(() => {
    if (helpRoute) {
      window.location.replace(HELP_PAGE_FILE);
    }
  }, [helpRoute]);

  if (helpRoute) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">
        Opening guide…
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (configured && !user && !guestBout) {
    return <Login />;
  }

  if (configured && user && accountError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="space-y-4 text-center">
          <p className="text-muted-foreground">{accountError}</p>
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={() => retryAccount()}>
              Retry
            </Button>
            <Button variant="outline" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (configured && user && !personName) {
    return <Onboarding />;
  }

  return <>{children}</>;
}
