import { restOrderPairs, type OrderedPair } from "@/lib/tournament/restOrder";
import { computeStandings, schemePoints, type StandingRow } from "@/lib/tournament/standings";
import type { TournamentBout, TournamentPointsScheme } from "@/types/tournament";

export type SwissPair = OrderedPair;

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

export function swissRoundCount(n: number): number {
  if (n < 2) return 0;
  return Math.max(1, Math.ceil(Math.log2(n)));
}

export function expectedSwissRoundBoutCount(n: number): number {
  if (n < 2) return 0;
  return Math.floor(n / 2);
}

export function swissRoundNumber(bout: TournamentBout): number {
  if (bout.stage !== "swiss" || !bout.roundCode) return 0;
  const round = Number(bout.roundCode);
  return Number.isInteger(round) && round > 0 ? round : 0;
}

export function swissRoundLabel(round: number): string {
  return `Round ${round}`;
}

export function swissBoutsByRound(bouts: TournamentBout[]): { round: number; bouts: TournamentBout[] }[] {
  const byRound = new Map<number, TournamentBout[]>();
  for (const bout of bouts) {
    const round = swissRoundNumber(bout);
    if (!round) continue;
    const list = byRound.get(round) ?? [];
    list.push(bout);
    byRound.set(round, list);
  }
  return [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, rows]) => ({
      round,
      bouts: [...rows].sort((a, b) => a.sortOrder - b.sortOrder),
    }));
}

export function swissRoundComplete(bouts: TournamentBout[], round: number): boolean {
  const rows = bouts.filter((bout) => swissRoundNumber(bout) === round);
  if (rows.length === 0) return false;
  return rows.every((bout) => Boolean(bout.finishedAt));
}

function haveFenced(a: string, b: string, bouts: TournamentBout[]): boolean {
  return bouts.some(
    (bout) =>
      (bout.blueFencerId === a && bout.redFencerId === b) ||
      (bout.blueFencerId === b && bout.redFencerId === a)
  );
}

/** One bye per odd-sized round: the participant missing from that round's bouts. */
export function swissByes(
  fencerIds: string[],
  bouts: TournamentBout[]
): { round: number; fencerId: string }[] {
  const ids = [...new Set(fencerIds)];
  if (ids.length % 2 === 0) return [];
  const found: { round: number; fencerId: string }[] = [];
  for (const { round, bouts: rows } of swissBoutsByRound(bouts)) {
    const fenced = new Set<string>();
    for (const bout of rows) {
      if (bout.blueFencerId) fenced.add(bout.blueFencerId);
      if (bout.redFencerId) fenced.add(bout.redFencerId);
    }
    const missing = ids.filter((id) => !fenced.has(id));
    if (missing.length === 1) found.push({ round, fencerId: missing[0] });
  }
  return found;
}

