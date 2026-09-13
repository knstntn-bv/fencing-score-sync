import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useFencers } from "@/hooks/useFencers";
import { TOURNAMENTS_QUERY_KEY } from "@/hooks/useTournaments";
import { drawRoundRobin, expectedRoundRobinBoutCount } from "@/lib/tournament/roundRobin";
import { expectedPlayoffBoutCount, isPlayoffSize, playoffReadyToStart } from "@/lib/tournament/playoff";
import {
  expectedGroupsPlayoffBoutCount,
  groupPlayoffFencerPatches,
  groupsPlayoffReadyToStart,
  isValidGroupOption,
  pendingCutoffTies,
} from "@/lib/tournament/groups";
import { computeStandings } from "@/lib/tournament/standings";
import {
  computeKothStandings,
  kothExits,
} from "@/lib/tournament/kingOfHill";
import {
  computeSwissStandings,
  expectedSwissRoundBoutCount,
  swissNeedsNextRound,
  swissReadyToStart,
  swissRoundCount,
} from "@/lib/tournament/swiss";
import { scoreResults } from "@/lib/boutOutcome";
import { playoffOverrideBlock } from "@/lib/tournament/override";
import {
  deleteTournamentBouts,
  getTournamentBout,
  listTournamentBouts,
  overrideTournamentBout,
  replaceGroupsPlayoffBouts,
  replacePlayoffBouts,
  replaceRoundRobinBouts,
  replaceSwissBouts,
  resolveGroupCutoff,
  syncGroupsAndPlayoff,
  syncSwiss,
} from "@/lib/tournamentBouts";
import {
  addParticipant,
  clearParticipantGroups,
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
    mutationFn: async (next: Parameters<typeof updateTournament>[1]) => {
      if (!id) throw new Error("Missing tournament.");
      const current = await getTournament(id);
      const wipeSetup =
        current?.status === "setup" &&
        ((next.format !== undefined && next.format !== current.format) ||
          (next.groupCount !== undefined && next.groupCount !== current.groupCount) ||
          (next.advancersPerGroup !== undefined &&
            next.advancersPerGroup !== current.advancersPerGroup));
      if (wipeSetup) {
        await deleteTournamentBouts(id);
        await clearParticipantGroups(id);
      }
      const payload =
        current &&
        next.format !== undefined &&
        next.format !== current.format &&
        next.swissRounds === undefined
          ? { ...next, swissRounds: null }
          : next;
      return updateTournament(id, payload);
    },
    onSuccess: invalidate,
  });

  const checkIn = useMutation({
    mutationFn: async (fencerId: string) => {
      if (!id) throw new Error("Missing tournament.");
      if (!clubId) throw new Error("Not signed in.");
      const row = await addParticipant({ tournamentId: id, fencerId, clubId });
      const current = queryClient.getQueryData<Tournament | null>([...TOURNAMENT_QUERY_KEY, id]);
      if (current?.status === "setup") {
        await deleteTournamentBouts(id);
        await clearParticipantGroups(id);
        if (current.swissRounds != null) await updateTournament(id, { swissRounds: null });
      }
      return row;
    },
    onSuccess: invalidate,
  });

  const checkOut = useMutation({
    mutationFn: async (fencerId: string) => {
      if (!id) throw new Error("Missing tournament.");
      await removeParticipant(id, fencerId);
      const current = queryClient.getQueryData<Tournament | null>([...TOURNAMENT_QUERY_KEY, id]);
      if (current?.status === "setup") {
        await deleteTournamentBouts(id);
        await clearParticipantGroups(id);
        if (current.swissRounds != null) await updateTournament(id, { swissRounds: null });
      }
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
      if (current.format === "playoff") {
        if (!isPlayoffSize(fencerIds.length)) {
          throw new Error("Playoff needs 2, 4, 8, 16, or 32 fencers.");
        }
        return replacePlayoffBouts({ tournamentId: id, clubId, fencerIds });
      }
      if (current.format === "groups_playoff") {
        const groupCount = current.groupCount;
        const advancers = current.advancersPerGroup;
        if (
          groupCount == null ||
          advancers == null ||
          !isValidGroupOption(fencerIds.length, groupCount, advancers)
        ) {
          throw new Error("Choose a valid group count and advancers first.");
        }
        return replaceGroupsPlayoffBouts({
          tournamentId: id,
          clubId,
          fencerIds,
          groupCount,
          advancers,
        });
      }
      if (current.format === "swiss") {
        return replaceSwissBouts({ tournamentId: id, clubId, fencerIds });
      }
      if (current.format !== "round_robin") throw new Error("Choose a format first.");
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
      const n = (await listParticipants(id)).length;
      const bouts = await listTournamentBouts(id);
      if (current.format === "playoff") {
        if (!isPlayoffSize(n)) throw new Error("Playoff needs 2, 4, 8, 16, or 32 fencers.");
        if (!playoffReadyToStart(bouts)) throw new Error("Draw the bouts before starting.");
        return updateTournament(id, { status: "live", liveAt: new Date().toISOString() });
      }
      if (current.format === "groups_playoff") {
        if (!current.pointsScheme) throw new Error("Choose a points scheme first.");
        const groupCount = current.groupCount;
        const advancers = current.advancersPerGroup;
        const participants = await listParticipants(id);
        if (
          groupCount == null ||
          advancers == null ||
          !groupsPlayoffReadyToStart(bouts, participants, groupCount, advancers)
        ) {
          throw new Error("Draw the bouts before starting.");
        }
        const live = await updateTournament(id, { status: "live", liveAt: new Date().toISOString() });
        await syncGroupsAndPlayoff(id);
        return live;
      }
      if (current.format === "swiss") {
        if (!current.pointsScheme) throw new Error("Choose a points scheme first.");
        if (!swissReadyToStart(bouts, n) || current.swissRounds !== swissRoundCount(n)) {
          throw new Error("Draw the bouts before starting.");
        }
        return updateTournament(id, { status: "live", liveAt: new Date().toISOString() });
      }
      if (current.format === "king_of_hill") {
        if (n < 2) throw new Error("Check in at least two fencers.");
        return updateTournament(id, { status: "live", liveAt: new Date().toISOString() });
      }
      if (current.format !== "round_robin") throw new Error("Choose a format first.");
      if (!current.pointsScheme) throw new Error("Choose a points scheme first.");
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

  const overrideBout = useMutation({
    mutationFn: async (input: { id: string; blueScore: number; redScore: number }) => {
      if (!id) throw new Error("Missing tournament.");
      const current = await getTournament(id);
      if (!current) throw new Error("Missing tournament.");
      if (current.status !== "live" && current.status !== "done") {
        throw new Error("Scores can be edited after the event starts.");
      }
      if (!navigator.onLine) {
        throw new Error("Need a network connection to update a tournament bout.");
      }
      const bout = await getTournamentBout(input.id);
      if (!bout || bout.tournamentId !== id) throw new Error("This bout was not found.");
      const blocked = playoffOverrideBlock(bout.stage, input.blueScore, input.redScore);
      if (blocked) throw new Error(blocked);
      const { blueResult, redResult } = scoreResults(input.blueScore, input.redScore);
      return overrideTournamentBout({
        id: input.id,
        blueScore: input.blueScore,
        redScore: input.redScore,
        blueResult,
        redResult,
      });
    },
    onSuccess: (bout) => {
      invalidate();
      queryClient.invalidateQueries({
        queryKey: [...TOURNAMENT_BOUTS_QUERY_KEY, "slot", bout.id],
      });
    },
  });

  const resolveCutoff = useMutation({
    mutationFn: async (input: { groupNo: number; fencerId: string }) => {
      if (!id) throw new Error("Missing tournament.");
      if (!navigator.onLine) {
        throw new Error("Need a network connection to pick an advancer.");
      }
      return resolveGroupCutoff({ tournamentId: id, ...input });
    },
    onSuccess: invalidate,
  });

  const syncGroups = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("Missing tournament.");
      return syncGroupsAndPlayoff(id);
    },
    onSuccess: (changed) => {
      if (changed) invalidate();
    },
  });

  const syncSwissRounds = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("Missing tournament.");
      return syncSwiss(id);
    },
    onSuccess: (changed) => {
      if (changed) invalidate();
    },
  });

  const participants: TournamentParticipant[] = participantsQuery.data ?? [];
  const bouts: TournamentBout[] = boutsQuery.data ?? [];
  const checkedInIds = new Set(participants.map((row) => row.fencerId));
  const people = participants.map((row) => {
    const fencer = [...roster.active, ...roster.archived].find((item) => item.id === row.fencerId);
    return { id: row.fencerId, name: fencer?.name ?? "Unknown", groupNo: row.groupNo };
  });
  const event = tournamentQuery.data;
  const standings = event?.pointsScheme
    ? event.format === "swiss"
      ? computeSwissStandings(people, bouts, event.pointsScheme)
      : computeStandings(people, bouts, event.pointsScheme)
    : [];
  const kothTable =
    event?.format === "king_of_hill"
      ? computeKothStandings(people, bouts)
      : [];
  const kothExitRows =
    event?.format === "king_of_hill"
      ? kothExits(people, bouts, event.kothExitLimit)
      : [];
  const groupScheme = event?.format === "groups_playoff" ? event.pointsScheme : null;
  const groupTables =
    groupScheme && event?.groupCount
      ? Array.from({ length: event.groupCount }, (_, index) => {
          const groupNo = index + 1;
          const members = people.filter((person) => person.groupNo === groupNo);
          return {
            groupNo,
            standings: computeStandings(
              members,
              bouts.filter((bout) => bout.stage === "group" && bout.groupNo === groupNo),
              groupScheme
            ),
          };
        })
      : [];
  const cutoffTies =
    event?.format === "groups_playoff" &&
    event.pointsScheme &&
    event.groupCount &&
    event.advancersPerGroup
      ? pendingCutoffTies(
          bouts,
          people,
          event.pointsScheme,
          event.groupCount,
          event.advancersPerGroup
        )
      : [];
  const needsGroupSync =
    event?.status === "live" &&
    event.format === "groups_playoff" &&
    event.pointsScheme &&
    event.groupCount &&
    event.advancersPerGroup
      ? groupPlayoffFencerPatches(
          bouts,
          people,
          event.pointsScheme,
          event.groupCount,
          event.advancersPerGroup
        ).patches.length > 0
      : false;
  const needsSwissSync =
    event?.status === "live" && event.format === "swiss" && event.pointsScheme && event.swissRounds
      ? swissNeedsNextRound(bouts, participants.length, event.swissRounds)
      : false;

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

  const expectedBoutCount =
    event?.format === "playoff"
      ? expectedPlayoffBoutCount(participants.length)
      : event?.format === "groups_playoff" && event.groupCount && event.advancersPerGroup
        ? expectedGroupsPlayoffBoutCount(participants.length, event.groupCount, event.advancersPerGroup)
        : event?.format === "swiss"
          ? expectedSwissRoundBoutCount(participants.length)
          : event?.format === "round_robin"
            ? expectedRoundRobinBoutCount(participants.length)
            : 0;

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
    kothTable,
    kothExits: kothExitRows,
    groupTables,
    cutoffTies,
    needsGroupSync,
    needsSwissSync,
    expectedBoutCount,
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
    overrideBout,
    resolveCutoff,
    syncGroups,
    syncSwiss: syncSwissRounds,
    mutationError: (error: unknown) => tournamentErrorMessage(error, "Request failed."),
  };
}

