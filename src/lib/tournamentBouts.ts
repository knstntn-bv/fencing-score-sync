import type { Database } from "@/types/database";
import type { BoutResult } from "@/types/fencing";
import type { TournamentBout } from "@/types/tournament";
import { playoffOverrideBlock } from "@/lib/tournament/override";
import { requireSupabase } from "@/lib/supabase";

type BoutRow = Database["public"]["Tables"]["tournament_bouts"]["Row"];
type BoutInsert = Database["public"]["Tables"]["tournament_bouts"]["Insert"];

export function newTournamentBoutId(): string {
  return crypto.randomUUID();
}

export function mapTournamentBout(row: BoutRow): TournamentBout {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    clubId: row.club_id,
    stage: row.stage,
    groupNo: row.group_no,
    roundCode: row.round_code,
    sortOrder: row.sort_order,
    blueFencerId: row.blue_fencer_id,
    redFencerId: row.red_fencer_id,
    bluePlaceholder: row.blue_placeholder,
    redPlaceholder: row.red_placeholder,
    winnerNextId: row.winner_next_id,
    loserNextId: row.loser_next_id,
    blueName: row.blue_name,
    redName: row.red_name,
    blueScore: row.blue_score,
    redScore: row.red_score,
    blueResult: row.blue_result,
    redResult: row.red_result,
    timeLimitSec: row.time_limit_sec,
    pointsLimit: row.points_limit,
    remainingSec: row.remaining_sec,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    kothKingId: row.koth_king_id,
  };
}

export async function listTournamentBouts(tournamentId: string): Promise<TournamentBout[]> {
  const { data, error } = await requireSupabase()
    .from("tournament_bouts")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapTournamentBout);
}

export async function getTournamentBout(id: string): Promise<TournamentBout | null> {
  const { data, error } = await requireSupabase()
    .from("tournament_bouts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapTournamentBout(data) : null;
}

export async function deleteTournamentBouts(tournamentId: string): Promise<void> {
  const { error } = await requireSupabase()
    .from("tournament_bouts")
    .delete()
    .eq("tournament_id", tournamentId);
  if (error) throw error;
}

export async function insertTournamentBouts(rows: BoutInsert[]): Promise<TournamentBout[]> {
  if (rows.length === 0) return [];
  const { data, error } = await requireSupabase()
    .from("tournament_bouts")
    .insert(rows)
    .select("*");
  if (error) throw error;
  return (data ?? [])
    .map(mapTournamentBout)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function replaceRoundRobinBouts(input: {
  tournamentId: string;
  clubId: string;
  pairs: { blueId: string; redId: string }[];
}): Promise<TournamentBout[]> {
  await deleteTournamentBouts(input.tournamentId);
  const rows: BoutInsert[] = input.pairs.map((pair, index) => ({
    id: newTournamentBoutId(),
    tournament_id: input.tournamentId,
    club_id: input.clubId,
    stage: "rr",
    sort_order: index,
    blue_fencer_id: pair.blueId,
    red_fencer_id: pair.redId,
  }));
  return insertTournamentBouts(rows);
}

export type SaveTournamentBoutInput = {
  id: string;
  blueFencerId: string;
  redFencerId: string;
  blueName: string;
  redName: string;
  blueScore: number;
  redScore: number;
  blueResult: BoutResult;
  redResult: BoutResult;
  timeLimitSec: number;
  pointsLimit: number;
  remainingSec: number;
  startedAt: string;
  finishedAt: string;
};

export async function saveTournamentBout(input: SaveTournamentBoutInput): Promise<TournamentBout> {
  const { data, error } = await requireSupabase()
    .from("tournament_bouts")
    .update({
      blue_fencer_id: input.blueFencerId,
      red_fencer_id: input.redFencerId,
      blue_name: input.blueName,
      red_name: input.redName,
      blue_score: input.blueScore,
      red_score: input.redScore,
      blue_result: input.blueResult,
      red_result: input.redResult,
      time_limit_sec: input.timeLimitSec,
      points_limit: input.pointsLimit,
      remaining_sec: input.remainingSec,
      started_at: input.startedAt,
      finished_at: input.finishedAt,
    })
    .eq("id", input.id)
    .is("finished_at", null)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("This bout is already saved.");
  return mapTournamentBout(data);
}

export type OverrideTournamentBoutInput = {
  id: string;
  blueScore: number;
  redScore: number;
  blueResult: BoutResult;
  redResult: BoutResult;
};

/** Correct a saved score. Pair composition stays. */
export async function overrideTournamentBout(
  input: OverrideTournamentBoutInput
): Promise<TournamentBout> {
  const current = await getTournamentBout(input.id);
  if (!current) throw new Error("This bout was not found.");
  if (!current.finishedAt) throw new Error("This bout is not saved yet.");
  const blocked = playoffOverrideBlock(current.stage, input.blueScore, input.redScore);
  if (blocked) throw new Error(blocked);

  const { data, error } = await requireSupabase()
    .from("tournament_bouts")
    .update({
      blue_score: input.blueScore,
      red_score: input.redScore,
      blue_result: input.blueResult,
      red_result: input.redResult,
    })
    .eq("id", input.id)
    .not("finished_at", "is", null)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("This bout was not found.");
  return mapTournamentBout(data);
}
