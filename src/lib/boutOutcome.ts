import type { BoutResult } from "@/types/fencing";

export type WinnerSide = 1 | 2;
export type { BoutResult };

export function nextWinnerState(
  current: WinnerSide | null,
  blueScore: number,
  redScore: number,
  pointsLimit: number
): WinnerSide | null {
  const blueAtLimit = blueScore >= pointsLimit;
  const redAtLimit = redScore >= pointsLimit;

  if (!blueAtLimit && !redAtLimit) {
    return null;
  }

  if (current === 1 && blueAtLimit) {
    return 1;
  }
  if (current === 2 && redAtLimit) {
    return 2;
  }

  if (blueAtLimit && !redAtLimit) {
    return 1;
  }
  if (redAtLimit && !blueAtLimit) {
    return 2;
  }

  return current;
}

/** Stored bout outcome from the scoreline. Timer vs points-limit does not matter. */
export function scoreResults(
  blueScore: number,
  redScore: number
): { blueResult: BoutResult; redResult: BoutResult } {
  if (blueScore > redScore) {
    return { blueResult: "win", redResult: "lose" };
  }
  if (redScore > blueScore) {
    return { blueResult: "lose", redResult: "win" };
  }
  return { blueResult: "draw", redResult: "draw" };
}

export function scoreLeader(blueScore: number, redScore: number): WinnerSide | null {
  if (blueScore > redScore) return 1;
  if (redScore > blueScore) return 2;
  return null;
}
