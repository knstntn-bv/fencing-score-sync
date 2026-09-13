import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { groupTitle } from "@/lib/tournament/groups";
import type { StandingRow } from "@/lib/tournament/standings";

export function CutoffTieDialog({
  groupNo,
  remaining,
  candidates,
  savingId,
  onPick,
}: {
  groupNo: number;
  remaining: number;
  candidates: StandingRow[];
  savingId?: string;
  onPick: (fencerId: string) => Promise<void>;
}) {
  return (
    <Dialog open>
      <DialogContent
        className="[&>button]:hidden"
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Pick who advances</DialogTitle>
          <DialogDescription>
            {groupTitle(groupNo)} is tied on points and touches. Choose{" "}
            {remaining === 1 ? "one fencer" : `${remaining} fencers, one at a time`} to go through
            to the playoff.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {candidates.map((row) => (
            <Button
              key={row.fencerId}
              type="button"
              variant="outline"
              className="justify-between h-auto py-3"
              disabled={Boolean(savingId)}
              onClick={() => void onPick(row.fencerId)}
            >
              <span className="font-medium truncate">{row.name}</span>
              {savingId === row.fencerId ? <span className="text-muted-foreground">Saving…</span> : null}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
