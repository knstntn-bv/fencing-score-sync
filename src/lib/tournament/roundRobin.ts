import { restOrderPairs, type OrderedPair } from "@/lib/tournament/restOrder";

export function expectedRoundRobinBoutCount(n: number): number {
  if (n < 2) return 0;
  return (n * (n - 1)) / 2;
}

export function allRoundRobinPairs(fencerIds: string[]): OrderedPair[] {
  const ids = [...fencerIds];
  const pairs: OrderedPair[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      pairs.push({ blueId: ids[i], redId: ids[j] });
    }
  }
  return pairs;
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

/** Full graph of pairs, shuffled sides, then rest-minimizing order. */
export function drawRoundRobin(
  fencerIds: string[],
  random: () => number = Math.random
): OrderedPair[] {
  const unique = [...new Set(fencerIds)];
  if (unique.length < 2) return [];
  const shuffled = shuffle(unique, random);
  const pairs = allRoundRobinPairs(shuffled).map((pair) =>
    random() < 0.5 ? { blueId: pair.redId, redId: pair.blueId } : pair
  );
  return restOrderPairs(pairs);
}
