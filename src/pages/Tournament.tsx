import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, Trophy, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { OverrideBoutDialog } from "@/components/OverrideBoutDialog";
import { BoutScoreline } from "@/components/BoutScoreline";
import { PlayoffBracket } from "@/components/PlayoffBracket";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/context/AuthContext";
import { useTournament } from "@/hooks/useTournament";
import { formatStandingPoints } from "@/lib/tournament/standings";
import {
  defaultGroupOption,
  GROUP_COUNTS,
  groupsPlayoffReadyToStart,
  groupTitle,
  validGroupOptions,
  type CutoffTie,
} from "@/lib/tournament/groups";
import { isPlayoffSize, playoffReadyToStart } from "@/lib/tournament/playoff";
import {
  swissBoutsByRound,
  swissReadyToStart,
  swissRoundCount,
  swissRoundLabel,
} from "@/lib/tournament/swiss";
import {
  clampKothExitLimit,
  KOTH_EXIT_LIMIT_DEFAULT,
  KOTH_EXIT_LIMIT_MAX,
  KOTH_EXIT_LIMIT_MIN,
  type KothExitRow,
  type KothStandingRow,
} from "@/lib/tournament/kingOfHill";
import { Badge } from "@/components/ui/badge";
import {
  TOURNAMENT_FORMAT_LABEL,
  TOURNAMENT_POINTS_SCHEME_LABEL,
  TOURNAMENT_STATUS_LABEL,
  type TournamentBout,
  type TournamentFormat,
  type TournamentParticipant,
  type TournamentPointsScheme,
} from "@/types/tournament";
import type { StandingRow } from "@/lib/tournament/standings";

const SCHEMES: TournamentPointsScheme[] = ["half", "binary", "football"];

