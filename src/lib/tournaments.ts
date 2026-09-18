import { format } from "date-fns";
import type { Database } from "@/types/database";
import type { Tournament, TournamentFormat, TournamentParticipant, TournamentPointsScheme, TournamentStatus } from "@/types/tournament";
import { normalizeFencerName } from "@/lib/fencers";
import { requireSupabase } from "@/lib/supabase";

type TournamentRow = Database["public"]["Tables"]["tournaments"]["Row"];
type ParticipantRow = Database["public"]["Tables"]["tournament_participants"]["Row"];

export function mapTournament(row: TournamentRow): Tournament {
  return {
    id: row.id,
    clubId: row.club_id,
    name: row.name,
    status: row.status,
    format: row.format,
    pointsScheme: row.points_scheme,
    timeLimitSec: row.time_limit_sec,
    pointsLimit: row.points_limit,
    groupCount: row.group_count,
    advancersPerGroup: row.advancers_per_group,
    swissRounds: row.swiss_rounds,
    kothExitLimit: row.koth_exit_limit,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    liveAt: row.live_at,
    finishedAt: row.finished_at,
  };
}

export function newTournamentName(now = new Date()): string {
  return format(now, "d MMM yyyy");
}

export function tournamentErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const code = "code" in error && typeof error.code === "string" ? error.code : "";
    const message = "message" in error && typeof error.message === "string" ? error.message : "";
    if (code === "23505") return "Already checked in.";
    if (message.includes("ID is required")) return "Enter a valid ID.";
    if (message.includes("Not a club member")) return "You are not in this club.";
    if (message) return message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export async function listTournaments(clubId: string): Promise<Tournament[]> {
  const { data, error } = await requireSupabase()
    .from("tournaments")
    .select("*")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapTournament);
}

