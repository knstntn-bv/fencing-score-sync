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
import {
  createOwnClub,
  getOwnProfile,
  resolveCurrentClubId,
  saveOwnProfile,
} from "@/lib/clubs";
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
  profileName: string | null;
  clubId: string | null;
  accountError: string | null;
  retryAccount: () => void;
  guestBout: boolean;
  enterGuestBout: () => void;
  exitGuestBout: () => void;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  createClub: (name: string) => Promise<{ error: string | null }>;
  completeSetup: (name: string, clubName: string | null) => Promise<{ error: string | null }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessionLoading, setSessionLoading] = useState(isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [clubId, setClubId] = useState<string | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountEpoch, setAccountEpoch] = useState(0);
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
    setProfileName(null);
    setClubId(null);
    setAccountError(null);
    setAccountLoading(Boolean(nextUserId));
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
      setProfileName(null);
      setClubId(null);
      setAccountError(null);
      setAccountLoading(false);
      return;
    }

    let cancelled = false;
    setAccountLoading(true);
    setAccountError(null);

    Promise.all([getOwnProfile(), resolveCurrentClubId()])
      .then(([profile, currentClubId]) => {
        if (cancelled) return;
        setProfileName(profile?.name ?? null);
        setClubId(currentClubId);
        setAccountLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setProfileName(null);
        setClubId(null);
        setAccountError("Could not load data.");
        setAccountLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, accountEpoch]);

  const retryAccount = useCallback(() => {
    setAccountEpoch((epoch) => epoch + 1);
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

  const createClub = useCallback(async (name: string) => {
    try {
      const id = await createOwnClub(name);
      setClubId(id);
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Could not create the club." };
    }
  }, []);

  const completeSetup = useCallback(async (name: string, clubName: string | null) => {
    try {
      const saved = await saveOwnProfile(name);
      const nextClubId = clubName ? await createOwnClub(clubName) : null;
      setProfileName(saved);
      if (nextClubId) setClubId(nextClubId);
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Could not finish setup." };
    }
  }, []);

  const loading = sessionLoading || Boolean(session?.user && accountLoading);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isSupabaseConfigured,
      loading,
      session,
      user: session?.user ?? null,
      profileName,
      clubId,
      accountError,
      retryAccount,
      guestBout,
      enterGuestBout,
      exitGuestBout,
      signIn,
      signUp,
      signOut,
      createClub,
      completeSetup,
    }),
    [
      loading,
      session,
      profileName,
      clubId,
      accountError,
      retryAccount,
      guestBout,
      enterGuestBout,
      exitGuestBout,
      signIn,
      signUp,
      signOut,
      createClub,
      completeSetup,
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
