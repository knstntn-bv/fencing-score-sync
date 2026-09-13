import { restOrderPairs, type OrderedPair } from "@/lib/tournament/restOrder";
import {
  buildPlayoffTree,
  expectedPlayoffBoutCount,
  firstPlayoffRound,
  isPlayoffSize,
  type PlayoffDraft,
  type PlayoffFencerPatch,
} from "@/lib/tournament/playoff";
import { expectedRoundRobinBoutCount } from "@/lib/tournament/roundRobin";
import { computeStandings, type StandingRow } from "@/lib/tournament/standings";
import type { TournamentBout, TournamentParticipant, TournamentPointsScheme } from "@/types/tournament";

export const GROUP_COUNTS = [2, 4, 8] as const;

export type GroupOption = {
  groupCount: number;
  advancers: number;
};

export type GroupPair = OrderedPair & { groupNo: number };

export type PlaceholderRef = {
  groupNo: number;
  place: number;
};

export type CutoffTie = {
  groupNo: number;
  remaining: number;
  candidates: StandingRow[];
};

export type GroupPlaceFill = {
  groupNo: number;
  place: number;
  fencerId: string;
};

function shuffle<T>(items: T[], random: () => number): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = next[i];
    next[i] = next[j];
    next[j] = tmp;
  }
  return next;
}

export function validGroupOptions(n: number): GroupOption[] {
  const options: GroupOption[] = [];
  for (const groupCount of GROUP_COUNTS) {
    if (groupCount > n) continue;
    const minSize = Math.floor(n / groupCount);
    if (minSize < 1) continue;
    for (let advancers = 1; advancers <= minSize; advancers++) {
      if (isPlayoffSize(groupCount * advancers)) {
        options.push({ groupCount, advancers });
      }
    }
  }
  return options;
}

export function isValidGroupOption(n: number, groupCount: number, advancers: number): boolean {
  return validGroupOptions(n).some(
    (option) => option.groupCount === groupCount && option.advancers === advancers
  );
}

/** Prefer 4 groups × 2 advancers when that fits (12 people). */
export function defaultGroupOption(n: number): GroupOption | null {
  const options = validGroupOptions(n);
  if (options.length === 0) return null;
  const preferred = options.find((option) => option.groupCount === 4 && option.advancers === 2);
  if (preferred) return preferred;
  const four = options.find((option) => option.groupCount === 4);
  if (four) return four;
  return options[0];
}

/** Larger groups first: 13 people / 4 groups → 4, 3, 3, 3. */
export function evenSplit(n: number, groupCount: number): number[] {
  if (groupCount <= 0) return [];
  const base = Math.floor(n / groupCount);
  const extra = n % groupCount;
  return Array.from({ length: groupCount }, (_, index) => base + (index < extra ? 1 : 0));
}

export function expectedGroupBoutCount(size: number): number {
  return expectedRoundRobinBoutCount(size);
}

export function expectedGroupsPlayoffBoutCount(n: number, groupCount: number, advancers: number): number {
  const groupBouts = evenSplit(n, groupCount).reduce((sum, size) => sum + expectedGroupBoutCount(size), 0);
  return groupBouts + expectedPlayoffBoutCount(groupCount * advancers);
}

export function splitIntoGroups(
  fencerIds: string[],
  groupCount: number,
  random: () => number = Math.random
): string[][] {
  const shuffled = shuffle([...new Set(fencerIds)], random);
  const sizes = evenSplit(shuffled.length, groupCount);
  const groups: string[][] = [];
  let offset = 0;
  for (const size of sizes) {
    groups.push(shuffled.slice(offset, offset + size));
    offset += size;
  }
  return groups;
}

export function groupLetter(groupNo: number): string {
  return String.fromCharCode(64 + groupNo);
}

export function groupTitle(groupNo: number): string {
  return `Group ${groupLetter(groupNo)}`;
}

