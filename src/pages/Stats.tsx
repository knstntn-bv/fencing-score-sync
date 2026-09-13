import { useMemo, type ReactNode } from "react";
import { BarChart3 } from "lucide-react";
import { ClubPageHeader } from "@/components/ClubNav";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { useFencers } from "@/hooks/useFencers";
import { useMatches } from "@/hooks/useMatches";
import { computeFencerStats, opponentLabel, recordLabel } from "@/lib/fencerStats";
import type { FencerStats } from "@/lib/fencerStats";

export default function StatsPage() {
  const { configured } = useAuth();
  const history = useMatches();
  const roster = useFencers();
  const stats = useMemo(
    () => computeFencerStats(history.matches, [...roster.active, ...roster.archived]),
    [history.matches, roster.active, roster.archived]
  );

  if (!configured) {
    return (
      <StatsShell>
        <p className="text-muted-foreground">Connect Supabase to see fencer stats.</p>
      </StatsShell>
    );
  }

  return (
    <StatsShell>
      {history.error ? <p className="text-sm text-destructive mb-4">{history.error}</p> : null}

      {history.isLoading ? (
        <p className="text-muted-foreground">Loading stats…</p>
      ) : stats.length === 0 ? (
        <p className="text-muted-foreground">
          No bouts saved yet. Stats appear after named matches are saved.
        </p>
      ) : (
        <ul className="space-y-3">
          {stats.map((row) => (
            <li key={row.id}>
              <StatsCard stats={row} />
            </li>
          ))}
        </ul>
      )}
    </StatsShell>
  );
}

function StatsShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto">
        <ClubPageHeader
          title="Stats"
          subtitle="Record and frequent opponents, by fencer."
          icon={BarChart3}
        />
        {children}
      </div>
    </div>
  );
}

function StatsCard({ stats }: { stats: FencerStats }) {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div>
          <p className="text-lg font-medium">
            {stats.name}
            {stats.archived ? (
              <span className="ml-2 text-xs text-muted-foreground font-normal">Archived</span>
            ) : null}
          </p>
          <p className="text-sm text-muted-foreground">
            {recordLabel(stats.bouts, "bout", "bouts")}
            {" · "}
            {recordLabel(stats.wins, "win", "wins")}
            {" · "}
            {recordLabel(stats.losses, "loss", "losses")}
            {" · "}
            {recordLabel(stats.draws, "draw", "draws")}
          </p>
        </div>
        <dl className="grid gap-2 text-sm">
          <StatLine label="Most bouts vs" value={opponentLabel(stats.mostBoutsVs)} />
          <StatLine label="Most wins vs" value={opponentLabel(stats.mostWinsVs)} />
          <StatLine label="Most losses vs" value={opponentLabel(stats.mostLossesVs)} />
        </dl>
      </CardContent>
    </Card>
  );
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
