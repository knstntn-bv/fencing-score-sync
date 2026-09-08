import type { Database } from "@/types/database";
import { requireSupabase } from "@/lib/supabase";

export type ClubMemberRole = Database["public"]["Enums"]["club_member_role"];

export type ClubMembership = {
  clubId: string;
  role: ClubMemberRole;
  createdAt: string;
};

type ClubMemberRow = Pick<
  Database["public"]["Tables"]["club_members"]["Row"],
  "club_id" | "role" | "created_at"
>;

function mapMembership(row: ClubMemberRow): ClubMembership {
  return {
    clubId: row.club_id,
    role: row.role,
    createdAt: row.created_at,
  };
}

export async function listOwnMemberships(): Promise<ClubMembership[]> {
  const { data, error } = await requireSupabase()
    .from("club_members")
    .select("club_id, role, created_at");

  if (error) throw error;
  return (data ?? []).map(mapMembership);
}

export function pickCurrentClubId(memberships: ClubMembership[]): string | null {
  if (memberships.length === 0) return null;
  const ranked = [...memberships].sort((a, b) => {
    const ownerDelta = Number(b.role === "owner") - Number(a.role === "owner");
    if (ownerDelta !== 0) return ownerDelta;
    return a.createdAt.localeCompare(b.createdAt);
  });
  return ranked[0].clubId;
}

export async function ensureOwnClub(): Promise<string> {
  const { data, error } = await requireSupabase().rpc("ensure_own_club");
  if (error) throw error;
  if (!data) throw new Error("Could not load data.");
  return data;
}

export async function resolveCurrentClubId(): Promise<string> {
  const existing = pickCurrentClubId(await listOwnMemberships());
  if (existing) return existing;
  return ensureOwnClub();
}
