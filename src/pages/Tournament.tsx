import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, Trophy } from "lucide-react";
import { toast } from "sonner";
import { ClubNav } from "@/components/ClubNav";
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
import { isPlayoffSize, playoffReadyToStart } from "@/lib/tournament/playoff";
import {
  TOURNAMENT_FORMAT_LABEL,
  TOURNAMENT_POINTS_SCHEME_LABEL,
  TOURNAMENT_STATUS_LABEL,
  type TournamentBout,
  type TournamentFormat,
  type TournamentPointsScheme,
} from "@/types/tournament";
import type { Fencer } from "@/types/fencing";
import type { StandingRow } from "@/lib/tournament/standings";

const LATER_FORMATS: TournamentFormat[] = ["groups_playoff", "swiss", "king_of_hill"];
const SCHEMES: TournamentPointsScheme[] = ["half", "binary", "football"];

export default function TournamentPage() {
  const { configured } = useAuth();
  const { id } = useParams<{ id: string }>();
  const tournament = useTournament(id);

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

  if (tournament.notFound || !tournament.tournament) {
    return (
      <TournamentShell>
        <p className="text-muted-foreground mb-4">This tournament was not found.</p>
        <Button asChild variant="secondary">
          <Link to="/tournaments">Back to tournaments</Link>
        </Button>
      </TournamentShell>
    );
  }

  const event = tournament.tournament;
  const canEditCheckIn = event.status === "setup";
  const checkedCount = tournament.checkedInIds.size;
  const fencerName = (fencerId: string | null) => nameFromRoster(tournament.roster, fencerId);

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

      <section className="space-y-4 mb-10">
        <div>
          <h2 className="text-lg font-medium">Check-in</h2>
          <p className="text-sm text-muted-foreground">
            Mark who is fencing today. The draw uses this list.
          </p>
        </div>

        {tournament.roster.isLoading ? (
          <p className="text-muted-foreground">Loading roster…</p>
        ) : tournament.roster.active.length === 0 ? (
          <p className="text-muted-foreground">
            No fencers in the roster.{" "}
            <Link to="/fencers" className="text-primary underline underline-offset-4">
              Add names on Fencers
            </Link>
            , then check them in here.
          </p>
        ) : (
          <ul className="space-y-3">
            {tournament.roster.active.map((fencer) => (
              <li key={fencer.id}>
                <CheckInRow
                  fencer={fencer}
                  checked={tournament.checkedInIds.has(fencer.id)}
                  disabled={
                    !canEditCheckIn || tournament.checkIn.isPending || tournament.checkOut.isPending
                  }
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

        {canEditCheckIn && tournament.roster.active.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            {checkedCount < 2
              ? "Check in at least two fencers to continue."
              : `${checkedCount} checked in.`}
          </p>
        ) : null}

        {canEditCheckIn ? null : (
          <p className="text-sm text-muted-foreground">Check-in is locked for this event.</p>
        )}
      </section>

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
          fencerName={fencerName}
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
  const [timeLimit, setTimeLimit] = useState(timeLimitSec ?? 90);
  const [pointsLimit, setPointsLimit] = useState(pointsLimitValue ?? 12);

  useEffect(() => {
    if (timeLimitSec != null) setTimeLimit(timeLimitSec);
    if (pointsLimitValue != null) setPointsLimit(pointsLimitValue);
  }, [timeLimitSec, pointsLimitValue]);

  if (!event) return null;

  const saveLimits = async (next: { timeLimitSec?: number; pointsLimit?: number }) => {
    try {
      await tournament.patch.mutateAsync(next);
    } catch (error) {
      toast.error(tournament.mutationError(error));
    }
  };

  const playoffOk = isPlayoffSize(tournament.checkedInIds.size);
  const canStart =
    event.format === "playoff"
      ? playoffReadyToStart(tournament.bouts)
      : event.format === "round_robin" &&
        Boolean(event.pointsScheme) &&
        tournament.bouts.length === tournament.expectedBoutCount &&
        tournament.expectedBoutCount > 0;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Format</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Round robin and playoff are available now. Other presets come later.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={event.format === "round_robin" ? "default" : "outline"}
            onClick={async () => {
              try {
                await tournament.patch.mutateAsync({ format: "round_robin" });
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
                await tournament.patch.mutateAsync({ format: "playoff" });
              } catch (error) {
                toast.error(tournament.mutationError(error));
              }
            }}
          >
            {TOURNAMENT_FORMAT_LABEL.playoff}
          </Button>
          {LATER_FORMATS.map((item) => (
            <Button key={item} type="button" variant="outline" disabled>
              {TOURNAMENT_FORMAT_LABEL[item]}
            </Button>
          ))}
        </div>
        {!playoffOk ? (
          <p className="text-sm text-muted-foreground mt-2">
            Playoff needs 2, 4, 8, 16, or 32 fencers.
          </p>
        ) : null}
      </div>

      {event.format === "playoff" ? null : (
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
        {tournament.bouts.length > 0
          ? `${tournament.bouts.length} of ${tournament.expectedBoutCount} bouts ready.`
          : "Choose a format, draw the bouts, then start."}
        {event.format === "round_robin" && !event.pointsScheme
          ? " Choose a points scheme to start."
          : null}
      </p>
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
  fencerName,
  finishing,
  overridingId,
  onOverride,
  onFinish,
}: {
  status: "live" | "done";
  format: TournamentFormat | null;
  bouts: TournamentBout[];
  queue: TournamentBout[];
  finishedBouts: TournamentBout[];
  standings: StandingRow[];
  fencerName: (id: string | null) => string;
  finishing: boolean;
  overridingId?: string;
  onOverride: (input: { id: string; blueScore: number; redScore: number }) => Promise<void>;
  onFinish: () => Promise<void>;
}) {
  const live = status === "live";
  const defaultTab = live ? "queue" : "table";

  return (
    <section className="space-y-4">
      <Tabs key={defaultTab} defaultValue={defaultTab}>
        <TabsList className={`grid w-full ${live ? "grid-cols-3" : "grid-cols-2"}`}>
          {live ? <TabsTrigger value="queue">Queue</TabsTrigger> : null}
          <TabsTrigger value="table">Table</TabsTrigger>
          <TabsTrigger value="bouts">Bouts</TabsTrigger>
        </TabsList>

        {live ? (
          <TabsContent value="queue" className="space-y-3">
            {format === "playoff" ? (
              <PlayoffBracket bouts={bouts} fencerName={fencerName} showStart />
            ) : queue.length === 0 ? (
              <p className="text-muted-foreground">No bouts left in the queue.</p>
            ) : (
              <ul className="space-y-3">
                {queue.map((bout) => (
                  <li key={bout.id}>
                    <Card>
                      <CardContent className="p-4 flex items-center justify-between gap-3">
                        <p className="min-w-0">
                          <span className="text-fencer-blue font-medium">
                            {fencerName(bout.blueFencerId)}
                          </span>
                          <span className="text-muted-foreground"> vs </span>
                          <span className="text-fencer-red font-medium">
                            {fencerName(bout.redFencerId)}
                          </span>
                        </p>
                        <Button asChild size="sm">
                          <Link to={`/?t=${bout.tournamentId}&b=${bout.id}`}>Start</Link>
                        </Button>
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        ) : null}

        <TabsContent value="table" className="space-y-3">
          {format === "playoff" ? (
            <PlayoffBracket bouts={bouts} fencerName={fencerName} showStart={false} />
          ) : standings.length === 0 ? (
            <p className="text-muted-foreground">Standings appear after bouts are saved.</p>
          ) : (
            <ul className="space-y-3">
              {standings.map((row) => (
                <li key={row.fencerId}>
                  <Card>
                    <CardContent className="p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{row.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatStandingPoints(row.points)} pts · {row.bouts}{" "}
                          {row.bouts === 1 ? "bout" : "bouts"}
                        </p>
                      </div>
                      <p className="font-mono tabular-nums text-sm shrink-0">
                        <span className="text-emerald-500">+{row.scored}</span>
                        <span className="text-muted-foreground"> / </span>
                        <span className="text-red-500">-{row.received}</span>
                      </p>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
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
            <div className="flex items-center justify-between gap-3 text-lg font-medium">
              <span className="text-fencer-blue min-w-0 truncate">{bout.blueName}</span>
              <span className="font-mono tabular-nums shrink-0">
                {bout.blueScore} – {bout.redScore}
              </span>
              <span className="text-fencer-red min-w-0 truncate text-right">{bout.redName}</span>
            </div>
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
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {nameControl ?? (
                    <h1 className="text-3xl font-display font-bold text-primary flex items-center gap-2">
                      <Trophy className="h-7 w-7 shrink-0" />
                      Tournament
                    </h1>
                  )}
                </div>
                <ClubNav className="hidden sm:flex shrink-0" />
              </div>
              <ClubNav className="flex sm:hidden mt-3" />
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
  fencer,
  checked,
  disabled,
  onToggle,
}: {
  fencer: Fencer;
  checked: boolean;
  disabled: boolean;
  onToggle: (checked: boolean) => Promise<void>;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between gap-3">
        <label htmlFor={`check-in-${fencer.id}`} className="font-medium text-lg min-w-0 truncate">
          {fencer.name}
        </label>
        <Switch
          id={`check-in-${fencer.id}`}
          checked={checked}
          disabled={disabled}
          onCheckedChange={(next) => void onToggle(next)}
          aria-label={`Check in ${fencer.name}`}
        />
      </CardContent>
    </Card>
  );
}

function nameFromRoster(
  roster: { active: Fencer[]; archived: Fencer[] },
  fencerId: string | null
): string {
  if (!fencerId) return "TBD";
  return (
    roster.active.find((fencer) => fencer.id === fencerId)?.name ??
    roster.archived.find((fencer) => fencer.id === fencerId)?.name ??
    "Unknown"
  );
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}