export default function TournamentPage() {
  const { configured } = useAuth();
  const { id } = useParams<{ id: string }>();
  const tournament = useTournament(id);
  const event = tournament.tournament;
  const groupSyncKey = tournament.bouts
    .map((bout) => `${bout.id}:${bout.blueFencerId}:${bout.redFencerId}:${bout.finishedAt ?? ""}`)
    .join("|");
  const attemptedGroupSync = useRef("");

  const attemptedSwissSync = useRef("");
  const needsGroupSync = tournament.needsGroupSync;
  const needsSwissSync = tournament.needsSwissSync;
  const cutoffTieCount = tournament.cutoffTies.length;
  const syncGroupsPending = tournament.syncGroups.isPending;
  const syncGroupsNow = tournament.syncGroups.mutateAsync;
  const syncSwissPending = tournament.syncSwiss.isPending;
  const syncSwissNow = tournament.syncSwiss.mutateAsync;

  useEffect(() => {
    if (!event || event.status !== "live" || event.format !== "groups_playoff") return;
    if (cutoffTieCount > 0) return;
    if (!needsGroupSync || syncGroupsPending) return;
    if (attemptedGroupSync.current === groupSyncKey) return;
    attemptedGroupSync.current = groupSyncKey;
    void syncGroupsNow().catch(() => {
      /* save/override/start also sync; a failed extra pass should not loop */
    });
  }, [
    event,
    groupSyncKey,
    cutoffTieCount,
    needsGroupSync,
    syncGroupsPending,
    syncGroupsNow,
  ]);

  useEffect(() => {
    if (!event || event.status !== "live" || event.format !== "swiss") return;
    if (!needsSwissSync || syncSwissPending) return;
    if (attemptedSwissSync.current === groupSyncKey) return;
    attemptedSwissSync.current = groupSyncKey;
    void syncSwissNow().catch(() => {
      /* save/override also sync; a failed extra pass should not loop */
    });
  }, [event, groupSyncKey, needsSwissSync, syncSwissPending, syncSwissNow]);

  if (!configured) {
    return (
      <TournamentShell>
        <p className="text-muted-foreground">Connect Supabase to manage tournaments.</p>
      </TournamentShell>
    );
  }

  if (tournament.isLoading) {
    return (
      <TournamentShell>
        <p className="text-muted-foreground">Loading tournament…</p>
      </TournamentShell>
    );
  }

  if (tournament.error && !tournament.tournament) {
    return (
      <TournamentShell>
        <p className="text-sm text-destructive mb-4">{tournament.error}</p>
        <Button asChild variant="secondary">
          <Link to="/tournaments">Back to tournaments</Link>
        </Button>
      </TournamentShell>
    );
  }

  if (tournament.notFound || !event) {
    return (
      <TournamentShell>
        <p className="text-muted-foreground mb-4">This tournament was not found.</p>
        <Button asChild variant="secondary">
          <Link to="/tournaments">Back to tournaments</Link>
        </Button>
      </TournamentShell>
    );
  }

  const checkedCount = tournament.checkedInIds.size;
  const fencerName = (fencerId: string | null) =>
    nameFromParticipants(tournament.participants, fencerId);
  const extraCheckedIn = tournament.participants.filter((row) => row.isGuest);
  const checkInBusy =
    tournament.checkIn.isPending ||
    tournament.checkOut.isPending ||
    tournament.checkInGuest.isPending;

  return (
    <TournamentShell
      nameControl={
        <NameField
          name={event.name}
          statusLabel={TOURNAMENT_STATUS_LABEL[event.status]}
          saving={tournament.rename.isPending}
          onSave={async (name) => {
            try {
              await tournament.rename.mutateAsync(name);
              toast.success("Name updated");
            } catch (error) {
              toast.error(tournament.mutationError(error));
              throw error;
            }
          }}
        />
      }
    >
      {tournament.error ? (
        <p className="text-sm text-destructive mb-4">{tournament.error}</p>
      ) : null}

      {event.status === "setup" ? (
        <section className="space-y-4 mb-10">
          <div>
            <h2 className="text-lg font-medium">Check-in</h2>
            <p className="text-sm text-muted-foreground">
              Mark who is fencing today. Guests are named here and stay off the club roster.
            </p>
          </div>

          {tournament.roster.isLoading ? (
            <p className="text-muted-foreground">Loading roster…</p>
          ) : (
            <div className="space-y-6">
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">From roster</h3>
                {tournament.roster.active.length === 0 ? (
                  <p className="text-muted-foreground">
                    No fencers in the roster.{" "}
                    <Link to="/fencers" className="text-primary underline underline-offset-4">
                      Add names on Fencers
                    </Link>
                    , or add a guest below.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {tournament.roster.active.map((fencer) => (
                      <li key={fencer.id}>
                        <CheckInRow
                          id={fencer.id}
                          name={fencer.name}
                          checked={tournament.checkedInIds.has(fencer.id)}
                          disabled={checkInBusy}
                          onToggle={async (checked) => {
                            try {
                              if (checked) await tournament.checkIn.mutateAsync(fencer.id);
                              else await tournament.checkOut.mutateAsync(fencer.id);
                            } catch (error) {
                              toast.error(tournament.mutationError(error));
                            }
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {extraCheckedIn.length > 0 ? (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground">Guests</h3>
                  <ul className="space-y-3">
                    {extraCheckedIn.map((row) => (
                      <li key={row.fencerId}>
                        <CheckInRow
                          id={row.fencerId}
                          name={row.name}
                          checked
                          disabled={checkInBusy}
                          onToggle={async (checked) => {
                            if (checked) return;
                            try {
                              await tournament.checkOut.mutateAsync(row.fencerId);
                            } catch (error) {
                              toast.error(tournament.mutationError(error));
                            }
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <GuestCheckInForm
                saving={tournament.checkInGuest.isPending}
                onAdd={async (input) => {
                  try {
                    await tournament.checkInGuest.mutateAsync(input);
                    toast.success("Guest checked in");
                  } catch (error) {
                    toast.error(tournament.mutationError(error));
                    throw error;
                  }
                }}
              />
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            {checkedCount < 2
              ? "Check in at least two fencers to continue."
              : `${checkedCount} checked in.`}
          </p>
        </section>
      ) : null}

      {event.status === "setup" && checkedCount >= 2 ? (
        <SetupPanel tournament={tournament} />
      ) : null}

      {event.status === "live" || event.status === "done" ? (
        <ConductingPanel
          status={event.status}
          format={event.format}
          bouts={tournament.bouts}
          queue={tournament.queue}
          finishedBouts={tournament.finishedBouts}
          standings={tournament.standings}
          kothExits={tournament.kothExits}
          kothTable={tournament.kothTable}
          tournamentId={event.id}
          groupTables={tournament.groupTables}
          groupCount={event.groupCount}
          cutoffTies={tournament.cutoffTies}
          resolvingId={
            tournament.resolveCutoff.isPending
              ? tournament.resolveCutoff.variables?.fencerId
              : undefined
          }
          fencerName={fencerName}
          showClub={event.status === "done"}
          finishing={tournament.finishEvent.isPending}
          overridingId={
            tournament.overrideBout.isPending ? tournament.overrideBout.variables?.id : undefined
          }
          onOverride={async (input) => {
            try {
              await tournament.overrideBout.mutateAsync(input);
              toast.success("Score updated");
            } catch (error) {
              toast.error(tournament.mutationError(error));
              throw error;
            }
          }}
          onResolveCutoff={async (input) => {
            try {
              await tournament.resolveCutoff.mutateAsync(input);
              toast.success("Advancer picked");
            } catch (error) {
              toast.error(tournament.mutationError(error));
            }
          }}
          onFinish={async () => {
            try {
              await tournament.finishEvent.mutateAsync();
              toast.success("Event finished");
            } catch (error) {
              toast.error(tournament.mutationError(error));
            }
          }}
        />
      ) : null}
    </TournamentShell>
  );
}

function SetupPanel({
  tournament,
}: {
  tournament: ReturnType<typeof useTournament>;
}) {
  const event = tournament.tournament;
  const timeLimitSec = event?.timeLimitSec;
  const pointsLimitValue = event?.pointsLimit;
  const exitLimitValue = event?.kothExitLimit;
  const [timeLimit, setTimeLimit] = useState(timeLimitSec ?? 90);
  const [pointsLimit, setPointsLimit] = useState(pointsLimitValue ?? 12);
  const [exitLimit, setExitLimit] = useState(exitLimitValue ?? KOTH_EXIT_LIMIT_DEFAULT);

  useEffect(() => {
    if (timeLimitSec != null) setTimeLimit(timeLimitSec);
    if (pointsLimitValue != null) setPointsLimit(pointsLimitValue);
    if (exitLimitValue != null) setExitLimit(exitLimitValue);
  }, [timeLimitSec, pointsLimitValue, exitLimitValue]);

  if (!event) return null;

  const saveLimits = async (next: {
    timeLimitSec?: number;
    pointsLimit?: number;
    kothExitLimit?: number;
  }) => {
    try {
      await tournament.patch.mutateAsync(next);
    } catch (error) {
      toast.error(tournament.mutationError(error));
    }
  };

  const checkedIn = tournament.checkedInIds.size;
  const playoffOk = isPlayoffSize(checkedIn);
  const groupOptions = validGroupOptions(checkedIn);
  const groupsOk = groupOptions.length > 0;
  const swissRounds = swissRoundCount(checkedIn);
  const canStart =
    event.format === "playoff"
      ? playoffReadyToStart(tournament.bouts)
      : event.format === "groups_playoff"
        ? Boolean(event.pointsScheme) &&
          event.groupCount != null &&
          event.advancersPerGroup != null &&
          groupsPlayoffReadyToStart(
            tournament.bouts,
            tournament.participants,
            event.groupCount,
            event.advancersPerGroup
          )
        : event.format === "swiss"
          ? Boolean(event.pointsScheme) &&
            swissReadyToStart(tournament.bouts, checkedIn) &&
            event.swissRounds === swissRounds
          : event.format === "king_of_hill"
            ? event.kothExitLimit >= KOTH_EXIT_LIMIT_MIN
            : event.format === "round_robin" &&
              Boolean(event.pointsScheme) &&
              tournament.bouts.length === tournament.expectedBoutCount &&
              tournament.expectedBoutCount > 0;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Format</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Round robin, playoff, groups + playoff, Swiss, and king of the hill are available now.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={event.format === "round_robin" ? "default" : "outline"}
            onClick={async () => {
              try {
                await tournament.patch.mutateAsync({
                  format: "round_robin",
                  groupCount: null,
                  advancersPerGroup: null,
                });
              } catch (error) {
                toast.error(tournament.mutationError(error));
              }
            }}
          >
            {TOURNAMENT_FORMAT_LABEL.round_robin}
          </Button>
          <Button
            type="button"
            variant={event.format === "playoff" ? "default" : "outline"}
            disabled={!playoffOk}
            title={playoffOk ? undefined : "Playoff needs 2, 4, 8, 16, or 32 fencers."}
            onClick={async () => {
              try {
                await tournament.patch.mutateAsync({
                  format: "playoff",
                  groupCount: null,
                  advancersPerGroup: null,
                });
              } catch (error) {
                toast.error(tournament.mutationError(error));
              }
            }}
          >
            {TOURNAMENT_FORMAT_LABEL.playoff}
          </Button>
          <Button
            type="button"
            variant={event.format === "groups_playoff" ? "default" : "outline"}
            disabled={!groupsOk}
            title={
              groupsOk
                ? undefined
                : "Groups + playoff needs enough fencers for 2, 4, or 8 groups with a power-of-two playoff."
            }
            onClick={async () => {
              if (event.format === "groups_playoff") return;
              const option = defaultGroupOption(tournament.checkedInIds.size);
              if (!option) return;
              try {
                await tournament.patch.mutateAsync({
                  format: "groups_playoff",
                  groupCount: option.groupCount,
                  advancersPerGroup: option.advancers,
                });
              } catch (error) {
                toast.error(tournament.mutationError(error));
              }
            }}
          >
            {TOURNAMENT_FORMAT_LABEL.groups_playoff}
          </Button>
          <Button
            type="button"
            variant={event.format === "swiss" ? "default" : "outline"}
            onClick={async () => {
              if (event.format === "swiss") return;
              try {
                await tournament.patch.mutateAsync({
                  format: "swiss",
                  groupCount: null,
                  advancersPerGroup: null,
                  swissRounds: null,
                });
              } catch (error) {
                toast.error(tournament.mutationError(error));
              }
            }}
          >
            {TOURNAMENT_FORMAT_LABEL.swiss}
          </Button>
          <Button
            type="button"
            variant={event.format === "king_of_hill" ? "default" : "outline"}
            onClick={async () => {
              if (event.format === "king_of_hill") return;
              try {
                await tournament.patch.mutateAsync({
                  format: "king_of_hill",
                  groupCount: null,
                  advancersPerGroup: null,
                  swissRounds: null,
                  pointsScheme: null,
                });
              } catch (error) {
                toast.error(tournament.mutationError(error));
              }
            }}
          >
            {TOURNAMENT_FORMAT_LABEL.king_of_hill}
          </Button>
        </div>
        {!playoffOk ? (
          <p className="text-sm text-muted-foreground mt-2">
            Playoff needs 2, 4, 8, 16, or 32 fencers.
          </p>
        ) : null}
        {!groupsOk ? (
          <p className="text-sm text-muted-foreground mt-2">
            Groups + playoff needs 2, 4, or 8 groups and a playoff of 2, 4, 8, 16, or 32.
          </p>
        ) : null}
        {event.format === "swiss" ? (
          <p className="text-sm text-muted-foreground mt-2">
            {swissRounds} {swissRounds === 1 ? "round" : "rounds"} (from check-in).
          </p>
        ) : null}
      </div>

      {event.format === "groups_playoff" ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-medium">Groups</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Advancers times groups must be 2, 4, 8, 16, or 32. Uneven group sizes are fine.
            </p>
            <div className="flex flex-wrap gap-2">
              {GROUP_COUNTS.filter((count) =>
                groupOptions.some((option) => option.groupCount === count)
              ).map((count) => (
                <Button
                  key={count}
                  type="button"
                  variant={event.groupCount === count ? "default" : "outline"}
                  onClick={async () => {
                    const forCount = groupOptions.filter((option) => option.groupCount === count);
                    const keepQ = forCount.some((option) => option.advancers === event.advancersPerGroup);
                    const advancers = keepQ
                      ? event.advancersPerGroup
                      : (forCount.find((option) => option.advancers === 2)?.advancers ??
                        forCount[0]?.advancers);
                    if (advancers == null) return;
                    try {
                      await tournament.patch.mutateAsync({
                        groupCount: count,
                        advancersPerGroup: advancers,
                      });
                    } catch (error) {
                      toast.error(tournament.mutationError(error));
                    }
                  }}
                >
                  {count} groups
                </Button>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-lg font-medium">Advancers per group</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Same number from every group. Firsts are spread across playoff halves.
            </p>
            <div className="flex flex-wrap gap-2">
              {groupOptions
                .filter((option) => option.groupCount === (event.groupCount ?? groupOptions[0]?.groupCount))
                .map((option) => (
                  <Button
                    key={option.advancers}
                    type="button"
                    variant={event.advancersPerGroup === option.advancers ? "default" : "outline"}
                    onClick={async () => {
                      try {
                        await tournament.patch.mutateAsync({
                          groupCount: option.groupCount,
                          advancersPerGroup: option.advancers,
                        });
                      } catch (error) {
                        toast.error(tournament.mutationError(error));
                      }
                    }}
                  >
                    {option.advancers}
                  </Button>
                ))}
            </div>
          </div>
        </div>
      ) : null}

      {event.format === "playoff" || event.format === "king_of_hill" ? null : (
      <div>
        <h2 className="text-lg font-medium">Points scheme</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Loss / draw / win. Required before starting.
        </p>
        <div className="flex flex-wrap gap-2">
          {SCHEMES.map((scheme) => (
            <Button
              key={scheme}
              type="button"
              variant={event.pointsScheme === scheme ? "default" : "outline"}
              onClick={async () => {
                try {
                  await tournament.patch.mutateAsync({ pointsScheme: scheme });
                } catch (error) {
                  toast.error(tournament.mutationError(error));
                }
              }}
            >
              {TOURNAMENT_POINTS_SCHEME_LABEL[scheme]}
            </Button>
          ))}
        </div>
      </div>
      )}

      {event.format === "king_of_hill" ? (
        <div className="space-y-2">
          <Label>Exits per fencer: {exitLimit}</Label>
          <p className="text-sm text-muted-foreground">
            A reminder for the hall. The scoreboard does not block someone with none left.
          </p>
          <Slider
            value={[exitLimit]}
            min={KOTH_EXIT_LIMIT_MIN}
            max={KOTH_EXIT_LIMIT_MAX}
            step={1}
            onValueChange={(value) => setExitLimit(clampKothExitLimit(value[0]))}
            onValueCommit={(value) =>
              void saveLimits({ kothExitLimit: clampKothExitLimit(value[0]) })
            }
          />
        </div>
      ) : null}

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Bout time: {formatDuration(timeLimit)}</Label>
          <Slider
            value={[timeLimit]}
            min={60}
            max={300}
            step={10}
            onValueChange={(value) => setTimeLimit(value[0])}
            onValueCommit={(value) => void saveLimits({ timeLimitSec: value[0] })}
          />
        </div>
        <div className="space-y-2">
          <Label>First to: {pointsLimit} points</Label>
          <Slider
            value={[pointsLimit]}
            min={5}
            max={20}
            step={1}
            onValueChange={(value) => setPointsLimit(value[0])}
            onValueCommit={(value) => void saveLimits({ pointsLimit: value[0] })}
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        {event.format === "king_of_hill" ? null : (
          <Button
            type="button"
            variant="secondary"
            disabled={!event.format || tournament.draw.isPending}
            onClick={async () => {
              try {
                await tournament.draw.mutateAsync();
                toast.success("Bouts drawn");
              } catch (error) {
                toast.error(tournament.mutationError(error));
              }
            }}
          >
            {tournament.bouts.length > 0 ? "Draw again" : "Draw bouts"}
          </Button>
        )}
        <Button
          type="button"
          disabled={!canStart || tournament.startEvent.isPending}
          onClick={async () => {
            try {
              await tournament.startEvent.mutateAsync();
              toast.success("Event started");
            } catch (error) {
              toast.error(tournament.mutationError(error));
            }
          }}
        >
          Start event
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {event.format === "king_of_hill"
          ? "Start the event, then pick fencers on the scoreboard."
          : tournament.bouts.length > 0
            ? event.format === "swiss"
              ? `${tournament.bouts.length} of ${tournament.expectedBoutCount} round 1 bouts ready.`
              : `${tournament.bouts.length} of ${tournament.expectedBoutCount} bouts ready.`
            : "Choose a format, draw the bouts, then start."}
        {(event.format === "round_robin" ||
          event.format === "groups_playoff" ||
          event.format === "swiss") &&
        !event.pointsScheme
          ? " Choose a points scheme to start."
          : null}
      </p>

      {event.format !== "king_of_hill" && tournament.bouts.length > 0 ? (
        <div className="space-y-6">
          <h2 className="text-lg font-medium">Queue</h2>
          <QueueList
            key={tournament.bouts.map((bout) => bout.id).join("|")}
            format={event.format}
            bouts={tournament.bouts}
            queue={tournament.queue}
            groupCount={event.groupCount}
            fencerName={(id) => nameFromParticipants(tournament.participants, id)}
            showStart={false}
          />
        </div>
      ) : null}
    </section>
  );
}

function ConductingPanel({
  status,
  format,
  bouts,
  queue,
  finishedBouts,
  standings,
  kothExits,
  kothTable,
  tournamentId,
  groupTables,
  groupCount,
  cutoffTies,
  resolvingId,
  fencerName,
  showClub,
  finishing,
  overridingId,
  onOverride,
  onResolveCutoff,
  onFinish,
}: {
  status: "live" | "done";
  format: TournamentFormat | null;
  bouts: TournamentBout[];
  queue: TournamentBout[];
  finishedBouts: TournamentBout[];
  standings: StandingRow[];
  kothExits: KothExitRow[];
  kothTable: KothStandingRow[];
  tournamentId: string;
  groupTables: { groupNo: number; standings: StandingRow[] }[];
  groupCount: number | null;
  cutoffTies: CutoffTie[];
  resolvingId?: string;
  fencerName: (id: string | null) => string;
  showClub: boolean;
  finishing: boolean;
  overridingId?: string;
  onOverride: (input: { id: string; blueScore: number; redScore: number }) => Promise<void>;
  onResolveCutoff: (input: { groupNo: number; fencerId: string }) => Promise<void>;
  onFinish: () => Promise<void>;
}) {
  const live = status === "live";
  const defaultTab = live ? "queue" : "table";
  const cutoffByGroup = new Map(cutoffTies.map((tie) => [tie.groupNo, tie]));
  const pendingGroupNos = cutoffTies.map((tie) => tie.groupNo);

  return (
    <section className="space-y-4">
      <Tabs key={defaultTab} defaultValue={defaultTab}>
        <TabsList className={`grid w-full ${live ? "grid-cols-3" : "grid-cols-2"}`}>
          {live ? <TabsTrigger value="queue">Queue</TabsTrigger> : null}
          <TabsTrigger value="table">Table</TabsTrigger>
          <TabsTrigger value="bouts">Bouts</TabsTrigger>
        </TabsList>

        {live ? (
          <TabsContent value="queue" className="space-y-6">
            {format === "king_of_hill" ? (
              <KothQueue exits={kothExits} tournamentId={tournamentId} />
            ) : (
              <QueueList
                format={format}
                bouts={bouts}
                queue={queue}
                groupCount={groupCount}
                pendingGroupNos={pendingGroupNos}
                fencerName={fencerName}
                showStart
              />
            )}
          </TabsContent>
        ) : null}

        <TabsContent value="table" className="space-y-6">
          {format === "playoff" ? (
            <PlayoffBracket bouts={bouts} fencerName={fencerName} showStart={false} />
          ) : format === "king_of_hill" ? (
            kothTable.length === 0 ? (
              <p className="text-muted-foreground">Standings appear after bouts are saved.</p>
            ) : (
              <KothStandingsList rows={kothTable} showClub={showClub} />
            )
          ) : format === "groups_playoff" ? (
            <>
              {groupTables.map((table) => {
                const tie = cutoffByGroup.get(table.groupNo);
                return (
                  <div key={table.groupNo} className="space-y-3">
                    <h3 className="text-sm font-medium text-muted-foreground">
                      {groupTitle(table.groupNo)}
                    </h3>
                    {live && tie ? (
                      <p className="text-sm text-muted-foreground">
                        {tie.remaining === 1
                          ? "Tied on points. Choose who advances to the playoff."
                          : `Tied on points. Choose ${tie.remaining} fencers to advance.`}
                      </p>
                    ) : null}
                    {table.standings.length === 0 ? (
                      <p className="text-muted-foreground">Standings appear after bouts are saved.</p>
                    ) : (
                      <StandingsList
                        rows={table.standings}
                        showClub={showClub}
                        chooseIds={live && tie ? new Set(tie.candidates.map((row) => row.fencerId)) : undefined}
                        choosingId={resolvingId}
                        onChoose={
                          live && tie
                            ? (fencerId) => onResolveCutoff({ groupNo: table.groupNo, fencerId })
                            : undefined
                        }
                      />
                    )}
                  </div>
                );
              })}
              <PlayoffBracket
                bouts={bouts}
                fencerName={fencerName}
                showStart={false}
                pendingGroupNos={pendingGroupNos}
              />
            </>
          ) : standings.length === 0 ? (
            <p className="text-muted-foreground">Standings appear after bouts are saved.</p>
          ) : (
            <StandingsList rows={standings} showClub={showClub} />
          )}
        </TabsContent>

        <TabsContent value="bouts" className="space-y-3">
          {finishedBouts.length === 0 ? (
            <p className="text-muted-foreground">No bouts saved yet.</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Tap a bout to correct the score.</p>
              <ul className="space-y-3">
                {finishedBouts.map((bout) => (
                  <li key={bout.id}>
                    <FinishedBoutRow
                      bout={bout}
                      saving={overridingId === bout.id}
                      onOverride={async (scores) => {
                        await onOverride({ id: bout.id, ...scores });
                      }}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </TabsContent>
      </Tabs>

      {live ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={finishing}>
              Finish event
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Finish this event?</AlertDialogTitle>
              <AlertDialogDescription>
                The queue closes. Standings keep whatever bouts are already saved.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void onFinish()}>Finish event</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </section>
  );
}

function KothQueue({
  exits,
  tournamentId,
}: {
  exits: KothExitRow[];
  tournamentId: string;
}) {
  return (
    <div className="space-y-4">
      <Button asChild>
        <Link to={`/?t=${tournamentId}`}>Open scoreboard</Link>
      </Button>
      {exits.length === 0 ? (
        <p className="text-muted-foreground">Check-in is empty.</p>
      ) : (
        <ul className="space-y-3">
          {exits.map((row) => (
            <li key={row.fencerId}>
              <Card>
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{row.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {row.remaining} {row.remaining === 1 ? "exit" : "exits"} left
                    </p>
                  </div>
                  {row.isKing ? <Badge>King</Badge> : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function KothStandingsList({
  rows,
  showClub,
}: {
  rows: KothStandingRow[];
  showClub: boolean;
}) {
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.fencerId}>
          <Card>
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium truncate">{row.name}</p>
                {showClub && row.clubName ? (
                  <p className="text-sm text-muted-foreground truncate">{row.clubName}</p>
                ) : null}
                <p className="text-sm text-muted-foreground">
                  {row.wins} {row.wins === 1 ? "win" : "wins"} · best streak {row.bestStreak}
                </p>
                {row.titles.wins || row.titles.streak || row.titles.last ? (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {row.titles.wins ? <Badge variant="secondary">Wins</Badge> : null}
                    {row.titles.streak ? <Badge variant="secondary">Streak</Badge> : null}
                    {row.titles.last ? <Badge variant="secondary">On strip</Badge> : null}
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function QueueList({
  format,
  bouts,
  queue,
  groupCount,
  pendingGroupNos = [],
  fencerName,
  showStart,
}: {
  format: TournamentFormat | null;
  bouts: TournamentBout[];
  queue: TournamentBout[];
  groupCount: number | null;
  pendingGroupNos?: number[];
  fencerName: (id: string | null) => string;
  showStart: boolean;
}) {
  if (format === "playoff") {
    return <PlayoffBracket bouts={bouts} fencerName={fencerName} showStart={showStart} />;
  }

  if (format === "groups_playoff") {
    const groupQueue = Array.from({ length: groupCount ?? 0 }, (_, index) => {
      const groupNo = index + 1;
      return {
        groupNo,
        bouts: queue.filter((bout) => bout.stage === "group" && bout.groupNo === groupNo),
      };
    });
    const hasGroupQueue = groupQueue.some((group) => group.bouts.length > 0);
    return (
      <div className="space-y-6">
        {hasGroupQueue
          ? groupQueue.map((group) =>
              group.bouts.length === 0 ? null : (
                <div key={group.groupNo} className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    {groupTitle(group.groupNo)}
                  </h3>
                  <ul className="space-y-3">
                    {group.bouts.map((bout) => (
                      <li key={bout.id}>
                        <GroupQueueCard bout={bout} fencerName={fencerName} showStart={showStart} />
                      </li>
                    ))}
                  </ul>
                </div>
              )
            )
          : null}
        <PlayoffBracket
          bouts={bouts}
          fencerName={fencerName}
          showStart={showStart}
          pendingGroupNos={pendingGroupNos}
        />
        {!hasGroupQueue && queue.filter((bout) => bout.stage === "playoff").length === 0 ? (
          <p className="text-muted-foreground">No bouts left in the queue.</p>
        ) : null}
      </div>
    );
  }

  if (format === "swiss") {
    const swissQueue = swissBoutsByRound(queue);
    if (swissQueue.length === 0) {
      return <p className="text-muted-foreground">No bouts left in the queue.</p>;
    }
    return (
      <div className="space-y-6">
        {swissQueue.map((round) => (
          <div key={round.round} className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              {swissRoundLabel(round.round)}
            </h3>
            <ul className="space-y-3">
              {round.bouts.map((bout) => (
                <li key={bout.id}>
                  <GroupQueueCard bout={bout} fencerName={fencerName} showStart={showStart} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  if (queue.length === 0) {
    return <p className="text-muted-foreground">No bouts left in the queue.</p>;
  }

  return (
    <ul className="space-y-3">
      {queue.map((bout) => (
        <li key={bout.id}>
          <GroupQueueCard bout={bout} fencerName={fencerName} showStart={showStart} />
        </li>
      ))}
    </ul>
  );
}

function GroupQueueCard({
  bout,
  fencerName,
  showStart,
}: {
  bout: TournamentBout;
  fencerName: (id: string | null) => string;
  showStart: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between gap-3">
        <p className="min-w-0">
          <span className="text-fencer-blue font-medium">{fencerName(bout.blueFencerId)}</span>
          <span className="text-muted-foreground"> vs </span>
          <span className="text-fencer-red font-medium">{fencerName(bout.redFencerId)}</span>
        </p>
        {showStart ? (
          <Button asChild size="sm">
            <Link to={`/?t=${bout.tournamentId}&b=${bout.id}`}>Start</Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function StandingsList({
  rows,
  showClub,
  chooseIds,
  choosingId,
  onChoose,
}: {
  rows: StandingRow[];
  showClub?: boolean;
  chooseIds?: Set<string>;
  choosingId?: string;
  onChoose?: (fencerId: string) => void;
}) {
  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        const canChoose = Boolean(onChoose && chooseIds?.has(row.fencerId));
        return (
          <li key={row.fencerId}>
            <Card>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{row.name}</p>
                  {showClub && row.clubName ? (
                    <p className="text-sm text-muted-foreground truncate">{row.clubName}</p>
                  ) : null}
                  <p className="text-sm text-muted-foreground">
                    {formatStandingPoints(row.points)} pts · {row.bouts}{" "}
                    {row.bouts === 1 ? "bout" : "bouts"}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <p className="font-mono tabular-nums text-sm">
                    <span className="text-emerald-500">+{row.scored}</span>
                    <span className="text-muted-foreground"> / </span>
                    <span className="text-red-500">-{row.received}</span>
                  </p>
                  {canChoose ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={Boolean(choosingId)}
                      onClick={() => onChoose?.(row.fencerId)}
                    >
                      {choosingId === row.fencerId ? "Saving…" : "Choose"}
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

function FinishedBoutRow({
  bout,
  saving,
  onOverride,
}: {
  bout: TournamentBout;
  saving: boolean;
  onOverride: (scores: { blueScore: number; redScore: number }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const outcome =
    bout.blueResult === "draw"
      ? "Draw"
      : bout.blueResult === "win"
        ? `${bout.blueName} won`
        : `${bout.redName} won`;
  return (
    <>
      <Card>
        <CardContent className="p-0">
          <button
            type="button"
            className="w-full text-left p-4 space-y-2 rounded-lg hover:bg-accent/40 transition-colors"
            aria-label={`Correct score: ${bout.blueName} ${bout.blueScore}–${bout.redScore} ${bout.redName}`}
            onClick={() => setOpen(true)}
          >
            {bout.finishedAt ? (
              <p className="text-xs text-muted-foreground">
                {format(new Date(bout.finishedAt), "d MMM yyyy, HH:mm")}
              </p>
            ) : null}
            <BoutScoreline
              className="text-lg font-medium"
              blueName={bout.blueName}
              redName={bout.redName}
              blueScore={bout.blueScore}
              redScore={bout.redScore}
            />
            <p className="text-sm text-muted-foreground">{outcome}</p>
          </button>
        </CardContent>
      </Card>
      <OverrideBoutDialog
        bout={bout}
        open={open}
        saving={saving}
        onOpenChange={setOpen}
        onSave={async (scores) => {
          await onOverride(scores);
          setOpen(false);
        }}
      />
    </>
  );
}

function TournamentShell({
  children,
  nameControl,
}: {
  children: ReactNode;
  nameControl?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <div className="flex items-start gap-4">
            <Link to="/tournaments" className="shrink-0">
              <Button variant="outline" size="icon" aria-label="Back to tournaments">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="min-w-0 flex-1">
              {nameControl ?? (
                <h1 className="text-3xl font-display font-bold text-primary flex items-center gap-2">
                  <Trophy className="h-7 w-7 shrink-0" />
                  Tournament
                </h1>
              )}
            </div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function NameField({
  name,
  statusLabel,
  saving,
  onSave,
}: {
  name: string;
  statusLabel: string;
  saving: boolean;
  onSave: (name: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(name);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setDraft(name);
  }, [dirty, name]);

  const commit = async () => {
    const next = draft.trim().replace(/\s+/g, " ");
    if (!next) {
      setDraft(name);
      setDirty(false);
      return;
    }
    if (next === name) {
      setDraft(next);
      setDirty(false);
      return;
    }
    try {
      await onSave(next);
      setDirty(false);
    } catch {
      setDraft(name);
      setDirty(false);
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Trophy className="h-7 w-7 shrink-0 text-primary" />
        <Input
          value={draft}
          aria-label="Tournament name"
          disabled={saving}
          onChange={(event) => {
            setDraft(event.target.value);
            setDirty(true);
          }}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              setDraft(name);
              setDirty(false);
              event.currentTarget.blur();
            }
          }}
          className="text-3xl md:text-3xl font-display font-bold text-primary h-auto px-0 border-0 shadow-none focus-visible:ring-0 bg-transparent"
        />
      </div>
      <p className="text-muted-foreground">{statusLabel}</p>
    </div>
  );
}

function CheckInRow({
  id,
  name,
  checked,
  disabled,
  onToggle,
}: {
  id: string;
  name: string;
  checked: boolean;
  disabled: boolean;
  onToggle: (checked: boolean) => Promise<void>;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between gap-3">
        <label htmlFor={`check-in-${id}`} className="font-medium text-lg min-w-0 truncate">
          {name}
        </label>
        <Switch
          id={`check-in-${id}`}
          checked={checked}
          disabled={disabled}
          onCheckedChange={(next) => void onToggle(next)}
          aria-label={`Check in ${name}`}
        />
      </CardContent>
    </Card>
  );
}

function GuestCheckInForm({
  saving,
  onAdd,
}: {
  saving: boolean;
  onAdd: (input: { name: string; clubName?: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [clubName, setClubName] = useState("");

  const submit = async () => {
    const nextName = name.trim();
    if (!nextName || saving) return;
    await onAdd({ name: nextName, clubName });
    setName("");
    setClubName("");
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit().catch(() => {
          /* toast is handled by the caller */
        });
      }}
    >
      <h3 className="text-sm font-medium text-muted-foreground">Add guest</h3>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 space-y-2">
          <Label htmlFor="guest-name">Name</Label>
          <Input
            id="guest-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Guest name"
            autoComplete="off"
          />
        </div>
        <div className="flex-1 space-y-2">
          <Label htmlFor="guest-club">Club (optional)</Label>
          <Input
            id="guest-club"
            value={clubName}
            onChange={(event) => setClubName(event.target.value)}
            placeholder="Club"
            autoComplete="off"
          />
        </div>
        <Button type="submit" className="sm:self-end" disabled={saving || !name.trim()}>
          <UserPlus className="h-4 w-4 mr-2" />
          Add guest
        </Button>
      </div>
    </form>
  );
}

function nameFromParticipants(
  participants: TournamentParticipant[],
  fencerId: string | null
): string {
  if (!fencerId) return "TBD";
  return participants.find((row) => row.fencerId === fencerId)?.name ?? "Unknown";
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}
