import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import Login from "@/pages/Login";

export default function AuthGate({ children }: { children: ReactNode }) {
  const { configured, loading, user, clubError, retryClub, signOut, guestBout } = useAuth();

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

  if (configured && user && clubError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="space-y-4 text-center">
          <p className="text-muted-foreground">{clubError}</p>
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={() => retryClub()}>
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

  return <>{children}</>;
}
