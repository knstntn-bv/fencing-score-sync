export type PisteSide = "blue" | "red";
export type BoutResult = "win" | "lose" | "draw";

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
  blueResult: BoutResult;
  redResult: BoutResult;
  timeLimitSec: number;
  pointsLimit: number;
  remainingSec: number;
  startedAt: string;
  finishedAt: string;
  createdAt: string;
};