export async function createTournament(input: {
  clubId: string;
  name: string;
  timeLimitSec: number;
  pointsLimit: number;
}): Promise<Tournament> {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Name is required.");
  }

  const { data, error } = await requireSupabase()
    .from("tournaments")
    .insert({
      club_id: input.clubId,
      name,
      status: "setup",
      time_limit_sec: input.timeLimitSec,
      points_limit: input.pointsLimit,
      koth_exit_limit: 3,
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapTournament(data);
}

export async function deleteTournament(id: string): Promise<void> {
  const { error } = await requireSupabase().from("tournaments").delete().eq("id", id);
  if (error) throw error;
}

export function mapParticipant(row: ParticipantRow): TournamentParticipant {
  return {
    tournamentId: row.tournament_id,
    fencerId: row.fencer_id,
    clubId: row.club_id,
    name: row.name,
    clubName: row.club_name,
    isGuest: row.is_guest,
    groupNo: row.group_no,
  };
}

export function normalizeClubName(name: string): string | null {
  const next = name.trim().replace(/\s+/g, " ");
  return next ? next : null;
}

export async function getTournament(id: string): Promise<Tournament | null> {
  const { data, error } = await requireSupabase()
    .from("tournaments")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapTournament(data) : null;
}

export async function renameTournament(id: string, name: string): Promise<Tournament> {
  const normalized = name.trim().replace(/\s+/g, " ");
  if (!normalized) {
    throw new Error("Name is required.");
  }

  const { data, error } = await requireSupabase()
    .from("tournaments")
    .update({ name: normalized })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return mapTournament(data);
}

export async function listParticipants(tournamentId: string): Promise<TournamentParticipant[]> {
  const { data, error } = await requireSupabase()
    .from("tournament_participants")
    .select("*")
    .eq("tournament_id", tournamentId);

  if (error) throw error;
  return (data ?? []).map(mapParticipant);
}

export async function addParticipant(input: {
  tournamentId: string;
  fencerId: string;
  clubId: string;
  name: string;
  clubName?: string | null;
  isGuest?: boolean;
}): Promise<TournamentParticipant> {
  const name = normalizeFencerName(input.name);
  if (!name) {
    throw new Error("Name is required.");
  }
  const clubName =
    input.clubName == null ? null : normalizeClubName(input.clubName);

  const { data, error } = await requireSupabase()
    .from("tournament_participants")
    .insert({
      tournament_id: input.tournamentId,
      fencer_id: input.fencerId,
      club_id: input.clubId,
      name,
      club_name: clubName,
      is_guest: Boolean(input.isGuest),
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") throw new Error("Already checked in.");
    throw error;
  }
  return mapParticipant(data);
}

export async function removeParticipant(tournamentId: string, fencerId: string): Promise<void> {
  const { error } = await requireSupabase()
    .from("tournament_participants")
    .delete()
    .eq("tournament_id", tournamentId)
    .eq("fencer_id", fencerId);

  if (error) throw error;
}

export async function updateTournament(
  id: string,
  patch: {
    format?: TournamentFormat | null;
    pointsScheme?: TournamentPointsScheme | null;
    timeLimitSec?: number;
    pointsLimit?: number;
    groupCount?: number | null;
    advancersPerGroup?: number | null;
    swissRounds?: number | null;
    kothExitLimit?: number;
    status?: TournamentStatus;
    liveAt?: string | null;
    finishedAt?: string | null;
  }
): Promise<Tournament> {
  const payload: Database["public"]["Tables"]["tournaments"]["Update"] = {};
  if (patch.format !== undefined) payload.format = patch.format;
  if (patch.pointsScheme !== undefined) payload.points_scheme = patch.pointsScheme;
  if (patch.timeLimitSec !== undefined) payload.time_limit_sec = patch.timeLimitSec;
  if (patch.pointsLimit !== undefined) payload.points_limit = patch.pointsLimit;
  if (patch.groupCount !== undefined) payload.group_count = patch.groupCount;
  if (patch.advancersPerGroup !== undefined) payload.advancers_per_group = patch.advancersPerGroup;
  if (patch.swissRounds !== undefined) payload.swiss_rounds = patch.swissRounds;
  if (patch.kothExitLimit !== undefined) payload.koth_exit_limit = patch.kothExitLimit;
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.liveAt !== undefined) payload.live_at = patch.liveAt;
  if (patch.finishedAt !== undefined) payload.finished_at = patch.finishedAt;

  const { data, error } = await requireSupabase()
    .from("tournaments")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return mapTournament(data);
}

export async function clearParticipantGroups(tournamentId: string): Promise<void> {
  const { error } = await requireSupabase()
    .from("tournament_participants")
    .update({ group_no: null })
    .eq("tournament_id", tournamentId);
  if (error) throw error;
}

export async function setParticipantGroups(
  tournamentId: string,
  assignments: { fencerId: string; groupNo: number }[]
): Promise<void> {
  for (const row of assignments) {
    const { error } = await requireSupabase()
      .from("tournament_participants")
      .update({ group_no: row.groupNo })
      .eq("tournament_id", tournamentId)
      .eq("fencer_id", row.fencerId);
    if (error) throw error;
  }
}

export type CheckInLookup = {
  userId: string;
  name: string;
  clubName: string | null;
  fencerId: string | null;
  inHostClub: boolean;
};

export function normalizePublicId(value: string): string | null {
  const normalized = value.trim();
  if (!normalized || !/^[0-9]+$/.test(normalized)) return null;
  return normalized;
}

export async function lookupCheckinByPublicId(
  publicId: string,
  clubId: string
): Promise<CheckInLookup | null> {
  const normalized = normalizePublicId(publicId);
  if (!normalized) throw new Error("Enter a valid ID.");

  const { data, error } = await requireSupabase().rpc("lookup_checkin_by_public_id", {
    p_public_id: normalized,
    p_club_id: clubId,
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    userId: row.user_id,
    name: row.name,
    clubName: row.club_name,
    fencerId: row.fencer_id,
    inHostClub: Boolean(row.in_host_club),
  };
}
