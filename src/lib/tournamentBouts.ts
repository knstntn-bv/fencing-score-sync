import type { Database } from "@/types/database";
import type { BoutResult } from "@/types/fencing";
import type { TournamentBout } from "@/types/tournament";
import {
  drawGroupsPlayoff,
  groupPlayoffFencerPatches,
  nextCutoffPlace,
  parsePlaceholder,
  placeholderCode,
  type GroupsPlayoffDraw,
} from "@/lib/tournament/groups";
import { playoffOverrideBlock } from "@/lib/tournament/override";
import { resolveKothKing } from "@/lib/tournament/kingOfHill";
import { drawPlayoff, propagatePlayoffSlots, type PlayoffDraft } from "@/lib/tournament/playoff";
import { computeStandings } from "@/lib/tournament/standings";
import {
  drawSwissRound,
  expectedSwissRoundBoutCount,
  lastSwissPair,
  nextSwissRoundNumber,
  swissNeedsNextRound,
  swissRoundCount,
  swissRoundsToDrop,
} from "@/lib/tournament/swiss";
import { requireSupabase } from "@/lib/supabase";
import { getTournament, listParticipants, setParticipantGroups, updateTournament } from "@/lib/tournaments";

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

function playoffInsertRow(
  input: { tournamentId: string; clubId: string },
  draft: PlayoffDraft
): BoutInsert {
  return {
    id: draft.id,
    tournament_id: input.tournamentId,
    club_id: input.clubId,
    stage: "playoff",
    round_code: draft.roundCode,
    sort_order: draft.sortOrder,
    blue_fencer_id: draft.blueFencerId,
    red_fencer_id: draft.redFencerId,
    blue_placeholder: draft.bluePlaceholder,
    red_placeholder: draft.redPlaceholder,
  };
}

export async function replacePlayoffBouts(input: {
  tournamentId: string;
  clubId: string;
  fencerIds: string[];
}): Promise<TournamentBout[]> {
  await deleteTournamentBouts(input.tournamentId);
  const drafts = drawPlayoff(input.fencerIds);
  if (drafts.length === 0) throw new Error("Playoff needs 2, 4, 8, 16, or 32 fencers.");
  await insertTournamentBouts(drafts.map((draft) => playoffInsertRow(input, draft)));
  await wirePlayoffNextIds(drafts);
  return listTournamentBouts(input.tournamentId);
}

async function wirePlayoffNextIds(drafts: PlayoffDraft[]): Promise<void> {
  for (const draft of drafts) {
    if (!draft.winnerNextId && !draft.loserNextId) continue;
    const { error } = await requireSupabase()
      .from("tournament_bouts")
      .update({
        winner_next_id: draft.winnerNextId,
        loser_next_id: draft.loserNextId,
      })
      .eq("id", draft.id);
    if (error) throw error;
  }
}

export async function replaceGroupsPlayoffBouts(input: {
  tournamentId: string;
  clubId: string;
  fencerIds: string[];
  groupCount: number;
  advancers: number;
  draw?: GroupsPlayoffDraw;
}): Promise<TournamentBout[]> {
  const drawn =
    input.draw ?? drawGroupsPlayoff(input.fencerIds, input.groupCount, input.advancers);
  if (drawn.playoff.length === 0 || drawn.assignments.length === 0) {
    throw new Error("Groups + playoff needs a valid group count and advancers.");
  }

  await deleteTournamentBouts(input.tournamentId);
  await setParticipantGroups(input.tournamentId, drawn.assignments);

  const groupRows: BoutInsert[] = drawn.groupPairs.map((pair, index) => ({
    id: newTournamentBoutId(),
    tournament_id: input.tournamentId,
    club_id: input.clubId,
    stage: "group",
    group_no: pair.groupNo,
    sort_order: index,
    blue_fencer_id: pair.blueId,
    red_fencer_id: pair.redId,
  }));
  await insertTournamentBouts(groupRows);
  await insertTournamentBouts(drawn.playoff.map((draft) => playoffInsertRow(input, draft)));
  await wirePlayoffNextIds(drawn.playoff);
  return listTournamentBouts(input.tournamentId);
}

export async function deleteSwissRounds(tournamentId: string, rounds: number[]): Promise<void> {
  if (rounds.length === 0) return;
  const { error } = await requireSupabase()
    .from("tournament_bouts")
    .delete()
    .eq("tournament_id", tournamentId)
    .eq("stage", "swiss")
    .in("round_code", rounds.map(String));
  if (error) throw error;
}

