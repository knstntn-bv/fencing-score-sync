import { Card, CardContent } from "@/components/ui/card";
import { opponentLabel, recordLabel, type FencerStats } from "@/lib/fencerStats";

export function FencerStatsCard({ stats }: { stats: FencerStats }) {
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
