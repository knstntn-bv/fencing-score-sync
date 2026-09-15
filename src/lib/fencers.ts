import type { Database } from "@/types/database";
import type { Fencer } from "@/types/fencing";
import { requireSupabase } from "@/lib/supabase";

type FencerRow = Database["public"]["Tables"]["fencers"]["Row"];

const CACHE_PREFIX = "fencing-scorer:v1:fencers:";

export function mapFencer(row: FencerRow): Fencer {
  return {
    id: row.id,
    clubId: row.club_id,
    userId: row.user_id,
    role: row.role ?? null,
    name: row.name,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeFencerName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function uniqueNameErrorMessage(error: { code?: string; message?: string; details?: string }): string | null {
  if (error.code !== "23505") return null;
  const hay = `${error.message ?? ""} ${error.details ?? ""}`;
  if (hay.includes("fencers_user_unique")) {
    return "That account already belongs to a club.";
  }
  return "A fencer with this name already exists.";
}

function rpcErrorMessage(message: string): string | null {
  if (message.includes("linked fencer name can only be changed from the profile")) {
    return "This name is set in Account.";
  }
  if (message.includes("linked fencer must be unlinked to archive")) {
    return "Unlink this account to archive it.";
  }
  if (message.includes("must keep at least one owner")) {
    return "The club must keep at least one owner.";
  }
  if (message.includes("Already in a club")) {
    return "That account already belongs to a club.";
  }
  if (message.includes("Fencer is already linked")) {
    return "This fencer is already linked to an account.";
  }
  if (message.includes("Fencer is not linked")) {
    return "This fencer is not linked to an account.";
  }
  if (message.includes("Fencer is archived")) {
    return "Restore this fencer before linking an account.";
  }
  if (message.includes("Profile not found")) {
    return "No account has that ID.";
  }
  if (message.includes("Fencer not found")) {
    return "Fencer not found.";
  }
  if (message.includes("ID is required")) {
    return "Enter a valid ID.";
  }
  if (message.includes("Not a club member")) {
    return "You need to be in a club.";
  }
  return null;
}

export function fencerErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const unique = uniqueNameErrorMessage(
      error as { code?: string; message?: string; details?: string }
    );
    if (unique) return unique;
    if ("message" in error && typeof error.message === "string" && error.message) {
      return rpcErrorMessage(error.message) ?? error.message;
    }
  }
  if (error instanceof Error && error.message) {
    return rpcErrorMessage(error.message) ?? error.message;
  }
  return fallback;
}

export function isLinkedFencer(fencer: Pick<Fencer, "userId">): boolean {
  return Boolean(fencer.userId);
}

export function readFencerCache(clubId: string): Fencer[] | undefined {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${clubId}`);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Fencer[];
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function writeFencerCache(clubId: string, fencers: Fencer[]): void {
  try {
    const active = fencers.filter((fencer) => !fencer.archivedAt);
    localStorage.setItem(`${CACHE_PREFIX}${clubId}`, JSON.stringify(active));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export async function listFencers(clubId: string): Promise<Fencer[]> {
  const { data, error } = await requireSupabase()
    .from("fencers")
    .select("*")
    .eq("club_id", clubId)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapFencer);
}

export async function createFencer(clubId: string, name: string): Promise<Fencer> {
  const normalized = normalizeFencerName(name);
  if (!normalized) {
    throw new Error("Name is required.");
  }

  const { data, error } = await requireSupabase()
    .from("fencers")
    .insert({ club_id: clubId, name: normalized })
    .select("*")
    .single();

  if (error) throw error;
  return mapFencer(data);
}

export async function renameFencer(id: string, name: string): Promise<Fencer> {
  const normalized = normalizeFencerName(name);
  if (!normalized) {
    throw new Error("Name is required.");
  }

  const { data, error } = await requireSupabase()
    .from("fencers")
    .update({ name: normalized })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return mapFencer(data);
}

export async function linkFencerToProfile(fencerId: string, publicId: string): Promise<string> {
  const { data, error } = await requireSupabase().rpc("link_fencer_to_profile", {
    p_fencer_id: fencerId,
    p_public_id: publicId,
  });
  if (error) throw error;
  if (!data) throw new Error("Could not link this account.");
  return data;
}

export async function addLinkedFencer(publicId: string): Promise<string> {
  const { data, error } = await requireSupabase().rpc("add_linked_fencer", {
    p_public_id: publicId,
  });
  if (error) throw error;
  if (!data) throw new Error("Could not add this account.");
  return data;
}

export async function unlinkAndArchive(id: string): Promise<string> {
  const { data, error } = await requireSupabase().rpc("unlink_and_archive", {
    p_fencer_id: id,
  });
  if (error) throw error;
  if (!data) throw new Error("Could not unlink this account.");
  return data;
}

export async function archiveFencer(fencer: Pick<Fencer, "id" | "userId">): Promise<void> {
  if (fencer.userId) {
    await unlinkAndArchive(fencer.id);
    return;
  }

  const { error } = await requireSupabase()
    .from("fencers")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", fencer.id)
    .select("*")
    .single();

  if (error) throw error;
}

export async function restoreFencer(id: string): Promise<Fencer> {
  const { data, error } = await requireSupabase()
    .from("fencers")
    .update({ archived_at: null })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return mapFencer(data);
}
