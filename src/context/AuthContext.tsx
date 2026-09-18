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
  leaveOwnClub,
  loadOwnAccountWithRetry,
  renameOwnClub,
  saveOwnProfile,
  type ClubMemberRole,
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
  profilePublicId: string | null;
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
  saveProfile: (name: string) => Promise<{ error: string | null }>;
  createClub: (name: string) => Promise<{ error: string | null }>;
  renameClub: (name: string) => Promise<{ error: string | null }>;
  leaveClub: () => Promise<{ error: string | null }>;
  completeSetup: (name: string, clubName: string | null) => Promise<{ error: string | null }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessionLoading, setSessionLoading] = useState(isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [profilePublicId, setProfilePublicId] = useState<string | null>(null);
  const [clubId, setClubId] = useState<string | null>(null);
  const [clubName, setClubName] = useState<string | null>(null);
  const [clubRole, setClubRole] = useState<ClubMemberRole | null>(null);
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
    setProfilePublicId(null);
    setClubId(null);
    setClubName(null);
    setClubRole(null);
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
      setProfilePublicId(null);
      setClubId(null);
      setClubName(null);
      setClubRole(null);
      setAccountError(null);
      setAccountLoading(false);
      return;
    }

    let cancelled = false;
    setAccountLoading(true);
    setAccountError(null);

    loadOwnAccountWithRetry()
      .then((account) => {
        if (cancelled) return;
        setProfileName(account.profile?.name ?? null);
        setProfilePublicId(account.profile?.publicId ?? null);
        setClubId(account.clubId);
        setClubName(account.clubName);
        setClubRole(account.clubRole);
        setAccountLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setProfileName(null);
        setProfilePublicId(null);
        setClubId(null);
        setClubName(null);
        setClubRole(null);
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
    const emailRedirectTo = new URL(import.meta.env.BASE_URL || "/", window.location.origin).toString();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo },
    });
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

  const saveProfile = useCallback(async (name: string) => {
    try {
      const saved = await saveOwnProfile(name);
      setProfileName(saved);
      const profile = await getOwnProfile();
      setProfilePublicId(profile?.publicId ?? null);
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Could not save your name." };
    }
  }, []);

  const createClub = useCallback(async (name: string) => {
    try {
      const id = await createOwnClub(name);
      setClubId(id);
      setClubRole("owner");
      setClubName(name.trim().replace(/\s+/g, " "));
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Could not create the club." };
    }
  }, []);

  const renameClub = useCallback(async (name: string) => {
    try {
      const saved = await renameOwnClub(name);
      setClubName(saved);
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Could not rename the club." };
    }
  }, []);

  const leaveClub = useCallback(async () => {
    try {
      await leaveOwnClub();
      setClubId(null);
      setClubRole(null);
      setClubName(null);
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Could not leave the club." };
    }
  }, []);

  const completeSetup = useCallback(async (name: string, nextClubName: string | null) => {
    try {
      const saved = await saveOwnProfile(name);
      const nextClubId = nextClubName ? await createOwnClub(nextClubName) : null;
      setProfileName(saved);
      const profile = await getOwnProfile();
      setProfilePublicId(profile?.publicId ?? null);
      if (nextClubId && nextClubName) {
        setClubId(nextClubId);
        setClubRole("owner");
        setClubName(nextClubName.trim().replace(/\s+/g, " "));
      }
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
      profilePublicId,
      clubId,
      clubName,
      clubRole,
      accountError,
      retryAccount,
      guestBout,
      enterGuestBout,
      exitGuestBout,
      signIn,
      signUp,
      signOut,
      saveProfile,
      createClub,
      renameClub,
      leaveClub,
      completeSetup,
    }),
    [
      loading,
      session,
      profileName,
      profilePublicId,
      clubId,
      clubName,
      clubRole,
      accountError,
      retryAccount,
      guestBout,
      enterGuestBout,
      exitGuestBout,
      signIn,
      signUp,
      signOut,
      saveProfile,
      createClub,
      renameClub,
      leaveClub,
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
