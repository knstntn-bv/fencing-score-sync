export type WinnerSide = 1 | 2;

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