export async function insertSwissRound(input: {
  tournamentId: string;
  clubId: string;
  round: number;
  pairs: { blueId: string; redId: string }[];
  sortOffset: number;
}): Promise<TournamentBout[]> {
  const rows: BoutInsert[] = input.pairs.map((pair, index) => ({
    id: newTournamentBoutId(),
    tournament_id: input.tournamentId,
    club_id: input.clubId,
    stage: "swiss",
    round_code: String(input.round),
    sort_order: input.sortOffset + index,
    blue_fencer_id: pair.blueId,
    red_fencer_id: pair.redId,
  }));
  return insertTournamentBouts(rows);
}

export async function replaceSwissBouts(input: {
  tournamentId: string;
  clubId: string;
  fencerIds: string[];
}): Promise<TournamentBout[]> {
  const n = input.fencerIds.length;
  if (n < 2) throw new Error("Check in at least two fencers.");
  const rounds = swissRoundCount(n);
  await deleteTournamentBouts(input.tournamentId);
  await updateTournament(input.tournamentId, { swissRounds: rounds });
  const people = input.fencerIds.map((id) => ({ id, name: id }));
  const drawn = drawSwissRound(input.fencerIds, 1, [], people, "half");
  if (drawn.pairs.length !== expectedSwissRoundBoutCount(n)) {
    throw new Error("Could not draw the first Swiss round.");
  }
  await insertSwissRound({
    tournamentId: input.tournamentId,
    clubId: input.clubId,
    round: 1,
    pairs: drawn.pairs,
    sortOffset: 0,
  });
  return listTournamentBouts(input.tournamentId);
}

export async function syncSwiss(
  tournamentId: string,
  options?: { rebuildUnplayed?: boolean }
): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (tournament?.format !== "swiss" || !tournament.swissRounds || !tournament.pointsScheme) {
    return false;
  }
  const participants = await listParticipants(tournamentId);
  const names = await fencerNamesById(participants.map((row) => row.fencerId));
  const people = participants.map((row) => ({
    id: row.fencerId,
    name: names.get(row.fencerId) ?? row.fencerId,
  }));
  const ids = participants.map((row) => row.fencerId);
  let bouts = await listTournamentBouts(tournamentId);
  let changed = false;

  // Override rebuilds unplayed later rounds. A live sync must not: that redraws them forever.
  if (options?.rebuildUnplayed) {
    const drop = swissRoundsToDrop(bouts);
    if (drop.length > 0) {
      await deleteSwissRounds(tournamentId, drop);
      changed = true;
      bouts = await listTournamentBouts(tournamentId);
    }
  }

  while (swissNeedsNextRound(bouts, ids.length, tournament.swissRounds)) {
    const nextRound = nextSwissRoundNumber(bouts);
    const sortOffset = bouts.reduce((max, bout) => Math.max(max, bout.sortOrder + 1), 0);
    const drawn = drawSwissRound(
      ids,
      nextRound,
      bouts.filter((bout) => bout.stage === "swiss"),
      people,
      tournament.pointsScheme,
      Math.random,
      lastSwissPair(bouts)
    );
    if (drawn.pairs.length === 0) break;
    await insertSwissRound({
      tournamentId,
      clubId: tournament.clubId,
      round: nextRound,
      pairs: drawn.pairs,
      sortOffset,
    });
    changed = true;
    bouts = await listTournamentBouts(tournamentId);
  }

  return changed;
}

export async function applyPlayoffFencerUpdates(
  updates: { id: string; blueFencerId: string | null; redFencerId: string | null }[]
): Promise<void> {
  for (const update of updates) {
    const { error } = await requireSupabase()
      .from("tournament_bouts")
      .update({
        blue_fencer_id: update.blueFencerId,
        red_fencer_id: update.redFencerId,
      })
      .eq("id", update.id)
      .is("finished_at", null);
    if (error) throw error;
  }
}

async function fencerNamesById(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data, error } = await requireSupabase().from("fencers").select("id, name").in("id", unique);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id, row.name]));
}

export async function syncGroupsAndPlayoff(tournamentId: string): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  let bouts = await listTournamentBouts(tournamentId);
  let changed = false;

  if (
    tournament?.format === "groups_playoff" &&
    tournament.pointsScheme &&
    tournament.groupCount &&
    tournament.advancersPerGroup
  ) {
    const participants = await listParticipants(tournamentId);
    const names = await fencerNamesById(participants.map((row) => row.fencerId));
    const people = participants.map((row) => ({
      id: row.fencerId,
      name: names.get(row.fencerId) ?? row.fencerId,
      groupNo: row.groupNo,
    }));
    const { patches } = groupPlayoffFencerPatches(
      bouts,
      people,
      tournament.pointsScheme,
      tournament.groupCount,
      tournament.advancersPerGroup
    );
    if (patches.length > 0) {
      await applyPlayoffFencerUpdates(patches);
      changed = true;
      bouts = await listTournamentBouts(tournamentId);
    }
  }

  const playoffPatches = propagatePlayoffSlots(bouts);
  if (playoffPatches.length > 0) {
    await applyPlayoffFencerUpdates(playoffPatches);
    changed = true;
  }
  return changed;
}

