import type { TournamentBout } from "@/types/tournament";

export const KOTH_EXIT_LIMIT_MIN = 1;
export const KOTH_EXIT_LIMIT_MAX = 10;
export const KOTH_EXIT_LIMIT_DEFAULT = 3;

export type KothExitRow = {
  fencerId: string;
  name: string;
  remaining: number;
  isKing: boolean;
};

export type KothStandingRow = {
  fencerId: string;
  name: string;
  clubName: string | null;
  wins: number;
  bestStreak: number;
  titles: {
    wins: boolean;
    streak: boolean;
    last: boolean;
  };
};

function kothBouts(bouts: TournamentBout[]): TournamentBout[] {
  return bouts
    .filter(
      (bout) =>
        bout.stage === "koth" &&
        bout.finishedAt &&
        bout.blueFencerId &&
        bout.redFencerId
    )
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return (a.finishedAt ?? "").localeCompare(b.finishedAt ?? "");
    });
}

/** Winner after the format reads a draw as the king's victory. */
export function kothBoutWinner(bout: TournamentBout): string | null {
  if (!bout.finishedAt || !bout.blueFencerId || !bout.redFencerId) return null;
  if (bout.blueResult === "win") return bout.blueFencerId;
  if (bout.redResult === "win") return bout.redFencerId;
  if (bout.blueResult === "draw" && bout.kothKingId) return bout.kothKingId;
  return null;
}

export function sittingKothKingId(bouts: TournamentBout[]): string | null {
  const rows = kothBouts(bouts);
  if (rows.length === 0) return null;
  return kothBoutWinner(rows[rows.length - 1]);
}

/** Blue is king when the previous king is not on this bout. */
export function resolveKothKing(
  bouts: TournamentBout[],
  blueId: string,
  redId: string
): string {
  const sitting = sittingKothKingId(bouts);
  if (sitting === blueId || sitting === redId) return sitting;
  return blueId;
}

export function kothExits(
  people: { id: string; name: string }[],
  bouts: TournamentBout[],
  exitLimit: number
): KothExitRow[] {
  const remaining = new Map(people.map((person) => [person.id, exitLimit]));
  for (const bout of kothBouts(bouts)) {
    const kingId = bout.kothKingId ?? resolveKothKing([], bout.blueFencerId ?? "", bout.redFencerId ?? "");
    const challengerId =
      bout.blueFencerId === kingId ? bout.redFencerId : bout.blueFencerId;
    if (!challengerId) continue;
    remaining.set(challengerId, Math.max(0, (remaining.get(challengerId) ?? 0) - 1));
  }
  const kingId = sittingKothKingId(bouts);
  return people
    .map((person) => ({
      fencerId: person.id,
      name: person.name,
      remaining: remaining.get(person.id) ?? 0,
      isKing: person.id === kingId,
    }))
    .sort((a, b) => {
      if (b.remaining !== a.remaining) return b.remaining - a.remaining;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
}

export function kothChallengerIds(exits: KothExitRow[]): Set<string> {
  return new Set(exits.filter((row) => row.remaining > 0).map((row) => row.fencerId));
}

export function computeKothStandings(
  people: { id: string; name: string; clubName?: string | null }[],
  bouts: TournamentBout[]
): KothStandingRow[] {
  const wins = new Map(people.map((person) => [person.id, 0]));
  const current = new Map(people.map((person) => [person.id, 0]));
  const best = new Map(people.map((person) => [person.id, 0]));

  for (const bout of kothBouts(bouts)) {
    const winnerId = kothBoutWinner(bout);
    if (!winnerId || !bout.blueFencerId || !bout.redFencerId) continue;
    const loserId = winnerId === bout.blueFencerId ? bout.redFencerId : bout.blueFencerId;
    wins.set(winnerId, (wins.get(winnerId) ?? 0) + 1);
    current.set(loserId, 0);
    const streak = (current.get(winnerId) ?? 0) + 1;
    current.set(winnerId, streak);
    best.set(winnerId, Math.max(best.get(winnerId) ?? 0, streak));
  }

  const lastId = sittingKothKingId(bouts);
  const rows: KothStandingRow[] = people.map((person) => ({
    fencerId: person.id,
    name: person.name,
    clubName: person.clubName ?? null,
    wins: wins.get(person.id) ?? 0,
    bestStreak: best.get(person.id) ?? 0,
    titles: { wins: false, streak: false, last: person.id === lastId },
  }));

  const maxWins = Math.max(0, ...rows.map((row) => row.wins));
  const maxStreak = Math.max(0, ...rows.map((row) => row.bestStreak));
  for (const row of rows) {
    row.titles.wins = maxWins > 0 && row.wins === maxWins;
    row.titles.streak = maxStreak > 0 && row.bestStreak === maxStreak;
  }

  return rows.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.bestStreak !== a.bestStreak) return b.bestStreak - a.bestStreak;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

export function clampKothExitLimit(value: number): number {
  if (!Number.isInteger(value)) return KOTH_EXIT_LIMIT_DEFAULT;
  return Math.min(KOTH_EXIT_LIMIT_MAX, Math.max(KOTH_EXIT_LIMIT_MIN, value));
}
