import { scoreResults } from "@/lib/boutOutcome";
import type { TournamentBoutStage } from "@/types/tournament";

const MAX_OVERRIDE_SCORE = 99;

/** Non-negative integer score, or null if the field is not a valid override. */
export function parseOverrideScore(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 0 || value > MAX_OVERRIDE_SCORE) return null;
  return value;
}

/** Playoff cannot be a draw — on Save or override. */
export function playoffOverrideBlock(
  stage: TournamentBoutStage,
  blueScore: number,
  redScore: number
): string | null {
  if (stage !== "playoff") return null;
  if (blueScore === redScore) return "Playoff bouts need a winner.";
  return null;
}

export function overrideResults(blueScore: number, redScore: number) {
  return scoreResults(blueScore, redScore);
}
