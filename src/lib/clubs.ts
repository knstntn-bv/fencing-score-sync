import type { Database } from "@/types/database";
import { requireSupabase } from "@/lib/supabase";

export type ClubMemberRole = Database["public"]["Enums"]["club_member_role"];

export type ClubMembership = {
  clubId: string;
  role: ClubMemberRole;
  createdAt: string;
};

export type Profile = {
  name: string;
  publicId: string;
};

type ClubFencerRow = Pick<
  Database["public"]["Tables"]["fencers"]["Row"],
  "club_id" | "role" | "created_at"
>;

function mapMembership(row: ClubFencerRow): ClubMembership | null {
  if (!row.role || !row.club_id) return null;
  return {
    clubId: row.club_id,
    role: row.role,
    createdAt: row.created_at,
  };
}

function mapRpcError(error: unknown, fallback: string): Error {
  if (error && typeof error === "object") {
    const code = "code" in error && typeof error.code === "string" ? error.code : "";
    const message = "message" in error && typeof error.message === "string" ? error.message : "";
    if (code === "23505") return new Error("A fencer with this name already exists.");
    if (message.includes("Already in a club")) return new Error("You already belong to a club.");
    if (message.includes("Club name is required")) return new Error("Enter a club name.");
    if (message.includes("Name is required")) return new Error("Enter your name.");
    if (message.includes("Profile name is required")) return new Error("Enter your name first.");
    if (message.includes("Only the owner can rename the club")) {
      return new Error("Only the club owner can change the club name.");
    }
    if (message) return new Error(message);
  }
  if (error instanceof Error && error.message) return error;
  return new Error(fallback);
}

export async function listOwnMemberships(): Promise<ClubMembership[]> {
  const supabase = requireSupabase();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = sessionData.session?.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from("fencers")
    .select("club_id, role, created_at")
    .eq("user_id", userId)
    .is("archived_at", null)
    .not("club_id", "is", null)
    .maybeSingle();

  if (error) throw error;
  const membership = data ? mapMembership(data) : null;
  return membership ? [membership] : [];
}

export function pickCurrentMembership(memberships: ClubMembership[]): ClubMembership | null {
  if (memberships.length === 0) return null;
  const ranked = [...memberships].sort((a, b) => {
    const ownerDelta = Number(b.role === "owner") - Number(a.role === "owner");
    if (ownerDelta !== 0) return ownerDelta;
    return a.createdAt.localeCompare(b.createdAt);
  });
  return ranked[0];
}

export function pickCurrentClubId(memberships: ClubMembership[]): string | null {
  return pickCurrentMembership(memberships)?.clubId ?? null;
}

export async function resolveCurrentClubId(): Promise<string | null> {
  return pickCurrentClubId(await listOwnMemberships());
}

export async function getOwnProfile(): Promise<Profile | null> {
  const { data, error } = await requireSupabase()
    .from("profiles")
    .select("name, public_id")
    .maybeSingle();
  if (error) throw error;
  return data ? { name: data.name, publicId: data.public_id } : null;
}

export async function saveOwnProfile(name: string): Promise<string> {
  const { data, error } = await requireSupabase().rpc("save_own_profile", { p_name: name });
  if (error) throw mapRpcError(error, "Could not save your name.");
  if (!data) throw new Error("Could not save your name.");
  return data;
}

export async function createOwnClub(name: string): Promise<string> {
  const { data, error } = await requireSupabase().rpc("create_own_club", { p_name: name });
  if (error) throw mapRpcError(error, "Could not create the club.");
  if (!data) throw new Error("Could not create the club.");
  return data;
}

export async function renameOwnClub(name: string): Promise<string> {
  const { data, error } = await requireSupabase().rpc("rename_own_club", { p_name: name });
  if (error) throw mapRpcError(error, "Could not rename the club.");
  if (!data) throw new Error("Could not rename the club.");
  return data;
}

export async function getClubName(clubId: string): Promise<string> {
  const { data, error } = await requireSupabase()
    .from("clubs")
    .select("name")
    .eq("id", clubId)
    .single();

  if (error) throw error;
  return data.name;
}

export type OwnAccount = {
  profile: Profile | null;
  clubId: string | null;
  clubRole: ClubMemberRole | null;
  clubName: string | null;
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function loadOwnAccount(): Promise<OwnAccount> {
  await requireSupabase().auth.getSession();
  const [profile, memberships] = await Promise.all([getOwnProfile(), listOwnMemberships()]);
  const membership = pickCurrentMembership(memberships);
  const clubName = membership ? await getClubName(membership.clubId) : null;
  return {
    profile,
    clubId: membership?.clubId ?? null,
    clubRole: membership?.role ?? null,
    clubName,
  };
}

export async function loadOwnAccountWithRetry(attempts = 4): Promise<OwnAccount> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await loadOwnAccount();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) await wait(200 * (i + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not load data.");
}
