export type BoutSelection =
  | { status: "ok"; mode: "anonymous" }
  | { status: "ok"; mode: "named"; blueId: string; redId: string }
  | { status: "invalid"; reason: "partial" | "same" };

export function resolveBoutSelection(
  blueId: string | null,
  redId: string | null
): BoutSelection {
  const blue = blueId || null;
  const red = redId || null;

  if (!blue && !red) {
    return { status: "ok", mode: "anonymous" };
  }
  if (!blue || !red) {
    return { status: "invalid", reason: "partial" };
  }
  if (blue === red) {
    return { status: "invalid", reason: "same" };
  }
  return { status: "ok", mode: "named", blueId: blue, redId: red };
}

export function canStartBout(blueId: string | null, redId: string | null): boolean {
  return resolveBoutSelection(blueId, redId).status === "ok";
}

export function boutSelectionMessage(selection: BoutSelection): string | null {
  if (selection.status !== "invalid") return null;
  if (selection.reason === "partial") {
    return "Select both fencers, or leave both anonymous.";
  }
  return "A fencer can't be on both sides.";
}
