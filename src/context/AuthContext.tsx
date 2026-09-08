import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { resolveCurrentClubId } from "@/lib/clubs";
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
  clubId: string | null;
  clubError: string | null;
  retryClub: () => void;
  guestBout: boolean;
  enterGuestBout: () => void;
  exitGuestBout: () => void;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessionLoading, setSessionLoading] = useState(isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [clubId, setClubId] = useState<string | null>(null);
  const [clubLoading, setClubLoading] = useState(false);
  const [clubError, setClubError] = useState<string | null>(null);
  const [clubEpoch, setClubEpoch] = useState(0);
  const [guestBout, setGuestBout] = useState(readGuestBout);
  const userIdRef = useRef<string | null>(null);

  const enterGuestBout = useCallback(() => {
    writeGuestBout(true);
    setGuestBout(true);
  }, []);

  const exitGuestBout = useCallback(() => {
    writeGuestBout(false);
    setGuestBout(false);
  }, []);

  const applySession = useCallback((nextSession: Session | null) => {
    const nextUserId = nextSession?.user?.id ?? null;
    setSession(nextSession);
    if (nextSession) {
      writeGuestBout(false);
      setGuestBout(false);
    }
    if (userIdRef.current === nextUserId) return;
    userIdRef.current = nextUserId;
    setClubId(null);
    setClubError(null);
    setClubLoading(Boolean(nextUserId));
  }, []);

  useEffect(() => {
    if (!supabase) {
      setSessionLoading(false);
      return;
    }

    let cancelled = false;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled) {
          applySession(data.session);
          setSessionLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setSessionLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [applySession]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setClubId(null);
      setClubError(null);
      setClubLoading(false);
      return;
    }

    let cancelled = false;
    setClubLoading(true);
    setClubError(null);

    resolveCurrentClubId()
      .then((id) => {
        if (cancelled) return;
        setClubId(id);
        setClubLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setClubId(null);
        setClubError("Could not load data.");
        setClubLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, clubEpoch]);

  const retryClub = useCallback(() => {
    setClubEpoch((epoch) => epoch + 1);
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

  const loading =
    sessionLoading || Boolean(session?.user && (clubLoading || (!clubId && !clubError)));

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isSupabaseConfigured,
      loading,
      session,
      user: session?.user ?? null,
      clubId,
      clubError,
      retryClub,
      guestBout,
      enterGuestBout,
      exitGuestBout,
      signIn,
      signUp,
      signOut,
    }),
    [
      loading,
      session,
      clubId,
      clubError,
      retryClub,
      guestBout,
      enterGuestBout,
      exitGuestBout,
      signIn,
      signUp,
      signOut,
    ]
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
