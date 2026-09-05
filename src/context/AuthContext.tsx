import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

const GUEST_BOUT_KEY = "fencing-scorer:v1:guest-bout";

function readGuestBout(): boolean {
  try {
    return sessionStorage.getItem(GUEST_BOUT_KEY) === "1";
  } catch {
    return false;
  }
}

function writeGuestBout(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(GUEST_BOUT_KEY, "1");
    else sessionStorage.removeItem(GUEST_BOUT_KEY);
  } catch {
    // Ignore quota / private-mode failures.
  }
}

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  guestBout: boolean;
  enterGuestBout: () => void;
  exitGuestBout: () => void;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [guestBout, setGuestBout] = useState(readGuestBout);

  const enterGuestBout = useCallback(() => {
    writeGuestBout(true);
    setGuestBout(true);
  }, []);

  const exitGuestBout = useCallback(() => {
    writeGuestBout(false);
    setGuestBout(false);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled) {
          setSession(data.session);
          if (data.session) {
            writeGuestBout(false);
            setGuestBout(false);
          }
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        writeGuestBout(false);
        setGuestBout(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      return { error: "Supabase is not configured." };
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      return { error: "Supabase is not configured.", needsEmailConfirmation: false };
    }
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      return { error: error.message, needsEmailConfirmation: false };
    }
    const needsEmailConfirmation = Boolean(data.user) && !data.session;
    return { error: null, needsEmailConfirmation };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isSupabaseConfigured,
      loading,
      session,
      user: session?.user ?? null,
      guestBout,
      enterGuestBout,
      exitGuestBout,
      signIn,
      signUp,
      signOut,
    }),
    [loading, session, guestBout, enterGuestBout, exitGuestBout, signIn, signUp, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
