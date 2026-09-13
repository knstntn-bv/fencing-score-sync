import type { TournamentBout } from "@/types/tournament";

export const PLAYOFF_SIZES = [2, 4, 8, 16, 32] as const;
export type PlayoffRoundCode = "r32" | "r16" | "qf" | "sf" | "bronze" | "final";

export const PLAYOFF_ROUND_ORDER: PlayoffRoundCode[] = [
  "r32",
  "r16",
  "qf",
  "sf",
  "bronze",
  "final",
];

export const PLAYOFF_ROUND_LABEL: Record<PlayoffRoundCode, string> = {
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarter-finals",
  sf: "Semi-finals",
  bronze: "Bronze",
  final: "Final",
};

export type PlayoffDraft = {
  id: string;
  roundCode: PlayoffRoundCode;
  sortOrder: number;
  blueFencerId: string | null;
  redFencerId: string | null;
  bluePlaceholder: string | null;
  redPlaceholder: string | null;
  winnerNextId: string | null;
  loserNextId: string | null;
};

export function isPlayoffSize(n: number): boolean {
  return (PLAYOFF_SIZES as readonly number[]).includes(n);
}

export function expectedPlayoffBoutCount(n: number): number {
  if (!isPlayoffSize(n)) return 0;
  return n === 2 ? 1 : n;
}

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

function makeSlot(roundCode: PlayoffRoundCode, newId: () => string): PlayoffDraft {
  return {
    id: newId(),
    roundCode,
    sortOrder: 0,
    blueFencerId: null,
    redFencerId: null,
    bluePlaceholder: null,
    redPlaceholder: null,
    winnerNextId: null,
    loserNextId: null,
  };
}

function elimCodesForSize(n: number): PlayoffRoundCode[] {
  const elimCodes: PlayoffRoundCode[] = [];
  if (n >= 32) elimCodes.push("r32");
  if (n >= 16) elimCodes.push("r16");
  if (n >= 8) elimCodes.push("qf");
  if (n >= 4) elimCodes.push("sf");
  if (n === 2) elimCodes.push("final");
  return elimCodes;
}

function assignSortOrder(rounds: PlayoffDraft[][], sortOffset: number): PlayoffDraft[] {
  const byRound = new Map<PlayoffRoundCode, PlayoffDraft[]>();
  for (const row of rounds) {
    for (const bout of row) {
      const list = byRound.get(bout.roundCode) ?? [];
      list.push(bout);
      byRound.set(bout.roundCode, list);
    }
  }

  let sortOrder = sortOffset;
  const ordered: PlayoffDraft[] = [];
  for (const code of PLAYOFF_ROUND_ORDER) {
    for (const bout of byRound.get(code) ?? []) {
      bout.sortOrder = sortOrder;
      sortOrder += 1;
      ordered.push(bout);
    }
  }
  return ordered;
}

/** Empty single-elim tree. Bronze when n ≥ 4. First round has no ids. */
export function buildPlayoffTree(
  n: number,
  newId: () => string = () => crypto.randomUUID(),
  sortOffset = 0
): PlayoffDraft[] {
  if (!isPlayoffSize(n)) return [];

  const elimCodes = elimCodesForSize(n);
  const rounds: PlayoffDraft[][] = [];
  let count = n / 2;
  for (const code of elimCodes) {
    const row: PlayoffDraft[] = [];
    for (let i = 0; i < count; i++) row.push(makeSlot(code, newId));
    rounds.push(row);
    count /= 2;
  }

  for (let i = 0; i < rounds.length - 1; i++) {
    wireWinners(rounds[i], rounds[i + 1]);
  }

  if (n >= 4) {
    const semis = rounds[rounds.length - 1];
    const bronze = [makeSlot("bronze", newId)];
    const final = [makeSlot("final", newId)];
    wireWinners(semis, final);
    wireLosers(semis, bronze);
    rounds.push(bronze, final);
  }

  return assignSortOrder(rounds, sortOffset);
}

export function firstPlayoffRound(bouts: TournamentBout[]): TournamentBout[] {
  const tree = bouts.filter((bout) => bout.stage === "playoff");
  const firstCode = PLAYOFF_ROUND_ORDER.find((code) => tree.some((bout) => bout.roundCode === code));
  if (!firstCode) return [];
  return tree.filter((bout) => bout.roundCode === firstCode).sort((a, b) => a.sortOrder - b.sortOrder);
}

function wireWinners(from: PlayoffDraft[], to: PlayoffDraft[]): void {
  from.forEach((bout, index) => {
    bout.winnerNextId = to[Math.floor(index / 2)].id;
  });
}

function wireLosers(from: PlayoffDraft[], to: PlayoffDraft[]): void {
  from.forEach((bout) => {
    bout.loserNextId = to[0].id;
  });
}

