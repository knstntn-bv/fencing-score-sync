export type TournamentStatus = "setup" | "live" | "done";
export type TournamentFormat =
  | "round_robin"
  | "playoff"
  | "groups_playoff"
  | "swiss"
  | "king_of_hill";
export type TournamentPointsScheme = "half" | "binary" | "football";

export type Tournament = {
  id: string;
  clubId: string;
  name: string;
  status: TournamentStatus;
  format: TournamentFormat | null;
  pointsScheme: TournamentPointsScheme | null;
  timeLimitSec: number;
  pointsLimit: number;
  groupCount: number | null;
  advancersPerGroup: number | null;
  swissRounds: number | null;
  kothExitLimit: number;
  createdAt: string;
  updatedAt: string;
  liveAt: string | null;
  finishedAt: string | null;
};

export const TOURNAMENT_STATUS_LABEL: Record<TournamentStatus, string> = {
  setup: "Setup",
  live: "In progress",
  done: "Finished",
};

export type TournamentParticipant = {
  tournamentId: string;
  fencerId: string;
  clubId: string;
  name: string;
  clubName: string | null;
  isGuest: boolean;
  groupNo: number | null;
};

export const TOURNAMENT_FORMAT_LABEL: Record<TournamentFormat, string> = {
  round_robin: "Round robin",
  playoff: "Playoff",
  groups_playoff: "Groups + playoff",
  swiss: "Swiss",
  king_of_hill: "King of the hill",
};

export const TOURNAMENT_POINTS_SCHEME_LABEL: Record<TournamentPointsScheme, string> = {
  half: "0 / 0.5 / 1",
  binary: "0 / 0 / 1",
  football: "0 / 1 / 3",
};

export type TournamentBoutStage = "rr" | "group" | "swiss" | "playoff" | "koth";

export type TournamentBout = {
  id: string;
  tournamentId: string;
  clubId: string;
  stage: TournamentBoutStage;
  groupNo: number | null;
  roundCode: string | null;
  sortOrder: number;
  blueFencerId: string | null;
  redFencerId: string | null;
  bluePlaceholder: string | null;
  redPlaceholder: string | null;
  winnerNextId: string | null;
  loserNextId: string | null;
  blueName: string | null;
  redName: string | null;
  blueScore: number | null;
  redScore: number | null;
  blueResult: "win" | "lose" | "draw" | null;
  redResult: "win" | "lose" | "draw" | null;
  timeLimitSec: number | null;
  pointsLimit: number | null;
  remainingSec: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  kothKingId: string | null;
};
