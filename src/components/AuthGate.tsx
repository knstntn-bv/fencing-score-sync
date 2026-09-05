import type { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import Login from "@/pages/Login";

export default function AuthGate({ children }: { children: ReactNode }) {
  const { configured, loading, user, guestBout } = useAuth();

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

  return <>{children}</>;
}
