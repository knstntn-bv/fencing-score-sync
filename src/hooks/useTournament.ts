import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useFencers } from "@/hooks/useFencers";
import { TOURNAMENTS_QUERY_KEY } from "@/hooks/useTournaments";
import { drawRoundRobin, expectedRoundRobinBoutCount } from "@/lib/tournament/roundRobin";
import { computeStandings } from "@/lib/tournament/standings";
import {
  deleteTournamentBouts,
  getTournamentBout,
  listTournamentBouts,
  replaceRoundRobinBouts,
} from "@/lib/tournamentBouts";
import {
  addParticipant,
  getTournament,
  listParticipants,
  removeParticipant,
  renameTournament,
  tournamentErrorMessage,
  updateTournament,
} from "@/lib/tournaments";
import type { Tournament, TournamentBout, TournamentParticipant } from "@/types/tournament";

export const TOURNAMENT_QUERY_KEY = ["tournament"] as const;
export const TOURNAMENT_PARTICIPANTS_QUERY_KEY = ["tournament-participants"] as const;
export const TOURNAMENT_BOUTS_QUERY_KEY = ["tournament-bouts"] as const;

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

  const boutsQuery = useQuery({
    queryKey: [...TOURNAMENT_BOUTS_QUERY_KEY, id],
    enabled: enabled && Boolean(tournamentQuery.data),
    queryFn: () => {
      if (!id) throw new Error("Missing tournament.");
      return listTournamentBouts(id);
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [...TOURNAMENT_QUERY_KEY, id] });
    queryClient.invalidateQueries({ queryKey: [...TOURNAMENT_PARTICIPANTS_QUERY_KEY, id] });
    queryClient.invalidateQueries({ queryKey: [...TOURNAMENT_BOUTS_QUERY_KEY, id] });
    queryClient.invalidateQueries({ queryKey: [...TOURNAMENTS_QUERY_KEY, clubId] });
  };

  const rename = useMutation({
    mutationFn: (name: string) => {
      if (!id) throw new Error("Missing tournament.");
      return renameTournament(id, name);
    },
    onSuccess: invalidate,
  });

  const patch = useMutation({
    mutationFn: (next: Parameters<typeof updateTournament>[1]) => {
      if (!id) throw new Error("Missing tournament.");
      return updateTournament(id, next);
    },
    onSuccess: invalidate,
  });

  const checkIn = useMutation({
    mutationFn: async (fencerId: string) => {
      if (!id) throw new Error("Missing tournament.");
      if (!clubId) throw new Error("Not signed in.");
      const row = await addParticipant({ tournamentId: id, fencerId, clubId });
      const current = queryClient.getQueryData<Tournament | null>([...TOURNAMENT_QUERY_KEY, id]);
      if (current?.status === "setup") await deleteTournamentBouts(id);
      return row;
    },
    onSuccess: invalidate,
  });

  const checkOut = useMutation({
    mutationFn: async (fencerId: string) => {
      if (!id) throw new Error("Missing tournament.");
      await removeParticipant(id, fencerId);
      const current = queryClient.getQueryData<Tournament | null>([...TOURNAMENT_QUERY_KEY, id]);
      if (current?.status === "setup") await deleteTournamentBouts(id);
    },
    onSuccess: invalidate,
  });

  const draw = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("Missing tournament.");
      if (!clubId) throw new Error("Not signed in.");
      const current = await getTournament(id);
      if (!current) throw new Error("Missing tournament.");
      if (current.status !== "setup") throw new Error("Draw is only available during setup.");
      const fencerIds = (await listParticipants(id)).map((row) => row.fencerId);
      if (fencerIds.length < 2) throw new Error("Check in at least two fencers.");
      await updateTournament(id, { format: "round_robin" });
      return replaceRoundRobinBouts({
        tournamentId: id,
        clubId,
        pairs: drawRoundRobin(fencerIds),
      });
    },
    onSuccess: invalidate,
  });

  const startEvent = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("Missing tournament.");
      const current = await getTournament(id);
      if (!current) throw new Error("Missing tournament.");
      if (current.status !== "setup") throw new Error("This event already started.");
      if (current.format !== "round_robin") throw new Error("Choose round robin first.");
      if (!current.pointsScheme) throw new Error("Choose a points scheme first.");
      const n = (await listParticipants(id)).length;
      const bouts = await listTournamentBouts(id);
      if (bouts.length !== expectedRoundRobinBoutCount(n) || bouts.length === 0) {
        throw new Error("Draw the bouts before starting.");
      }
      if (bouts.some((bout) => !bout.blueFencerId || !bout.redFencerId)) {
        throw new Error("Draw the bouts before starting.");
      }
      return updateTournament(id, { status: "live", liveAt: new Date().toISOString() });
    },
    onSuccess: invalidate,
  });

  const finishEvent = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("Missing tournament.");
      const current = await getTournament(id);
      if (!current) throw new Error("Missing tournament.");
      if (current.status !== "live") throw new Error("This event is not in progress.");
      return updateTournament(id, { status: "done", finishedAt: new Date().toISOString() });
    },
    onSuccess: invalidate,
  });

  const participants: TournamentParticipant[] = participantsQuery.data ?? [];
  const bouts: TournamentBout[] = boutsQuery.data ?? [];
  const checkedInIds = new Set(participants.map((row) => row.fencerId));
  const people = participants.map((row) => {
    const fencer = [...roster.active, ...roster.archived].find((item) => item.id === row.fencerId);
    return { id: row.fencerId, name: fencer?.name ?? "Unknown" };
  });
  const standings = tournamentQuery.data?.pointsScheme
    ? computeStandings(people, bouts, tournamentQuery.data.pointsScheme)
    : [];

  const queue = bouts.filter((bout) => !bout.finishedAt);
  const finishedBouts = [...bouts]
    .filter((bout) => bout.finishedAt)
    .sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""));

  const tournamentError = tournamentQuery.error
    ? tournamentErrorMessage(tournamentQuery.error, "Could not load tournament.")
    : null;
  const participantsError = participantsQuery.error
    ? tournamentErrorMessage(participantsQuery.error, "Could not load check-in.")
    : null;
  const boutsError = boutsQuery.error
    ? tournamentErrorMessage(boutsQuery.error, "Could not load bouts.")
    : null;

  return {
    enabled,
    clubId,
    tournament: tournamentQuery.data ?? null,
    notFound: tournamentQuery.isSuccess && tournamentQuery.data === null,
    participants,
    checkedInIds,
    bouts,
    queue,
    finishedBouts,
    standings,
    expectedBoutCount: expectedRoundRobinBoutCount(participants.length),
    roster,
    isLoading:
      tournamentQuery.isLoading ||
      (Boolean(tournamentQuery.data) && (participantsQuery.isLoading || boutsQuery.isLoading)),
    error: tournamentError ?? participantsError ?? boutsError ?? roster.error,
    rename,
    patch,
    checkIn,
    checkOut,
    draw,
    startEvent,
    finishEvent,
    mutationError: (error: unknown) => tournamentErrorMessage(error, "Request failed."),
  };
}

export function useTournamentSlot(tournamentId: string | null, boutId: string | null) {
  const { configured } = useAuth();
  const enabled = configured && Boolean(tournamentId) && Boolean(boutId);

  const tournamentQuery = useQuery({
    queryKey: [...TOURNAMENT_QUERY_KEY, tournamentId],
    enabled,
    queryFn: () => {
      if (!tournamentId) throw new Error("Missing tournament.");
      return getTournament(tournamentId);
    },
  });

  const boutQuery = useQuery({
    queryKey: [...TOURNAMENT_BOUTS_QUERY_KEY, "slot", boutId],
    enabled,
    queryFn: () => {
      if (!boutId) throw new Error("Missing bout.");
      return getTournamentBout(boutId);
    },
  });

  const bout = boutQuery.data ?? null;
  const tournament = tournamentQuery.data ?? null;
  const mismatch = Boolean(bout && tournamentId && bout.tournamentId !== tournamentId);

  return {
    enabled,
    tournament,
    bout: mismatch ? null : bout,
    isLoading: enabled && (tournamentQuery.isLoading || boutQuery.isLoading),
    notFound:
      enabled &&
      tournamentQuery.isSuccess &&
      boutQuery.isSuccess &&
      (!tournament || !bout || mismatch),
  };
}