export function useTournamentSlot(tournamentId: string | null, boutId: string | null) {
  const { configured } = useAuth();
  const tournamentEnabled = configured && Boolean(tournamentId);
  const boutEnabled = tournamentEnabled && Boolean(boutId);

  const tournamentQuery = useQuery({
    queryKey: [...TOURNAMENT_QUERY_KEY, tournamentId],
    enabled: tournamentEnabled,
    queryFn: () => {
      if (!tournamentId) throw new Error("Missing tournament.");
      return getTournament(tournamentId);
    },
  });

  const boutQuery = useQuery({
    queryKey: [...TOURNAMENT_BOUTS_QUERY_KEY, "slot", boutId],
    enabled: boutEnabled,
    queryFn: () => {
      if (!boutId) throw new Error("Missing bout.");
      return getTournamentBout(boutId);
    },
  });

  const bout = boutQuery.data ?? null;
  const tournament = tournamentQuery.data ?? null;
  const mismatch = Boolean(bout && tournamentId && bout.tournamentId !== tournamentId);

  return {
    enabled: tournamentEnabled,
    tournament,
    bout: mismatch ? null : bout,
    isLoading:
      tournamentEnabled &&
      (tournamentQuery.isLoading || (boutEnabled && boutQuery.isLoading)),
    notFound:
      tournamentEnabled &&
      tournamentQuery.isSuccess &&
      (boutEnabled
        ? boutQuery.isSuccess && (!tournament || !bout || mismatch)
        : tournament === null),
  };
}