export async function syncPlayoffTree(tournamentId: string): Promise<void> {
  await syncGroupsAndPlayoff(tournamentId);
}

export async function resolveGroupCutoff(input: {
  tournamentId: string;
  groupNo: number;
  fencerId: string;
}): Promise<void> {
  const tournament = await getTournament(input.tournamentId);
  if (!tournament || tournament.format !== "groups_playoff") {
    throw new Error("This event is not groups + playoff.");
  }
  if (!tournament.pointsScheme || !tournament.advancersPerGroup) {
    throw new Error("Choose a points scheme first.");
  }

  const bouts = await listTournamentBouts(input.tournamentId);
  const participants = await listParticipants(input.tournamentId);
  const members = participants.filter((row) => row.groupNo === input.groupNo);
  if (!members.some((row) => row.fencerId === input.fencerId)) {
    throw new Error("That fencer is not in this group.");
  }

  const names = await fencerNamesById(members.map((row) => row.fencerId));
  const standings = computeStandings(
    members.map((row) => ({ id: row.fencerId, name: names.get(row.fencerId) ?? row.fencerId })),
    bouts.filter((bout) => bout.stage === "group" && bout.groupNo === input.groupNo),
    tournament.pointsScheme
  );
  const place = nextCutoffPlace(bouts, input.groupNo, standings, tournament.advancersPerGroup);
  if (place == null) throw new Error("There is no cutoff to resolve.");

  const code = placeholderCode(input.groupNo, place);
  const slot = bouts.find((bout) => {
    if (bout.stage !== "playoff" || bout.finishedAt) return false;
    return bout.bluePlaceholder === code || bout.redPlaceholder === code;
  });
  if (!slot) throw new Error("Could not find that playoff slot.");

  const parsedBlue = parsePlaceholder(slot.bluePlaceholder);
  const onBlue = parsedBlue?.groupNo === input.groupNo && parsedBlue.place === place;
  const { error } = await requireSupabase()
    .from("tournament_bouts")
    .update(
      onBlue ? { blue_fencer_id: input.fencerId } : { red_fencer_id: input.fencerId }
    )
    .eq("id", slot.id)
    .is("finished_at", null);
  if (error) throw error;

  await syncGroupsAndPlayoff(input.tournamentId);
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
  const current = await getTournamentBout(input.id);
  if (!current) throw new Error("This bout was not found.");
  const blocked = playoffOverrideBlock(current.stage, input.blueScore, input.redScore);
  if (blocked) throw new Error(blocked);

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
  const saved = mapTournamentBout(data);
  if (saved.stage === "playoff" || saved.stage === "group") {
    await syncPlayoffTree(saved.tournamentId);
  }
  if (saved.stage === "swiss") await syncSwiss(saved.tournamentId);
  return saved;
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
  const saved = mapTournamentBout(data);
  if (saved.stage === "playoff" || saved.stage === "group") {
    await syncPlayoffTree(saved.tournamentId);
  }
  if (saved.stage === "swiss") await syncSwiss(saved.tournamentId, { rebuildUnplayed: true });
  return saved;
}

export type InsertKothBoutInput = {
  tournamentId: string;
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

export async function insertKothBout(input: InsertKothBoutInput): Promise<TournamentBout> {
  const tournament = await getTournament(input.tournamentId);
  if (!tournament) throw new Error("This tournament was not found.");
  if (tournament.format !== "king_of_hill") throw new Error("This event is not king of the hill.");
  if (tournament.status !== "live") throw new Error("This event is not in progress.");
  if (input.blueFencerId === input.redFencerId) throw new Error("A fencer can't be on both sides.");

  const bouts = await listTournamentBouts(input.tournamentId);
  const kingId = resolveKothKing(bouts, input.blueFencerId, input.redFencerId);
  const sortOrder = bouts.reduce((max, bout) => Math.max(max, bout.sortOrder + 1), 0);
  const rows = await insertTournamentBouts([
    {
      id: newTournamentBoutId(),
      tournament_id: input.tournamentId,
      club_id: input.clubId,
      stage: "koth",
      sort_order: sortOrder,
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
      koth_king_id: kingId,
    },
  ]);
  const saved = rows[0];
  if (!saved) throw new Error("Could not save the bout.");
  return saved;
}
