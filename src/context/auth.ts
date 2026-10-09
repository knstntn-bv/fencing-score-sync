import { createContext, useContext } from "react";
import type { Session, User } from "@supabase/supabase-js";
import type { ClubMemberRole } from "@/lib/clubs";

export type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  personName: string | null;
  personPublicId: string | null;
  clubId: string | null;
  clubName: string | null;
  clubRole: ClubMemberRole | null;
  accountError: string | null;
  retryAccount: () => void;
  guestBout: boolean;
  enterGuestBout: () => void;
  exitGuestBout: () => void;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  saveName: (name: string) => Promise<{ error: string | null }>;
  createClub: (name: string) => Promise<{ error: string | null }>;
  renameClub: (name: string) => Promise<{ error: string | null }>;
  leaveClub: () => Promise<{ error: string | null }>;
  completeSetup: (name: string, clubName: string | null) => Promise<{ error: string | null }>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
