import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { readSettings } from "@/lib/settings";
import {
  createTournament,
  deleteTournament,
  listTournaments,
  newTournamentName,
  tournamentErrorMessage,
} from "@/lib/tournaments";
import type { Tournament } from "@/types/tournament";

export const TOURNAMENTS_QUERY_KEY = ["tournaments"] as const;

export function useTournaments() {
  const { clubId, configured } = useAuth();
  const queryClient = useQueryClient();
  const enabled = configured && Boolean(clubId);

  const query = useQuery({
    queryKey: [...TOURNAMENTS_QUERY_KEY, clubId],
    enabled,
    queryFn: () => {
      if (!clubId) throw new Error("Not signed in.");
      return listTournaments(clubId);
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [...TOURNAMENTS_QUERY_KEY, clubId] });

  const create = useMutation({
    mutationFn: () => {
      if (!clubId) throw new Error("Not signed in.");
      const settings = readSettings();
      return createTournament({
        clubId,
        name: newTournamentName(),
        timeLimitSec: settings.timeLimit,
        pointsLimit: settings.pointsLimit,
      });
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteTournament(id),
    onSuccess: invalidate,
  });

  const tournaments: Tournament[] = query.data ?? [];

  return {
    enabled,
    clubId,
    tournaments,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ? tournamentErrorMessage(query.error, "Could not load tournaments.") : null,
    create,
    remove,
    mutationError: (error: unknown) => tournamentErrorMessage(error, "Request failed."),
  };
}
