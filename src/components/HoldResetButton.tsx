import { useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

const HOLD_MS = 1000;

type HoldResetButtonProps = {
  disabled: boolean;
  onReset: () => void;
};

export default function HoldResetButton({ disabled, onReset }: HoldResetButtonProps) {
  const [holding, setHolding] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const cancelHold = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setHolding(false);
  };

  const startHold = () => {
    if (disabled || timeoutRef.current !== null) return;
    setHolding(true);
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      setHolding(false);
      onReset();
    }, HOLD_MS);
  };

  return (
    <Button
      type="button"
      variant="control"
      size="lg"
      disabled={disabled}
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      onMouseDown={startHold}
      onMouseUp={cancelHold}
      onMouseLeave={cancelHold}
      onTouchStart={(event) => {
        event.preventDefault();
        startHold();
      }}
      onTouchEnd={cancelHold}
      onContextMenu={(event) => event.preventDefault()}
      className="relative overflow-hidden min-w-[12rem] select-none"
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 bg-primary/25"
        style={{
          width: holding ? "100%" : "0%",
          transition: holding ? `width ${HOLD_MS}ms linear` : "width 120ms ease-out",
        }}
      />
      <span className="relative z-10 flex items-center">
        <RotateCcw className="h-4 w-4 mr-2" />
        {holding ? "Hold to reset…" : "Reset match"}
      </span>
    </Button>
  );
}
