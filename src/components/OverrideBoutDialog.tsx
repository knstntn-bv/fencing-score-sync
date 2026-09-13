import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  overrideResults,
  parseOverrideScore,
  playoffOverrideBlock,
} from "@/lib/tournament/override";
import type { TournamentBout } from "@/types/tournament";

export function OverrideBoutDialog({
  bout,
  open,
  saving,
  onOpenChange,
  onSave,
}: {
  bout: TournamentBout;
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (scores: { blueScore: number; redScore: number }) => Promise<void>;
}) {
  const [blueDraft, setBlueDraft] = useState(String(bout.blueScore ?? 0));
  const [redDraft, setRedDraft] = useState(String(bout.redScore ?? 0));

  useEffect(() => {
    if (!open) return;
    setBlueDraft(String(bout.blueScore ?? 0));
    setRedDraft(String(bout.redScore ?? 0));
  }, [open, bout.blueScore, bout.redScore]);

  const blueScore = parseOverrideScore(blueDraft);
  const redScore = parseOverrideScore(redDraft);
  const scoresOk = blueScore != null && redScore != null;
  const unchanged = scoresOk && blueScore === bout.blueScore && redScore === bout.redScore;
  const playoffBlock = scoresOk ? playoffOverrideBlock(bout.stage, blueScore, redScore) : null;
  const preview = scoresOk && !playoffBlock ? overrideResults(blueScore, redScore) : null;
  const outcomeLabel = playoffBlock
    ? playoffBlock
    : preview?.blueResult === "draw"
      ? "Draw"
      : preview?.blueResult === "win"
        ? `${bout.blueName} won`
        : preview
          ? `${bout.redName} won`
          : "Enter two whole-number scores.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Correct score</DialogTitle>
          <DialogDescription>
            Standings will be recalculated. Unplayed slots may be rebuilt. Later saved bouts are not
            deleted. The pair stays the same.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor={`override-blue-${bout.id}`} className="text-fencer-blue">
              {bout.blueName}
            </Label>
            <Input
              id={`override-blue-${bout.id}`}
              inputMode="numeric"
              pattern="[0-9]*"
              value={blueDraft}
              disabled={saving}
              onChange={(event) => setBlueDraft(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`override-red-${bout.id}`} className="text-fencer-red">
              {bout.redName}
            </Label>
            <Input
              id={`override-red-${bout.id}`}
              inputMode="numeric"
              pattern="[0-9]*"
              value={redDraft}
              disabled={saving}
              onChange={(event) => setRedDraft(event.target.value)}
            />
          </div>
        </div>
        <p className={playoffBlock ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {outcomeLabel}
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!scoresOk || unchanged || Boolean(playoffBlock) || saving}
            onClick={() => {
              if (blueScore == null || redScore == null) return;
              void onSave({ blueScore, redScore });
            }}
          >
            {saving ? "Saving…" : "Update score"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
