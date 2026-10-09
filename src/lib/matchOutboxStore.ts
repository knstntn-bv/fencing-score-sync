import type { SaveMatchInput } from "@/lib/matches";

export type OutboxEntry = { clubId: string; id: string; payload: SaveMatchInput; error: string | null };
export const LEGACY_OUTBOX_PREFIX = "fencing-scorer:v1:outbox:matches:";

function validPayload(value: unknown, clubId: string): value is SaveMatchInput {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  const strings = ["id", "blueFencerId", "redFencerId", "blueName", "redName", "startedAt", "finishedAt"];
  const numbers = ["blueScore", "redScore", "timeLimitSec", "pointsLimit", "remainingSec"];
  return item.clubId === clubId && strings.every(key => typeof item[key] === "string" && item[key] !== "") &&
    numbers.every(key => typeof item[key] === "number" && Number.isFinite(item[key])) &&
    ["win", "lose", "draw"].includes(String(item.blueResult)) &&
    ["win", "lose", "draw"].includes(String(item.redResult));
}

export function createMatchOutboxStore(factory: IDBFactory, legacy: Pick<Storage, "getItem" | "removeItem">, changed: () => void = () => {}) {
  let database: Promise<IDBDatabase> | null = null;
  const open = () => {
    if (!database) {
      database = new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open("fencing-scorer-outbox", 1);
        request.onupgradeneeded = () => {
          const entries = request.result.createObjectStore("matches", { keyPath: ["clubId", "id"] });
          entries.createIndex("clubId", "clubId");
          request.result.createObjectStore("migrations");
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("Close other app tabs to open the saved bouts queue."));
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => { db.close(); database = null; };
          resolve(db);
        };
      }).catch(error => { database = null; throw error; });
    }
    return database;
  };
  async function transaction<T>(stores: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction, result: (value: T) => void) => void): Promise<T> {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let value: T;
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(tx.error ?? new Error("Could not update the saved bouts queue."));
      tx.onerror = () => { /* onabort reports transaction failure. */ };
      try { work(tx, next => { value = next; }); }
      catch (error) { tx.abort(); reject(error); }
    });
  }
  async function migrate(clubId: string) {
    const migrated = await transaction<boolean>(["migrations"], "readonly", (tx, result) => {
      const request = tx.objectStore("migrations").get(clubId);
      request.onsuccess = () => result(request.result === true);
    });
    if (migrated) return;
    const key = LEGACY_OUTBOX_PREFIX + clubId;
    const raw = legacy.getItem(key);
    let items: SaveMatchInput[] = [];
    if (raw !== null) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed) || !parsed.every(item => validPayload(item, clubId)) ||
          new Set(parsed.map(item => item.id)).size !== parsed.length) throw new Error("Invalid queue");
        items = parsed;
      } catch {
        throw new Error("The old saved bouts queue is damaged. Original data was kept; migration was stopped.");
      }
    }
    await transaction<void>(["matches", "migrations"], "readwrite", tx => {
      const markers = tx.objectStore("migrations");
      const check = markers.get(clubId);
      check.onsuccess = () => {
        if (check.result === true) return;
        const entries = tx.objectStore("matches");
        for (const payload of items) entries.add({ clubId, id: payload.id, payload, error: null } satisfies OutboxEntry);
        markers.put(true, clubId);
      };
    });
    try { if (raw !== null && legacy.getItem(key) === raw) legacy.removeItem(key); } catch { /* Migration marker prevents re-import. */ }
    changed();
  }
  return {
    async read(clubId: string): Promise<OutboxEntry[]> {
      await migrate(clubId);
      return transaction<OutboxEntry[]>(["matches"], "readonly", (tx, result) => {
        const request = tx.objectStore("matches").index("clubId").getAll(clubId);
        request.onsuccess = () => result(request.result);
      });
    },
    async enqueue(clubId: string, payload: SaveMatchInput): Promise<void> {
      if (!validPayload(payload, clubId)) throw new Error("Cannot save a bout for a different club or with invalid data.");
      await migrate(clubId);
      await transaction<void>(["matches"], "readwrite", tx => {
        const entries = tx.objectStore("matches");
        const request = entries.get([clubId, payload.id]);
        request.onsuccess = () => {
          if (!request.result) entries.add({ clubId, id: payload.id, payload, error: null } satisfies OutboxEntry);
          else if (Object.keys(payload).some(key =>
            request.result.payload[key] !== payload[key as keyof SaveMatchInput])) tx.abort();
        };
      });
      changed();
    },
    async remove(clubId: string, id: string): Promise<void> {
      await transaction<void>(["matches"], "readwrite", tx => { tx.objectStore("matches").delete([clubId, id]); });
      changed();
    },
    async setError(clubId: string, id: string, error: string): Promise<void> {
      await transaction<void>(["matches"], "readwrite", tx => {
        const entries = tx.objectStore("matches");
        const request = entries.get([clubId, id]);
        request.onsuccess = () => { if (request.result) entries.put({ ...request.result, error }); };
      });
      changed();
    },
  };
}
export type MatchOutboxStore = ReturnType<typeof createMatchOutboxStore>;
