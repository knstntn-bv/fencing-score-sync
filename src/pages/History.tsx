import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, History as HistoryIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";
import { useMatches } from "@/hooks/useMatches";
import { listHistoryPeople, matchOutcomeLabel } from "@/lib/matches";
import type { Match } from "@/types/fencing";

const ALL_FENCERS = "all";

export default function HistoryPage() {
  const { configured } = useAuth();
  const history = useMatches();
  const [fencerId, setFencerId] = useState(ALL_FENCERS);

  const people = useMemo(() => listHistoryPeople(history.matches), [history.matches]);
  const visible = useMemo(() => {
    if (fencerId === ALL_FENCERS) return history.matches;
    return history.matches.filter(
      (match) => match.blueFencerId === fencerId || match.redFencerId === fencerId
    );
  }, [fencerId, history.matches]);

  if (!configured) {
    return (
      <HistoryShell>
        <p className="text-muted-foreground">Connect Supabase to see bout history.</p>
      </HistoryShell>
    );
  }

  return (
    <HistoryShell>
      {people.length > 0 ? (
        <div className="mb-6 space-y-2">
          <Label htmlFor="history-fencer">Fencer</Label>
          <Select value={fencerId} onValueChange={setFencerId}>
            <SelectTrigger id="history-fencer" aria-label="Filter by fencer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FENCERS}>All fencers</SelectItem>
              {people.map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  {person.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {history.error ? <p className="text-sm text-destructive mb-4">{history.error}</p> : null}

      {history.isLoading ? (
        <p className="text-muted-foreground">Loading history…</p>
      ) : history.matches.length === 0 ? (
        <p className="text-muted-foreground">
          No bouts saved yet. Named matches appear here after Save result.
        </p>
      ) : visible.length === 0 ? (
        <p className="text-muted-foreground">No bouts for this fencer.</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((match) => (
            <li key={match.id}>
              <HistoryRow match={match} />
            </li>
          ))}
        </ul>
      )}
    </HistoryShell>
  );
}

function HistoryShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link to="/">
            <Button variant="outline" size="icon" aria-label="Back to scoreboard">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-display font-bold text-primary flex items-center gap-2">
              <HistoryIcon className="h-7 w-7" />
              History
            </h1>
            <p className="text-muted-foreground">Saved bouts, newest first.</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function HistoryRow({ match }: { match: Match }) {
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <p className="text-xs text-muted-foreground">
          {format(new Date(match.finishedAt), "d MMM yyyy, HH:mm")}
        </p>
        <div className="flex items-center justify-between gap-3 text-lg font-medium">
          <span className="text-fencer-blue min-w-0 truncate">{match.blueName}</span>
          <span className="font-mono tabular-nums shrink-0">
            {match.blueScore} – {match.redScore}
          </span>
          <span className="text-fencer-red min-w-0 truncate text-right">{match.redName}</span>
        </div>
        <p className="text-sm text-muted-foreground">{matchOutcomeLabel(match)}</p>
      </CardContent>
    </Card>
  );
}
