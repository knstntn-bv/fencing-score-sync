import { Trophy } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function TournamentScoreboardBar({
  name,
  tournamentId,
}: {
  name: string;
  tournamentId: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm">
      <span className="inline-flex items-center gap-2 font-medium text-primary min-w-0">
        <Trophy className="h-4 w-4 shrink-0" />
        <span className="truncate">{name}</span>
      </span>
      <Button asChild variant="link" className="h-auto p-0">
        <Link to={`/tournaments/${tournamentId}`}>Back to event</Link>
      </Button>
    </div>
  );
}
