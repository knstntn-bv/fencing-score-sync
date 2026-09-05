import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function ClubRoute({ children }: { children: ReactNode }) {
  const { user, guestBout } = useAuth();
  if (guestBout && !user) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
