import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WinnerSide } from "@/lib/boutOutcome";

type SaveResultButtonProps = {
  anonymous: boolean;
  timerRunning: boolean;
  scoreLeader: WinnerSide | null;
  saved: boolean;
  saving: boolean;
  onSave: () => void;
};

export default function SaveResultButton({
  anonymous,
  timerRunning,
  scoreLeader,
  saved,
  saving,
  onSave,
}: SaveResultButtonProps) {
  const disabled = anonymous || timerRunning || saved || saving;
  const label = anonymous
    ? "Save result"
    : saved
      ? "Saved"
      : scoreLeader
        ? "Save victory"
        : "Save draw";

  return (
    <Button
      type="button"
      size="lg"
      disabled={disabled}
      onClick={onSave}
      className="relative overflow-hidden min-w-[12rem]"
    >
      {!anonymous && scoreLeader === 1 ? (
        <span
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-2 bg-fencer-blue"
        />
      ) : null}
      {!anonymous && scoreLeader === 2 ? (
        <span
          aria-hidden
          className="absolute right-0 top-0 bottom-0 w-2 bg-fencer-red"
        />
      ) : null}
      <Save className="h-4 w-4 mr-2" />
      {saving ? "Saving…" : label}
    </Button>
  );
}
