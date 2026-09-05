import type { SaveMatchInput } from "@/lib/matches";

const STORAGE_PREFIX = "fencing-scorer:v1:outbox:matches:";
export const OUTBOX_CHANGED_EVENT = "fencing-outbox-changed";

function storageKey(clubId: string): string {
  return `${STORAGE_PREFIX}${clubId}`;
}

function notify(): void {
  window.dispatchEvent(new Event(OUTBOX_CHANGED_EVENT));
}

export function readMatchOutbox(clubId: string): SaveMatchInput[] {
  try {
    const raw = localStorage.getItem(storageKey(clubId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SaveMatchInput[];
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.id === "string") : [];
  } catch {
    return [];
  }
}

export function writeMatchOutbox(clubId: string, items: SaveMatchInput[]): void {
  try {
    if (items.length === 0) {
      localStorage.removeItem(storageKey(clubId));
    } else {
      localStorage.setItem(storageKey(clubId), JSON.stringify(items));
    }
  } catch {
    // Ignore quota / private-mode failures.
  }
  notify();
}

export function enqueueMatchOutbox(clubId: string, item: SaveMatchInput): void {
  const pending = readMatchOutbox(clubId).filter((entry) => entry.id !== item.id);
  writeMatchOutbox(clubId, [...pending, item]);
}

export function matchOutboxCount(clubId: string): number {
  return readMatchOutbox(clubId).length;
}
