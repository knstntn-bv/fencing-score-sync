import type { SaveMatchInput } from "./matches";
import { createMatchOutboxStore } from "./matchOutboxStore";
import { createOutboxSync } from "./matchOutboxSync";
import { saveMatch } from "./matches";
import { isNetworkError } from "./networkError";

export const OUTBOX_CHANGED_EVENT = "fencing-outbox-changed";
export const OUTBOX_RETRY_EVENT = "fencing-outbox-retry";
let channel: BroadcastChannel | null = null;
let store: ReturnType<typeof createMatchOutboxStore> | null = null;
function notify() {
  window.dispatchEvent(new Event(OUTBOX_CHANGED_EVENT));
  try { channel?.postMessage("changed"); } catch { /* Local notification already delivered. */ }
}
export function getMatchOutboxStore() {
  if (!store) {
    if (!("indexedDB" in window)) throw new Error("Saved bouts storage is unavailable on this device.");
    if ("BroadcastChannel" in window) {
      try {
        channel = new BroadcastChannel("fencing-scorer-outbox");
        channel.onmessage = () => window.dispatchEvent(new Event(OUTBOX_CHANGED_EVENT));
      } catch { /* Cross-tab notifications are optional; transactions still protect data. */ }
    }
    store = createMatchOutboxStore(window.indexedDB, {
      getItem: key => window.localStorage.getItem(key),
      removeItem: key => window.localStorage.removeItem(key),
    }, notify);
  }
  return store;
}
export const flushMatchOutbox = createOutboxSync(
  {
    read: clubId => getMatchOutboxStore().read(clubId),
    enqueue: (clubId, payload) => getMatchOutboxStore().enqueue(clubId, payload),
    remove: (clubId, id) => getMatchOutboxStore().remove(clubId, id),
    setError: (clubId, id, error) => getMatchOutboxStore().setError(clubId, id, error),
  },
  saveMatch,
  isNetworkError,
  (clubId, work) => navigator.locks
    ? navigator.locks.request("fencing-outbox-upload:" + clubId, work)
    : work(),
);
export const enqueueMatchOutbox = (clubId: string, payload: SaveMatchInput) => getMatchOutboxStore().enqueue(clubId, payload);
export function retryMatchOutbox() {
  window.dispatchEvent(new Event(OUTBOX_RETRY_EVENT));
}
