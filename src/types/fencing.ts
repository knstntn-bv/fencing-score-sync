export type PisteSide = "blue" | "red";
export type MatchEndedBy = "points" | "time" | "draw";

export type Fencer = {
  id: string;
  clubId: string;
  name: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Match = {
  id: string;
  clubId: string;
  blueFencerId: string;
  redFencerId: string;
  blueName: string;
  redName: string;
  blueScore: number;
  redScore: number;
  timeLimitSec: number;
  pointsLimit: number;
  remainingSec: number;
  winnerFencerId: string | null;
  winnerName: string | null;
  endedBy: MatchEndedBy;
  startedAt: string;
  finishedAt: string;
  createdAt: string;
};
