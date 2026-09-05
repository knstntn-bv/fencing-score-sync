import type { Database } from "@/types/database";
import type { BoutResult, Match } from "@/types/fencing";
import { isDuplicateMatchError } from "@/lib/networkError";
import { requireSupabase } from "@/lib/supabase";

type MatchInsert = Database["public"]["Tables"]["matches"]["Insert"];
type MatchRow = Database["public"]["Tables"]["matches"]["Row"];

export type SaveMatchInput = {
  id: string;
  clubId: string;
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

export function newMatchId(): string {
  return crypto.randomUUID();
}

export function mapMatch(row: MatchRow): Match {
  return {
    id: row.id,
    clubId: row.club_id,
    blueFencerId: row.blue_fencer_id,
    redFencerId: row.red_fencer_id,
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
  };
}

export function listHistoryPeople(matches: Match[]): { id: string; name: string }[] {
  const names = new Map<string, string>();
  for (const match of matches) {
    if (!names.has(match.blueFencerId)) names.set(match.blueFencerId, match.blueName);
    if (!names.has(match.redFencerId)) names.set(match.redFencerId, match.redName);
  }
  return [...names.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export function matchOutcomeLabel(match: Match): string {
  if (match.blueResult === "draw") return "Draw";
  if (match.blueResult === "win") return `${match.blueName} won`;
  return `${match.redName} won`;
}

export async function listMatches(): Promise<Match[]> {
  const { data, error } = await requireSupabase()
    .from("matches")
    .select("*")
    .order("finished_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapMatch);
}

export async function saveMatch(input: SaveMatchInput): Promise<Match> {
  const payload: MatchInsert = {
    id: input.id,
    club_id: input.clubId,
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
  };

  const { data, error } = await requireSupabase()
    .from("matches")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    if (isDuplicateMatchError(error)) {
      return mapMatchFromInput(input);
    }
    throw error;
  }
  return mapMatch(data);
}

export function mapMatchFromInput(input: SaveMatchInput): Match {
  return {
    id: input.id,
    clubId: input.clubId,
    blueFencerId: input.blueFencerId,
    redFencerId: input.redFencerId,
    blueName: input.blueName,
    redName: input.redName,
    blueScore: input.blueScore,
    redScore: input.redScore,
    blueResult: input.blueResult,
    redResult: input.redResult,
    timeLimitSec: input.timeLimitSec,
    pointsLimit: input.pointsLimit,
    remainingSec: input.remainingSec,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    createdAt: input.finishedAt,
  };
}
