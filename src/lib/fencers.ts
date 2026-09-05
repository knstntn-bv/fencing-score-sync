import type { Database } from "@/types/database";
import type { Fencer } from "@/types/fencing";
import { requireSupabase } from "@/lib/supabase";

type FencerRow = Database["public"]["Tables"]["fencers"]["Row"];

const CACHE_PREFIX = "fencing-scorer:v1:fencers:";

export function mapFencer(row: FencerRow): Fencer {
  return {
    id: row.id,
    clubId: row.club_id,
    name: row.name,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeFencerName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function uniqueNameErrorMessage(error: { code?: string; message?: string }): string | null {
  if (error.code === "23505") {
    return "A fencer with this name already exists.";
  }
  return null;
}

export function fencerErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const unique = uniqueNameErrorMessage(error as { code?: string; message?: string });
    if (unique) return unique;
    if ("message" in error && typeof error.message === "string" && error.message) {
      return error.message;
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
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

export async function listFencers(): Promise<Fencer[]> {
  const { data, error } = await requireSupabase()
    .from("fencers")
    .select("*")
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

export async function archiveFencer(id: string): Promise<Fencer> {
  const { data, error } = await requireSupabase()
    .from("fencers")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return mapFencer(data);
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