export function formatOrdinal(n: number): string {
  const value = n % 100;
  if (value >= 11 && value <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function placeholderCode(groupNo: number, place: number): string {
  return `g${groupNo}p${place}`;
}

export function parsePlaceholder(code: string | null | undefined): PlaceholderRef | null {
  if (!code) return null;
  const match = /^g(\d+)p(\d+)$/.exec(code);
  if (!match) return null;
  return { groupNo: Number(match[1]), place: Number(match[2]) };
}

export function formatPlaceholder(code: string | null | undefined): string {
  const parsed = parsePlaceholder(code);
  if (!parsed) return "—";
  return `${formatOrdinal(parsed.place)} of group ${groupLetter(parsed.groupNo)}`;
}

/**
 * First-round pairs so the same group does not meet immediately.
 * Duos (1–2), (3–4), …; within a duo, k-th of X vs (q+1−k)-th of Y.
 * Duos are interleaved so firsts land in opposite halves:
 * 4 groups × 2 → 1A–2B, 1C–2D, 1B–2A, 1D–2C.
 */
export function crossFirstRoundPairs(groupCount: number, advancers: number): [PlaceholderRef, PlaceholderRef][] {
  const duos: [number, number][] = [];
  for (let groupNo = 1; groupNo <= groupCount; groupNo += 2) {
    duos.push([groupNo, groupNo + 1]);
  }
  const pairs: [PlaceholderRef, PlaceholderRef][] = [];
  for (let place = 1; place <= advancers; place++) {
    for (const [left, right] of duos) {
      pairs.push([
        { groupNo: left, place },
        { groupNo: right, place: advancers + 1 - place },
      ]);
    }
  }
  return pairs;
}

function allGroupPairs(fencerIds: string[], groupNo: number, random: () => number): GroupPair[] {
  const pairs: GroupPair[] = [];
  for (let i = 0; i < fencerIds.length; i++) {
    for (let j = i + 1; j < fencerIds.length; j++) {
      const swap = random() < 0.5;
      pairs.push({
        groupNo,
        blueId: swap ? fencerIds[j] : fencerIds[i],
        redId: swap ? fencerIds[i] : fencerIds[j],
      });
    }
  }
  return pairs;
}

export type GroupsPlayoffDraw = {
  assignments: { fencerId: string; groupNo: number }[];
  groupPairs: GroupPair[];
  playoff: PlayoffDraft[];
};

export function drawGroupsPlayoff(
  fencerIds: string[],
  groupCount: number,
  advancers: number,
  random: () => number = Math.random,
  newId: () => string = () => crypto.randomUUID()
): GroupsPlayoffDraw {
  const unique = [...new Set(fencerIds)];
  if (!isValidGroupOption(unique.length, groupCount, advancers)) {
    return { assignments: [], groupPairs: [], playoff: [] };
  }

  const groups = splitIntoGroups(unique, groupCount, random);
  const assignments = groups.flatMap((ids, index) =>
    ids.map((fencerId) => ({ fencerId, groupNo: index + 1 }))
  );
  const groupPairs = restOrderPairs(groups.flatMap((ids, index) => allGroupPairs(ids, index + 1, random)));

  const playoff = buildPlayoffTree(groupCount * advancers, newId, groupPairs.length);
  const firstCode = playoff[0]?.roundCode;
  const first = playoff.filter((bout) => bout.roundCode === firstCode);
  const crosses = crossFirstRoundPairs(groupCount, advancers);
  first.forEach((bout, index) => {
    const pair = crosses[index];
    if (!pair) return;
    let blue = pair[0];
    let red = pair[1];
    if (random() < 0.5) {
      const tmp = blue;
      blue = red;
      red = tmp;
    }
    bout.bluePlaceholder = placeholderCode(blue.groupNo, blue.place);
    bout.redPlaceholder = placeholderCode(red.groupNo, red.place);
  });

  return { assignments, groupPairs, playoff };
}

export function groupsPlayoffReadyToStart(
  bouts: TournamentBout[],
  participants: TournamentParticipant[],
  groupCount: number,
  advancers: number
): boolean {
  const n = participants.length;
  if (!isValidGroupOption(n, groupCount, advancers)) return false;
  if (participants.some((row) => row.groupNo == null || row.groupNo < 1 || row.groupNo > groupCount)) {
    return false;
  }

  const groupBouts = bouts.filter((bout) => bout.stage === "group");
  const playoff = bouts.filter((bout) => bout.stage === "playoff");
  let expectedGroup = 0;
  for (let groupNo = 1; groupNo <= groupCount; groupNo++) {
    const size = participants.filter((row) => row.groupNo === groupNo).length;
    const count = expectedGroupBoutCount(size);
    expectedGroup += count;
    const rows = groupBouts.filter((bout) => bout.groupNo === groupNo);
    if (rows.length !== count) return false;
    if (rows.some((bout) => !bout.blueFencerId || !bout.redFencerId)) return false;
  }
  if (groupBouts.length !== expectedGroup) return false;
  if (playoff.length !== expectedPlayoffBoutCount(groupCount * advancers)) return false;

  const first = firstPlayoffRound(bouts);
  if (first.length === 0) return false;
  return first.every((bout) => bout.bluePlaceholder && bout.redPlaceholder);
}

export function groupComplete(bouts: TournamentBout[], groupNo: number, size: number): boolean {
  const rows = bouts.filter((bout) => bout.stage === "group" && bout.groupNo === groupNo);
  if (rows.length !== expectedGroupBoutCount(size)) return false;
  return rows.every((bout) => Boolean(bout.finishedAt));
}

function compareStats(a: StandingRow, b: StandingRow): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.scored !== a.scored) return b.scored - a.scored;
  if (a.received !== b.received) return a.received - b.received;
  return 0;
}

