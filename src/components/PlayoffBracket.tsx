import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatPlaceholder, playoffBoutHeld, playoffSideHeld } from "@/lib/tournament/groups";
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
  pendingGroupNos = [],
}: {
  bouts: TournamentBout[];
  fencerName: (id: string | null) => string;
  showStart: boolean;
  pendingGroupNos?: number[];
}) {
  const groups = groupPlayoffRounds(bouts);
  if (groups.length === 0) {
    return <p className="text-muted-foreground">No playoff bouts yet.</p>;
  }
  const pending = new Set(pendingGroupNos);

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
                <PlayoffBoutCard
                  bout={bout}
                  fencerName={fencerName}
                  showStart={showStart}
                  pendingGroupNos={pending}
                />
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
  pendingGroupNos,
}: {
  bout: TournamentBout;
  fencerName: (id: string | null) => string;
  showStart: boolean;
  pendingGroupNos: ReadonlySet<number>;
}) {
  const held = playoffBoutHeld(bout, pendingGroupNos);
  const ready = !held && canStartPlayoffSlot(bout);
  return (
    <Card className={held ? "opacity-40" : undefined}>
      <CardContent className="p-4 space-y-3">
        <PlayoffHalf
          name={sideLabel(bout.blueFencerId, bout.bluePlaceholder, fencerName, pendingGroupNos)}
          empty={!bout.blueFencerId || playoffSideHeld(bout.bluePlaceholder, pendingGroupNos)}
          placeholder={
            playoffSideHeld(bout.bluePlaceholder, pendingGroupNos) ||
            (!bout.blueFencerId && Boolean(bout.bluePlaceholder))
          }
          score={bout.finishedAt ? bout.blueScore : null}
          label={held ? null : playoffPlaceLabel(bout, "blue")}
          color="blue"
        />
        <PlayoffHalf
          name={sideLabel(bout.redFencerId, bout.redPlaceholder, fencerName, pendingGroupNos)}
          empty={!bout.redFencerId || playoffSideHeld(bout.redPlaceholder, pendingGroupNos)}
          placeholder={
            playoffSideHeld(bout.redPlaceholder, pendingGroupNos) ||
            (!bout.redFencerId && Boolean(bout.redPlaceholder))
          }
          score={bout.finishedAt ? bout.redScore : null}
          label={held ? null : playoffPlaceLabel(bout, "red")}
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
  fencerName: (id: string | null) => string,
  pendingGroupNos: ReadonlySet<number>
): string {
  if (playoffSideHeld(placeholder, pendingGroupNos)) return formatPlaceholder(placeholder);
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
  const nameClass = empty || placeholder ? "text-muted-foreground" : tone;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
      <span className={`font-medium min-w-0 truncate ${nameClass}`} title={name}>
        {name}
      </span>
      <span className="font-mono tabular-nums text-sm text-center whitespace-nowrap min-w-[1.5rem]">
        {score == null ? "" : score}
      </span>
      <span className="text-sm text-muted-foreground min-w-0 truncate text-right">
        {label ?? ""}
      </span>
    </div>
  );
}
