import { useMemo, useState } from "react";
import { format } from "date-fns";
import { BarChart3, History as HistoryIcon } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { ClubPageHeader } from "@/components/ClubNav";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/context/AuthContext";
import { useMatches } from "@/hooks/useMatches";
import { listHistoryPeople, matchOutcomeLabel } from "@/lib/matches";
import { StatsPanel } from "@/components/StatsPanel";
import type { Match } from "@/types/fencing";

const ALL_FENCERS = "all";

export default function HistoryPage() {
  const [params, setSearchParams] = useSearchParams();
  const tab = params.get("tab") === "stats" ? "stats" : "history";

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto">
        <ClubPageHeader
          title={tab === "stats" ? "Stats" : "History"}
          subtitle={
            tab === "stats"
              ? "Record and frequent opponents, by fencer."
              : "Saved bouts, newest first."
          }
          icon={tab === "stats" ? BarChart3 : HistoryIcon}
        />
        <Tabs
          value={tab}
          onValueChange={(value) => {
            setSearchParams(value === "stats" ? { tab: "stats" } : {}, { replace: true });
          }}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="stats">Stats</TabsTrigger>
          </TabsList>
          <TabsContent value="history">
            <HistoryPanel />
          </TabsContent>
          <TabsContent value="stats">
            <StatsPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function HistoryPanel() {
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
    return <p className="text-muted-foreground">Connect Supabase to see bout history.</p>;
  }

  return (
    <>
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
    </>
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