export function computeSwissStandings(
  people: { id: string; name: string }[],
  bouts: TournamentBout[],
  scheme: TournamentPointsScheme
): StandingRow[] {
  const swiss = bouts.filter((bout) => bout.stage === "swiss");
  const rows = computeStandings(people, swiss, scheme);
  const byId = new Map(rows.map((row) => [row.fencerId, { ...row }]));
  const win = schemePoints(scheme, "win");
  for (const bye of swissByes(
    people.map((person) => person.id),
    swiss
  )) {
    const row = byId.get(bye.fencerId);
    if (row) row.points += win;
  }
  return [...byId.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.scored !== a.scored) return b.scored - a.scored;
    if (a.received !== b.received) return a.received - b.received;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

function pickBye(ids: string[], previousByeIds: Set<string>, random: () => number): string {
  const fresh = ids.filter((id) => !previousByeIds.has(id));
  const pool = fresh.length > 0 ? fresh : ids;
  return pool[Math.floor(random() * pool.length)];
}

function pairRemaining(
  orderedIds: string[],
  priorBouts: TournamentBout[],
  random: () => number
): SwissPair[] {
  const remaining = [...orderedIds];
  const pairs: SwissPair[] = [];
  while (remaining.length >= 2) {
    const blueId = remaining.shift();
    if (!blueId) break;
    let found = remaining.findIndex((id) => !haveFenced(blueId, id, priorBouts));
    if (found < 0) found = 0;
    const redId = remaining.splice(found, 1)[0];
    pairs.push(random() < 0.5 ? { blueId, redId } : { blueId: redId, redId: blueId });
  }
  return pairs;
}

export type SwissRoundDraw = {
  round: number;
  pairs: SwissPair[];
  byeId: string | null;
};

export function drawSwissRound(
  fencerIds: string[],
  round: number,
  priorBouts: TournamentBout[],
  people: { id: string; name: string }[],
  scheme: TournamentPointsScheme,
  random: () => number = Math.random,
  previousPair?: OrderedPair | null
): SwissRoundDraw {
  const unique = [...new Set(fencerIds)];
  if (unique.length < 2) return { round, pairs: [], byeId: null };

  let working = [...unique];
  let byeId: string | null = null;
  if (working.length % 2 === 1) {
    const previousByes = new Set(swissByes(unique, priorBouts).map((row) => row.fencerId));
    byeId = pickBye(working, previousByes, random);
    working = working.filter((id) => id !== byeId);
  }

  let ordered: string[];
  if (round <= 1 || priorBouts.length === 0) {
    ordered = shuffle(working, random);
  } else {
    const rank = computeSwissStandings(people, priorBouts, scheme);
    const byRank = new Map(rank.map((row, index) => [row.fencerId, index]));
    ordered = [...working].sort((a, b) => (byRank.get(a) ?? 0) - (byRank.get(b) ?? 0));
  }

  const pairs = restOrderPairs(pairRemaining(ordered, priorBouts, random), previousPair);
  return { round, pairs, byeId };
}

export function swissReadyToStart(bouts: TournamentBout[], n: number): boolean {
  if (n < 2) return false;
  const swiss = bouts.filter((bout) => bout.stage === "swiss");
  if (swiss.some((bout) => swissRoundNumber(bout) !== 1)) return false;
  if (swiss.length !== expectedSwissRoundBoutCount(n) || swiss.length === 0) return false;
  return swiss.every((bout) => bout.blueFencerId && bout.redFencerId);
}

export function lastSwissPair(bouts: TournamentBout[]): OrderedPair | null {
  const swiss = bouts
    .filter((bout) => bout.stage === "swiss" && bout.blueFencerId && bout.redFencerId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const last = swiss[swiss.length - 1];
  if (!last?.blueFencerId || !last.redFencerId) return null;
  return { blueId: last.blueFencerId, redId: last.redFencerId };
}

export function nextSwissRoundNumber(bouts: TournamentBout[]): number {
  const rounds = swissBoutsByRound(bouts);
  if (rounds.length === 0) return 1;
  return rounds[rounds.length - 1].round + 1;
}

export function swissRoundsToDrop(bouts: TournamentBout[]): number[] {
  return swissBoutsByRound(bouts)
    .filter(({ round, bouts: rows }) => round > 1 && rows.every((bout) => !bout.finishedAt))
    .map(({ round }) => round);
}

export function swissNeedsNextRound(
  bouts: TournamentBout[],
  participantCount: number,
  swissRounds: number
): boolean {
  if (swissRounds < 2) return false;
  const rounds = swissBoutsByRound(bouts);
  if (rounds.length === 0) return false;
  const latest = rounds[rounds.length - 1];
  if (latest.round >= swissRounds) return false;
  if (!swissRoundComplete(bouts, latest.round)) return false;
  if (rounds.some((row) => row.round === latest.round + 1)) return false;
  return expectedSwissRoundBoutCount(participantCount) > 0;
}
