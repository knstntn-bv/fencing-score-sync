import type { ReactNode } from "react";
import { format } from "date-fns";
import { Plus, Trophy } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ClubPageHeader } from "@/components/ClubNav";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { useTournaments } from "@/hooks/useTournaments";
import {
  TOURNAMENT_FORMAT_LABEL,
  TOURNAMENT_STATUS_LABEL,
  type Tournament,
} from "@/types/tournament";

export default function TournamentsPage() {
  const { configured } = useAuth();
  const tournaments = useTournaments();
  const navigate = useNavigate();

  const handleCreate = async () => {
    try {
      const created = await tournaments.create.mutateAsync();
      toast.success("Tournament created");
      navigate(`/tournaments/${created.id}`);
    } catch (error) {
      toast.error(tournaments.mutationError(error));
    }
  };

  if (!configured) {
    return (
      <TournamentsShell>
        <p className="text-muted-foreground">Connect Supabase to manage tournaments.</p>
      </TournamentsShell>
    );
  }

  return (
    <TournamentsShell>
      <div className="mb-6">
        <Button onClick={() => void handleCreate()} disabled={tournaments.create.isPending}>
          <Plus className="h-4 w-4 mr-2" />
          New tournament
        </Button>
      </div>

      {tournaments.error ? (
        <p className="text-sm text-destructive mb-4">{tournaments.error}</p>
      ) : null}

      {tournaments.isLoading ? (
        <p className="text-muted-foreground">Loading tournaments…</p>
      ) : tournaments.tournaments.length === 0 ? (
        <p className="text-muted-foreground">No tournaments yet. Start one for this club.</p>
      ) : (
        <ul className="space-y-3">
          {tournaments.tournaments.map((tournament) => (
            <li key={tournament.id}>
              <TournamentCard
                tournament={tournament}
                deleting={tournaments.remove.isPending}
                onDelete={async () => {
                  try {
                    await tournaments.remove.mutateAsync(tournament.id);
                    toast.success("Tournament deleted");
                  } catch (error) {
                    toast.error(tournaments.mutationError(error));
                  }
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </TournamentsShell>
  );
}

function TournamentsShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto">
        <ClubPageHeader
          title="Tournaments"
          subtitle="Club events. In progress and finished stay here."
          icon={Trophy}
        />
        {children}
      </div>
    </div>
  );
}

function TournamentCard({
  tournament,
  deleting,
  onDelete,
}: {
  tournament: Tournament;
  deleting: boolean;
  onDelete: () => Promise<void>;
}) {
  return (
    <Card>
      <CardContent className="p-0 flex items-stretch">
        <Link
          to={`/tournaments/${tournament.id}`}
          className="min-w-0 flex-1 p-4 space-y-1"
          aria-label={`Open ${tournament.name}`}
        >
          <p className="font-medium text-lg truncate">{tournament.name}</p>
          <p className="text-sm text-muted-foreground">
            {TOURNAMENT_STATUS_LABEL[tournament.status]}
            {tournament.format ? ` · ${TOURNAMENT_FORMAT_LABEL[tournament.format]}` : null}
          </p>
          <p className="text-xs text-muted-foreground">
            {format(new Date(tournament.createdAt), "d MMM yyyy")}
          </p>
        </Link>
        <div className="p-4 shrink-0">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={deleting}>
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {tournament.name}?</AlertDialogTitle>
                <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void onDelete()}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
