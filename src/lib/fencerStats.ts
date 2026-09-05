import type { Fencer, Match } from "@/types/fencing";

export type NamedCount = {
  id: string;
  name: string;
  count: number;
};

export type FencerStats = {
  id: string;
  name: string;
  archived: boolean;
  bouts: number;
  wins: number;
  losses: number;
  draws: number;
  mostBoutsVs: NamedCount | null;
  mostWinsVs: NamedCount | null;
  mostLossesVs: NamedCount | null;
};

type OpponentAcc = {
  id: string;
  name: string;
  bouts: number;
  wins: number;
  losses: number;
};

function opponentOf(match: Match, fencerId: string): { id: string; name: string } | null {
  if (match.blueFencerId === fencerId) {
    return { id: match.redFencerId, name: match.redName };
  }
  if (match.redFencerId === fencerId) {
    return { id: match.blueFencerId, name: match.blueName };
  }
  return null;
}

function resultFor(match: Match, fencerId: string) {
  if (match.blueFencerId === fencerId) return match.blueResult;
  if (match.redFencerId === fencerId) return match.redResult;
  return null;
}

function pickLeader(opponents: OpponentAcc[], key: "bouts" | "wins" | "losses"): NamedCount | null {
  let best: OpponentAcc | null = null;
  for (const opponent of opponents) {
    if (opponent[key] <= 0) continue;
    if (
      !best ||
      opponent[key] > best[key] ||
      (opponent[key] === best[key] &&
        opponent.name.localeCompare(best.name, undefined, { sensitivity: "base" }) < 0)
    ) {
      best = opponent;
    }
  }
  if (!best) return null;
  return { id: best.id, name: best.name, count: best[key] };
}

export function statsForFencer(
  fencerId: string,
  name: string,
  archived: boolean,
  matches: Match[],
  displayName: (id: string, snapshot: string) => string = (_id, snapshot) => snapshot
): FencerStats {
  const opponents = new Map<string, OpponentAcc>();
  let wins = 0;
  let losses = 0;
  let draws = 0;

  for (const match of matches) {
    const result = resultFor(match, fencerId);
    const opponent = opponentOf(match, fencerId);
    if (!result || !opponent) continue;

    if (result === "win") wins += 1;
    else if (result === "lose") losses += 1;
    else draws += 1;

    const current = opponents.get(opponent.id);
    if (current) {
      current.bouts += 1;
      if (result === "win") current.wins += 1;
      if (result === "lose") current.losses += 1;
    } else {
      opponents.set(opponent.id, {
        id: opponent.id,
        name: displayName(opponent.id, opponent.name),
        bouts: 1,
        wins: result === "win" ? 1 : 0,
        losses: result === "lose" ? 1 : 0,
      });
    }
  }

  const list = [...opponents.values()];
  return {
    id: fencerId,
    name,
    archived,
    bouts: wins + losses + draws,
    wins,
    losses,
    draws,
    mostBoutsVs: pickLeader(list, "bouts"),
    mostWinsVs: pickLeader(list, "wins"),
    mostLossesVs: pickLeader(list, "losses"),
  };
}

export function computeFencerStats(matches: Match[], roster: Fencer[] = []): FencerStats[] {
  const latestName = new Map<string, string>();
  const ids = new Set<string>();
  for (const match of matches) {
    if (!latestName.has(match.blueFencerId)) latestName.set(match.blueFencerId, match.blueName);
    if (!latestName.has(match.redFencerId)) latestName.set(match.redFencerId, match.redName);
    ids.add(match.blueFencerId);
    ids.add(match.redFencerId);
  }

  const rosterById = new Map(roster.map((fencer) => [fencer.id, fencer]));
  const displayName = (id: string, snapshot: string) => rosterById.get(id)?.name ?? snapshot;

  return [...ids]
    .map((id) => {
      const listed = rosterById.get(id);
      return statsForFencer(
        id,
        listed?.name ?? latestName.get(id) ?? "Unknown",
        Boolean(listed?.archivedAt),
        matches,
        displayName
      );
    })
    .sort(
      (a, b) =>
        b.bouts - a.bouts || a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
}

export function recordLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function opponentLabel(entry: NamedCount | null): string {
  if (!entry) return "—";
  return `${entry.name} (${entry.count})`;
}
