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
  groupNo: number | null;
};

export const TOURNAMENT_FORMAT_LABEL: Record<TournamentFormat, string> = {
  round_robin: "Round robin",
  playoff: "Playoff",
  groups_playoff: "Groups + playoff",
  swiss: "Swiss",
  king_of_hill: "King of the hill",
};
