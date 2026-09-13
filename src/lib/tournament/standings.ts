import type { BoutResult } from "@/types/fencing";
import type { TournamentBout, TournamentPointsScheme } from "@/types/tournament";

export type StandingRow = {
  fencerId: string;
  name: string;
  points: number;
  scored: number;
  received: number;
  bouts: number;
};

export function schemePoints(scheme: TournamentPointsScheme, result: BoutResult): number {
  if (scheme === "half") {
    if (result === "win") return 1;
    if (result === "draw") return 0.5;
    return 0;
  }
  if (scheme === "binary") {
    return result === "win" ? 1 : 0;
  }
  if (result === "win") return 3;
  if (result === "draw") return 1;
  return 0;
}

export function formatStandingPoints(points: number): string {
  return Number.isInteger(points) ? String(points) : points.toFixed(1);
}

export function computeStandings(
  people: { id: string; name: string }[],
  bouts: TournamentBout[],
  scheme: TournamentPointsScheme
): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  for (const person of people) {
    rows.set(person.id, {
      fencerId: person.id,
      name: person.name,
      points: 0,
      scored: 0,
      received: 0,
      bouts: 0,
    });
  }

  for (const bout of bouts) {
    if (!bout.finishedAt || !bout.blueFencerId || !bout.redFencerId) continue;
    if (bout.blueScore == null || bout.redScore == null || !bout.blueResult || !bout.redResult) continue;
    const blue = rows.get(bout.blueFencerId);
    const red = rows.get(bout.redFencerId);
    if (blue) {
      blue.bouts += 1;
      blue.scored += bout.blueScore;
      blue.received += bout.redScore;
      blue.points += schemePoints(scheme, bout.blueResult);
    }
    if (red) {
      red.bouts += 1;
      red.scored += bout.redScore;
      red.received += bout.blueScore;
      red.points += schemePoints(scheme, bout.redResult);
    }
  }

  return [...rows.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.scored !== a.scored) return b.scored - a.scored;
    if (a.received !== b.received) return a.received - b.received;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}
