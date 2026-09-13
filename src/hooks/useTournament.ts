import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useFencers } from "@/hooks/useFencers";
import { TOURNAMENTS_QUERY_KEY } from "@/hooks/useTournaments";
import {
  addParticipant,
  getTournament,
  listParticipants,
  removeParticipant,
  renameTournament,
  tournamentErrorMessage,
} from "@/lib/tournaments";
import type { TournamentParticipant } from "@/types/tournament";

export const TOURNAMENT_QUERY_KEY = ["tournament"] as const;
export const TOURNAMENT_PARTICIPANTS_QUERY_KEY = ["tournament-participants"] as const;

export function useTournament(id: string | undefined) {
  const { clubId, configured } = useAuth();
  const queryClient = useQueryClient();
  const roster = useFencers();
  const enabled = configured && Boolean(clubId) && Boolean(id);

  const tournamentQuery = useQuery({
    queryKey: [...TOURNAMENT_QUERY_KEY, id],
    enabled,
    queryFn: () => {
      if (!id) throw new Error("Missing tournament.");
      return getTournament(id);
    },
  });

  const participantsQuery = useQuery({
    queryKey: [...TOURNAMENT_PARTICIPANTS_QUERY_KEY, id],
    enabled: enabled && Boolean(tournamentQuery.data),
    queryFn: () => {
      if (!id) throw new Error("Missing tournament.");
      return listParticipants(id);
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [...TOURNAMENT_QUERY_KEY, id] });
    queryClient.invalidateQueries({ queryKey: [...TOURNAMENT_PARTICIPANTS_QUERY_KEY, id] });
    queryClient.invalidateQueries({ queryKey: [...TOURNAMENTS_QUERY_KEY, clubId] });
  };

  const rename = useMutation({
    mutationFn: (name: string) => {
      if (!id) throw new Error("Missing tournament.");
      return renameTournament(id, name);
    },
    onSuccess: invalidate,
  });

  const checkIn = useMutation({
    mutationFn: (fencerId: string) => {
      if (!id) throw new Error("Missing tournament.");
      if (!clubId) throw new Error("Not signed in.");
      return addParticipant({ tournamentId: id, fencerId, clubId });
    },
    onSuccess: invalidate,
  });

  const checkOut = useMutation({
    mutationFn: (fencerId: string) => {
      if (!id) throw new Error("Missing tournament.");
      return removeParticipant(id, fencerId);
    },
    onSuccess: invalidate,
  });

  const participants: TournamentParticipant[] = participantsQuery.data ?? [];
  const checkedInIds = new Set(participants.map((row) => row.fencerId));

  const tournamentError = tournamentQuery.error
    ? tournamentErrorMessage(tournamentQuery.error, "Could not load tournament.")
    : null;
  const participantsError = participantsQuery.error
    ? tournamentErrorMessage(participantsQuery.error, "Could not load check-in.")
    : null;

  return {
    enabled,
    clubId,
    tournament: tournamentQuery.data ?? null,
    notFound: tournamentQuery.isSuccess && tournamentQuery.data === null,
    participants,
    checkedInIds,
    roster,
    isLoading: tournamentQuery.isLoading || (Boolean(tournamentQuery.data) && participantsQuery.isLoading),
    error: tournamentError ?? participantsError ?? roster.error,
    rename,
    checkIn,
    checkOut,
    mutationError: (error: unknown) => tournamentErrorMessage(error, "Request failed."),
  };
}
