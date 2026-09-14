import { useMemo, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { BarChart3 } from "lucide-react";
import { ClubPageHeader } from "@/components/ClubNav";
import { FencerStatsCard } from "@/components/FencerStatsCard";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useFencers } from "@/hooks/useFencers";
import { useMatches } from "@/hooks/useMatches";
import { statsForFencer } from "@/lib/fencerStats";

export default function FencerStatsPage() {
  const { id } = useParams<{ id: string }>();
  const { configured } = useAuth();
  const roster = useFencers();
  const history = useMatches();
  const fencer = useMemo(
    () => [...roster.active, ...roster.archived].find((row) => row.id === id),
    [id, roster.active, roster.archived]
  );
  const stats = useMemo(() => {
    if (!fencer) return null;
    const rosterById = new Map(
      [...roster.active, ...roster.archived].map((row) => [row.id, row])
    );
    return statsForFencer(
      fencer.id,
      fencer.name,
      Boolean(fencer.archivedAt),
      history.matches,
      (opponentId, snapshot) => rosterById.get(opponentId)?.name ?? snapshot
    );
  }, [fencer, history.matches, roster.active, roster.archived]);

  if (!configured) {
    return (
      <FencerStatsShell title="Stats" subtitle="Record and frequent opponents.">
        <p className="text-muted-foreground">Connect Supabase to see fencer stats.</p>
      </FencerStatsShell>
    );
  }

  if (roster.isLoading || history.isLoading) {
    return (
      <FencerStatsShell title="Stats" subtitle="Record and frequent opponents.">
        <p className="text-muted-foreground">Loading stats…</p>
      </FencerStatsShell>
    );
  }

  if (!fencer || !stats) {
    return (
      <FencerStatsShell title="Stats" subtitle="Record and frequent opponents.">
        <p className="text-muted-foreground mb-4">This fencer was not found.</p>
        <Button asChild variant="secondary">
          <Link to="/fencers">Back to roster</Link>
        </Button>
      </FencerStatsShell>
    );
  }

  return (
    <FencerStatsShell
      title={fencer.name}
      subtitle="Record and frequent opponents."
    >
      {history.error ? <p className="text-sm text-destructive mb-4">{history.error}</p> : null}
      <FencerStatsCard stats={stats} />
    </FencerStatsShell>
  );
}

function FencerStatsShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto">
        <ClubPageHeader
          title={title}
          subtitle={subtitle}
          icon={BarChart3}
          backTo="/fencers"
          backLabel="Back to roster"
        />
        {children}
      </div>
    </div>
  );
}
