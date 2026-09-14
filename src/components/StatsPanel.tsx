import { useMemo } from "react";
import { FencerStatsCard } from "@/components/FencerStatsCard";
import { useAuth } from "@/context/AuthContext";
import { useFencers } from "@/hooks/useFencers";
import { useMatches } from "@/hooks/useMatches";
import { computeFencerStats } from "@/lib/fencerStats";

export function StatsPanel() {
  const { configured } = useAuth();
  const history = useMatches();
  const roster = useFencers();
  const stats = useMemo(
    () => computeFencerStats(history.matches, [...roster.active, ...roster.archived]),
    [history.matches, roster.active, roster.archived]
  );

  if (!configured) {
    return <p className="text-muted-foreground">Connect Supabase to see fencer stats.</p>;
  }

  if (history.error) {
    return <p className="text-sm text-destructive">{history.error}</p>;
  }

  if (history.isLoading) {
    return <p className="text-muted-foreground">Loading stats…</p>;
  }

  if (stats.length === 0) {
    return (
      <p className="text-muted-foreground">
        No bouts saved yet. Stats appear after named matches are saved.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {stats.map((row) => (
        <li key={row.id}>
          <FencerStatsCard stats={row} />
        </li>
      ))}
    </ul>
  );
}
