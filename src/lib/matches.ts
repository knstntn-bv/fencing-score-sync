import type { Database } from "@/types/database";
import type { Match, MatchEndedBy } from "@/types/fencing";
import { requireSupabase } from "@/lib/supabase";

type MatchInsert = Database["public"]["Tables"]["matches"]["Insert"];
type MatchRow = Database["public"]["Tables"]["matches"]["Row"];

export type SaveMatchInput = {
  clubId: string;
  blueFencerId: string;
  redFencerId: string;
  blueName: string;
  redName: string;
  blueScore: number;
  redScore: number;
  timeLimitSec: number;
  pointsLimit: number;
  remainingSec: number;
  winnerFencerId: string | null;
  winnerName: string | null;
  endedBy: Exclude<MatchEndedBy, "time">;
  startedAt: string;
};

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
    timeLimitSec: row.time_limit_sec,
    pointsLimit: row.points_limit,
    remainingSec: row.remaining_sec,
    winnerFencerId: row.winner_fencer_id,
    winnerName: row.winner_name,
    endedBy: row.ended_by,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
  };
}

export async function saveMatch(input: SaveMatchInput): Promise<Match> {
  const payload: MatchInsert = {
    club_id: input.clubId,
    blue_fencer_id: input.blueFencerId,
    red_fencer_id: input.redFencerId,
    blue_name: input.blueName,
    red_name: input.redName,
    blue_score: input.blueScore,
    red_score: input.redScore,
    time_limit_sec: input.timeLimitSec,
    points_limit: input.pointsLimit,
    remaining_sec: input.remainingSec,
    winner_fencer_id: input.winnerFencerId,
    winner_name: input.winnerName,
    ended_by: input.endedBy,
    started_at: input.startedAt,
    finished_at: new Date().toISOString(),
  };

  const { data, error } = await requireSupabase()
    .from("matches")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;
  return mapMatch(data);
}