function sortStandings(rows: StandingRow[]): StandingRow[] {
  return [...rows].sort((a, b) => {
    const byStats = compareStats(a, b);
    if (byStats !== 0) return byStats;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

function statClusters(rows: StandingRow[]): StandingRow[][] {
  const ranked = sortStandings(rows);
  const clusters: StandingRow[][] = [];
  for (const row of ranked) {
    const last = clusters[clusters.length - 1];
    if (last && compareStats(last[0], row) === 0) last.push(row);
    else clusters.push([row]);
  }
  return clusters;
}

export function resolveGroupPlaces(
  rows: StandingRow[],
  advancers: number,
  pickedIds: string[] = []
): { fills: { place: number; fencerId: string }[]; tie: Omit<CutoffTie, "groupNo"> | null } {
  if (advancers <= 0 || rows.length === 0) return { fills: [], tie: null };
  if (rows.length <= advancers) {
    return {
      fills: sortStandings(rows).map((row, index) => ({ place: index + 1, fencerId: row.fencerId })),
      tie: null,
    };
  }

  const advancerIds: string[] = [];
  let tie: Omit<CutoffTie, "groupNo"> | null = null;

  for (const cluster of statClusters(rows)) {
    const spotsLeft = advancers - advancerIds.length;
    if (spotsLeft <= 0) break;
    if (cluster.length <= spotsLeft) {
      advancerIds.push(...cluster.map((row) => row.fencerId));
      continue;
    }

    const inCluster = new Set(cluster.map((row) => row.fencerId));
    const picks = [...new Set(pickedIds.filter((id) => inCluster.has(id)))];
    if (picks.length >= spotsLeft) {
      advancerIds.push(...picks.slice(0, spotsLeft));
      break;
    }

    advancerIds.push(...picks);
    tie = {
      remaining: spotsLeft - picks.length,
      candidates: cluster.filter((row) => !picks.includes(row.fencerId)),
    };
    break;
  }

  const chosen = sortStandings(rows.filter((row) => advancerIds.includes(row.fencerId)));
  return {
    fills: chosen.map((row, index) => ({ place: index + 1, fencerId: row.fencerId })),
    tie,
  };
}

export function placeholderOccupants(
  bouts: TournamentBout[],
  groupNo: number
): { place: number; fencerId: string; finished: boolean }[] {
  const found: { place: number; fencerId: string; finished: boolean }[] = [];
  for (const bout of bouts) {
    if (bout.stage !== "playoff") continue;
    const sides: ["blue" | "red", string | null, string | null][] = [
      ["blue", bout.bluePlaceholder, bout.blueFencerId],
      ["red", bout.redPlaceholder, bout.redFencerId],
    ];
    for (const [, placeholder, fencerId] of sides) {
      const parsed = parsePlaceholder(placeholder);
      if (!parsed || parsed.groupNo !== groupNo || !fencerId) continue;
      found.push({ place: parsed.place, fencerId, finished: Boolean(bout.finishedAt) });
    }
  }
  return found.sort((a, b) => a.place - b.place);
}

export function pendingCutoffTies(
  bouts: TournamentBout[],
  people: { id: string; name: string; groupNo: number | null }[],
  scheme: TournamentPointsScheme,
  groupCount: number,
  advancers: number
): CutoffTie[] {
  const ties: CutoffTie[] = [];
  for (let groupNo = 1; groupNo <= groupCount; groupNo++) {
    const members = people.filter((person) => person.groupNo === groupNo);
    if (!groupComplete(bouts, groupNo, members.length)) continue;
    const standings = computeStandings(
      members.map((person) => ({ id: person.id, name: person.name })),
      bouts.filter((bout) => bout.stage === "group" && bout.groupNo === groupNo),
      scheme
    );
    const picks = placeholderOccupants(bouts, groupNo).map((row) => row.fencerId);
    const resolved = resolveGroupPlaces(standings, advancers, picks);
    if (resolved.tie) {
      ties.push({ groupNo, remaining: resolved.tie.remaining, candidates: resolved.tie.candidates });
    }
  }
  return ties;
}

function applyFillsToBouts(
  bouts: TournamentBout[],
  fills: GroupPlaceFill[],
  groupNos: Iterable<number>
): void {
  const groups = new Set(groupNos);
  const byCode = new Map(fills.map((fill) => [placeholderCode(fill.groupNo, fill.place), fill.fencerId]));

  for (const bout of bouts) {
    if (bout.stage !== "playoff" || bout.finishedAt) continue;

    const write = (placeholder: string | null, current: string | null): string | null => {
      const parsed = parsePlaceholder(placeholder);
      if (!parsed || !groups.has(parsed.groupNo)) return current;
      return byCode.get(placeholderCode(parsed.groupNo, parsed.place)) ?? null;
    };

    bout.blueFencerId = write(bout.bluePlaceholder, bout.blueFencerId);
    bout.redFencerId = write(bout.redPlaceholder, bout.redFencerId);
  }
}

function patchesFrom(original: TournamentBout[], next: TournamentBout[]): PlayoffFencerPatch[] {
  const before = new Map(original.map((bout) => [bout.id, bout]));
  return next
    .filter((bout) => !bout.finishedAt)
    .filter((bout) => {
      const prior = before.get(bout.id);
      return (
        prior &&
        (prior.blueFencerId !== bout.blueFencerId || prior.redFencerId !== bout.redFencerId)
      );
    })
    .map((bout) => ({
      id: bout.id,
      blueFencerId: bout.blueFencerId,
      redFencerId: bout.redFencerId,
    }));
}

export function groupPlayoffFencerPatches(
  bouts: TournamentBout[],
  people: { id: string; name: string; groupNo: number | null }[],
  scheme: TournamentPointsScheme,
  groupCount: number,
  advancers: number
): { patches: PlayoffFencerPatch[]; ties: CutoffTie[] } {
  const next = bouts.map((bout) => ({ ...bout }));
  const fills: GroupPlaceFill[] = [];
  const groupsToTouch = new Set<number>();
  const ties: CutoffTie[] = [];

  for (let groupNo = 1; groupNo <= groupCount; groupNo++) {
    const members = people.filter((person) => person.groupNo === groupNo);
    groupsToTouch.add(groupNo);
    if (!groupComplete(next, groupNo, members.length)) continue;

    const standings = computeStandings(
      members.map((person) => ({ id: person.id, name: person.name })),
      next.filter((bout) => bout.stage === "group" && bout.groupNo === groupNo),
      scheme
    );
    const picks = placeholderOccupants(next, groupNo).map((row) => row.fencerId);
    const resolved = resolveGroupPlaces(standings, advancers, picks);
    if (resolved.tie) {
      ties.push({ groupNo, remaining: resolved.tie.remaining, candidates: resolved.tie.candidates });
    }
    for (const fill of resolved.fills) {
      fills.push({ groupNo, place: fill.place, fencerId: fill.fencerId });
    }
  }

  applyFillsToBouts(next, fills, groupsToTouch);
  return { patches: patchesFrom(bouts, next), ties };
}

export function applyGroupPlaceholders(bouts: TournamentBout[], fills: GroupPlaceFill[]): PlayoffFencerPatch[] {
  const next = bouts.map((bout) => ({ ...bout }));
  applyFillsToBouts(
    next,
    fills,
    fills.map((fill) => fill.groupNo)
  );
  return patchesFrom(bouts, next);
}

export function nextCutoffPlace(
  bouts: TournamentBout[],
  groupNo: number,
  rows: StandingRow[],
  advancers: number
): number | null {
  const picks = placeholderOccupants(bouts, groupNo).map((row) => row.fencerId);
  const resolved = resolveGroupPlaces(rows, advancers, picks);
  if (!resolved.tie) return null;
  return resolved.fills.length + 1;
}
