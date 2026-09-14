import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function BoutScoreline({
  blueName,
  redName,
  blueScore,
  redScore,
  className,
}: {
  blueName: string | null | undefined;
  redName: string | null | undefined;
  blueScore: ReactNode;
  redScore: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3",
        className
      )}
    >
      <span className="text-fencer-blue min-w-0 truncate" title={blueName ?? undefined}>
        {blueName}
      </span>
      <span className="font-mono tabular-nums text-center whitespace-nowrap min-w-[7ch]">
        {blueScore} – {redScore}
      </span>
      <span className="text-fencer-red min-w-0 truncate text-right" title={redName ?? undefined}>
        {redName}
      </span>
    </div>
  );
}
