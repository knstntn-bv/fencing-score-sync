export type OrderedPair = {
  blueId: string;
  redId: string;
};

function overlap(last: OrderedPair | undefined, next: OrderedPair): number {
  if (!last) return 0;
  return (last.blueId === next.blueId || last.blueId === next.redId ? 1 : 0)
    + (last.redId === next.blueId || last.redId === next.redId ? 1 : 0);
}

/** Greedy sequence that prefers pairs with no fencer from the previous bout. */
export function restOrderPairs<T extends OrderedPair>(
  pairs: T[],
  previous?: OrderedPair | null
): T[] {
  const remaining = [...pairs];
  const ordered: T[] = [];

  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1] ?? previous ?? undefined;
    let best = 0;
    let bestOverlap = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const score = overlap(last, remaining[i]);
      if (score < bestOverlap) {
        bestOverlap = score;
        best = i;
        if (score === 0) break;
      }
    }
    ordered.push(remaining.splice(best, 1)[0]);
  }

  return ordered;
}

export function backToBackCount(pairs: OrderedPair[]): number {
  let count = 0;
  for (let i = 1; i < pairs.length; i++) {
    if (overlap(pairs[i - 1], pairs[i]) > 0) count += 1;
  }
  return count;
}
