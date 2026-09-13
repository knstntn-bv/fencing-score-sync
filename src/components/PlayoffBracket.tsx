import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatPlaceholder } from "@/lib/tournament/groups";
import {
  PLAYOFF_ROUND_LABEL,
  canStartPlayoffSlot,
  groupPlayoffRounds,
  playoffPlaceLabel,
} from "@/lib/tournament/playoff";
import type { TournamentBout } from "@/types/tournament";

export function PlayoffBracket({
  bouts,
  fencerName,
  showStart,
}: {
  bouts: TournamentBout[];
  fencerName: (id: string | null) => string;
  showStart: boolean;
}) {
  const groups = groupPlayoffRounds(bouts);
  if (groups.length === 0) {
    return <p className="text-muted-foreground">No playoff bouts yet.</p>;
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.code} className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            {PLAYOFF_ROUND_LABEL[group.code]}
          </h3>
          <ul className="space-y-3">
            {group.bouts.map((bout) => (
              <li key={bout.id}>
                <PlayoffBoutCard bout={bout} fencerName={fencerName} showStart={showStart} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function PlayoffBoutCard({
  bout,
  fencerName,
  showStart,
}: {
  bout: TournamentBout;
  fencerName: (id: string | null) => string;
  showStart: boolean;
}) {
  const ready = canStartPlayoffSlot(bout);
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <PlayoffHalf
          name={sideLabel(bout.blueFencerId, bout.bluePlaceholder, fencerName)}
          empty={!bout.blueFencerId}
          placeholder={!bout.blueFencerId && Boolean(bout.bluePlaceholder)}
          score={bout.finishedAt ? bout.blueScore : null}
          label={playoffPlaceLabel(bout, "blue")}
          color="blue"
        />
        <PlayoffHalf
          name={sideLabel(bout.redFencerId, bout.redPlaceholder, fencerName)}
          empty={!bout.redFencerId}
          placeholder={!bout.redFencerId && Boolean(bout.redPlaceholder)}
          score={bout.finishedAt ? bout.redScore : null}
          label={playoffPlaceLabel(bout, "red")}
          color="red"
        />
        {showStart && ready ? (
          <div className="flex justify-end">
            <Button asChild size="sm">
              <Link to={`/?t=${bout.tournamentId}&b=${bout.id}`}>Start</Link>
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function sideLabel(
  fencerId: string | null,
  placeholder: string | null,
  fencerName: (id: string | null) => string
): string {
  if (fencerId) return fencerName(fencerId);
  return formatPlaceholder(placeholder);
}

function PlayoffHalf({
  name,
  empty,
  placeholder,
  score,
  label,
  color,
}: {
  name: string;
  empty: boolean;
  placeholder: boolean;
  score: number | null;
  label: string | null;
  color: "blue" | "red";
}) {
  const tone = color === "blue" ? "text-fencer-blue" : "text-fencer-red";
  const nameClass = empty ? "text-muted-foreground" : tone;
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`font-medium min-w-0 truncate ${placeholder || empty ? "text-muted-foreground" : nameClass}`}>
        {name}
      </span>
      <span className="shrink-0 font-mono tabular-nums text-sm">
        {score == null ? "" : score}
      </span>
      <span className="shrink-0 text-sm text-muted-foreground min-w-[5.5rem] text-right">
        {label ?? ""}
      </span>
    </div>
  );
}
