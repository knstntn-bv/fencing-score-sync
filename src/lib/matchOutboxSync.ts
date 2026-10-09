import type { SaveMatchInput } from "@/lib/matches";
import type { MatchOutboxStore } from "./matchOutboxStore";

export type OutboxReport = { uploaded: number; failed: number; error: string | null };
export function outboxErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "Could not upload the saved bouts.";
}
export function createOutboxSync(
  store: MatchOutboxStore,
  send: (payload: SaveMatchInput) => Promise<unknown>,
  isNetworkError: (error: unknown) => boolean,
  exclusive: (clubId: string, work: () => Promise<OutboxReport>) => Promise<OutboxReport> = (_, work) => work(),
) {
  const running = new Map<string, {
    task: Promise<OutboxReport>;
    state: { again: boolean; guard: () => boolean };
  }>();
  return (clubId: string, canContinue: () => boolean = () => true): Promise<OutboxReport> => {
    const existing = running.get(clubId);
    if (existing) {
      existing.state.again = true;
      existing.state.guard = canContinue;
      return existing.task;
    }
    const state = { again: false, guard: canContinue };
    const task = Promise.resolve().then(() => exclusive(clubId, async () => {
      const report: OutboxReport = { uploaded: 0, failed: 0, error: null };
      try {
        do {
          state.again = false;
          const allowed = state.guard;
          if (!allowed()) break;
          const pending = await store.read(clubId);
          for (const entry of pending) {
            if (!allowed()) break;
            try {
              await send(entry.payload);
              await store.remove(clubId, entry.id);
              report.uploaded++;
            } catch (error) {
              report.failed++;
              report.error = outboxErrorMessage(error);
              await store.setError(clubId, entry.id, report.error);
              if (isNetworkError(error)) break;
            }
          }
        } while (state.again);
        report.error = (await store.read(clubId)).find(entry => entry.error)?.error ?? null;
      } catch (error) { report.error = outboxErrorMessage(error); }
      return report;
    })).finally(() => { running.delete(clubId); });
    running.set(clubId, { task, state });
    return task;
  };
}