/** Full single-elim tree. Bronze when n ≥ 4. First round has both ids. */
export function drawPlayoff(
  fencerIds: string[],
  random: () => number = Math.random,
  newId: () => string = () => crypto.randomUUID()
): PlayoffDraft[] {
  const unique = [...new Set(fencerIds)];
  const n = unique.length;
  const tree = buildPlayoffTree(n, newId);
  if (tree.length === 0) return [];

  const shuffled = shuffle(unique, random);
  const firstCode = tree[0]?.roundCode;
  const first = tree.filter((bout) => bout.roundCode === firstCode);
  first.forEach((bout, index) => {
    let blueId = shuffled[index * 2];
    let redId = shuffled[index * 2 + 1];
    if (random() < 0.5) {
      const tmp = blueId;
      blueId = redId;
      redId = tmp;
    }
    bout.blueFencerId = blueId;
    bout.redFencerId = redId;
  });
  return tree;
}

export function playoffReadyToStart(bouts: TournamentBout[]): boolean {
  const tree = bouts.filter((bout) => bout.stage === "playoff");
  const first = firstPlayoffRound(bouts);
  if (tree.length === 0 || first.length === 0) return false;
  const n = first[0].roundCode === "final" ? 2 : first.length * 2;
  if (tree.length !== expectedPlayoffBoutCount(n)) return false;
  return first.every((bout) => bout.blueFencerId && bout.redFencerId);
}

export function groupPlayoffRounds(bouts: TournamentBout[]): { code: PlayoffRoundCode; bouts: TournamentBout[] }[] {
  return PLAYOFF_ROUND_ORDER.map((code) => ({
    code,
    bouts: bouts
      .filter((bout) => bout.stage === "playoff" && bout.roundCode === code)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  })).filter((group) => group.bouts.length > 0);
}

export function canStartPlayoffSlot(bout: TournamentBout): boolean {
  return Boolean(bout.blueFencerId && bout.redFencerId && !bout.finishedAt);
}

export type PlayoffPlaceLabel = "Advanced" | "Out" | "1st" | "2nd" | "3rd" | "4th";

export function playoffPlaceLabel(
  bout: TournamentBout,
  side: "blue" | "red"
): PlayoffPlaceLabel | null {
  if (!bout.finishedAt) return null;
  const won =
    side === "blue" ? bout.blueResult === "win" : bout.redResult === "win";
  if (bout.roundCode === "final") return won ? "1st" : "2nd";
  if (bout.roundCode === "bronze") return won ? "3rd" : "4th";
  return won ? "Advanced" : "Out";
}

function feederSide(
  bouts: TournamentBout[],
  nextId: string,
  feederId: string,
  via: "winner" | "loser"
): "blue" | "red" {
  const feeders = bouts
    .filter((bout) => (via === "winner" ? bout.winnerNextId === nextId : bout.loserNextId === nextId))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return feeders[0]?.id === feederId ? "blue" : "red";
}

export type PlayoffFencerPatch = {
  id: string;
  blueFencerId: string | null;
  redFencerId: string | null;
};

/** Rebuild ids on unplayed later slots from finished feeders. Saved later bouts stay. */
export function propagatePlayoffSlots(bouts: TournamentBout[]): PlayoffFencerPatch[] {
  const next = bouts.map((bout) => ({ ...bout }));
  const targeted = new Set<string>();
  for (const bout of next) {
    if (bout.winnerNextId) targeted.add(bout.winnerNextId);
    if (bout.loserNextId) targeted.add(bout.loserNextId);
  }

  for (const bout of next) {
    if (bout.finishedAt || !targeted.has(bout.id)) continue;
    bout.blueFencerId = null;
    bout.redFencerId = null;
  }

  for (const bout of next) {
    if (!bout.finishedAt || !bout.blueFencerId || !bout.redFencerId) continue;
    if (bout.blueResult === "draw" || !bout.blueResult) continue;
    const winnerId = bout.blueResult === "win" ? bout.blueFencerId : bout.redFencerId;
    const loserId = bout.blueResult === "win" ? bout.redFencerId : bout.blueFencerId;

    const write = (nextId: string | null, fencerId: string | null, via: "winner" | "loser") => {
      if (!nextId || !fencerId) return;
      const slot = next.find((item) => item.id === nextId);
      if (!slot || slot.finishedAt) return;
      if (feederSide(next, nextId, bout.id, via) === "blue") slot.blueFencerId = fencerId;
      else slot.redFencerId = fencerId;
    };

    write(bout.winnerNextId, winnerId, "winner");
    write(bout.loserNextId, loserId, "loser");
  }

  const original = new Map(bouts.map((bout) => [bout.id, bout]));
  return next
    .filter((bout) => !bout.finishedAt && targeted.has(bout.id))
    .filter((bout) => {
      const before = original.get(bout.id);
      return (
        before &&
        (before.blueFencerId !== bout.blueFencerId || before.redFencerId !== bout.redFencerId)
      );
    })
    .map((bout) => ({
      id: bout.id,
      blueFencerId: bout.blueFencerId,
      redFencerId: bout.redFencerId,
    }));
}
