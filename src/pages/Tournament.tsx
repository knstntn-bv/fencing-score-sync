import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Trophy } from "lucide-react";
import { toast } from "sonner";
import { ClubNav } from "@/components/ClubNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/context/AuthContext";
import { useTournament } from "@/hooks/useTournament";
import { TOURNAMENT_STATUS_LABEL } from "@/types/tournament";
import type { Fencer } from "@/types/fencing";

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

      <section className="space-y-4">
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
    </TournamentShell>
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
