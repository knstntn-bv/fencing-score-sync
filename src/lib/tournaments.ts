import { format } from "date-fns";
import type { Database } from "@/types/database";
import type { Tournament, TournamentParticipant } from "@/types/tournament";
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
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string" && error.message) {
    return error.message;
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
    groupNo: row.group_no,
  };
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
}): Promise<TournamentParticipant> {
  const { data, error } = await requireSupabase()
    .from("tournament_participants")
    .insert({
      tournament_id: input.tournamentId,
      fencer_id: input.fencerId,
      club_id: input.clubId,
    })
    .select("*")
    .single();

  if (error) throw error;
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
