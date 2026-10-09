import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { IDBFactory } from "fake-indexeddb";
import ts from "typescript";

function load(name, dependencies = {}) {
  const exports = {};
  const source = readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8");
  runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, require: name => dependencies[name] });
  return exports;
}
const { createMatchOutboxStore, LEGACY_OUTBOX_PREFIX } = load("matchOutboxStore");
const { createOutboxSync } = load("matchOutboxSync");
const payload = (id, clubId = "club") => ({
  id, clubId, blueFencerId: "blue", redFencerId: "red", blueName: "Blue", redName: "Red",
  blueScore: 5, redScore: 3, blueResult: "win", redResult: "lose", timeLimitSec: 90,
  pointsLimit: 12, remainingSec: 10, startedAt: "2026-10-09T10:00:00Z", finishedAt: "2026-10-09T10:01:20Z",
});
function storage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: key => data.get(key) ?? null, removeItem: key => data.delete(key) };
}
const create = (legacy = storage(), factory = new IDBFactory()) => createMatchOutboxStore(factory, legacy);
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const isNetwork = error => error.message === "offline";

test("migration imports once even when legacy cleanup fails", async () => {
  const legacy = storage({ [LEGACY_OUTBOX_PREFIX + "club"]: JSON.stringify([payload("a")]) });
  legacy.removeItem = () => { throw new Error("denied"); };
  const factory = new IDBFactory();
  const store = create(legacy, factory);
  assert.equal((await store.read("club")).length, 1);
  await store.remove("club", "a");
  assert.equal((await create(legacy, factory).read("club")).length, 0);
  assert.ok(legacy.getItem(LEGACY_OUTBOX_PREFIX + "club"));
});

test("damaged or wrong-club legacy data is preserved and blocks migration", async () => {
  for (const raw of ["broken json", JSON.stringify([payload("a", "other")]), JSON.stringify([payload("a"), { id: "broken" }])]) {
    const legacy = storage({ [LEGACY_OUTBOX_PREFIX + "club"]: raw });
    await assert.rejects(create(legacy).read("club"), /damaged/);
    assert.equal(legacy.getItem(LEGACY_OUTBOX_PREFIX + "club"), raw);
  }
});

test("failed migration commit never deletes the source", async () => {
  const factory = new IDBFactory();
  const legacy = storage({ [LEGACY_OUTBOX_PREFIX + "club"]: JSON.stringify([payload("a")]) });
  const open = factory.open.bind(factory);
  factory.open = (...args) => {
    const request = open(...args);
    request.addEventListener("success", () => {
      const db = request.result;
      const transaction = db.transaction.bind(db);
      db.transaction = (...options) => {
        const tx = transaction(...options);
        if (options[1] === "readwrite") queueMicrotask(() => tx.abort());
        return tx;
      };
    });
    return request;
  };
  await assert.rejects(create(legacy, factory).read("club"));
  assert.ok(legacy.getItem(LEGACY_OUTBOX_PREFIX + "club"));
});

test("unavailable storage rejects instead of reporting a saved bout", async () => {
  const store = createMatchOutboxStore({ open() { throw new Error("storage unavailable"); } }, storage());
  await assert.rejects(store.enqueue("club", payload("a")), /unavailable/);
});

test("an aborted enqueue transaction never acknowledges the new result", async () => {
  const factory = new IDBFactory();
  let abortWrites = false;
  const open = factory.open.bind(factory);
  factory.open = (...args) => {
    const request = open(...args);
    request.addEventListener("success", () => {
      const db = request.result;
      const transaction = db.transaction.bind(db);
      db.transaction = (...options) => {
        const tx = transaction(...options);
        if (abortWrites && options[1] === "readwrite") queueMicrotask(() => tx.abort());
        return tx;
      };
    });
    return request;
  };
  const store = create(storage(), factory);
  await store.read("club");
  abortWrites = true;
  await assert.rejects(store.enqueue("club", payload("a")));
  assert.equal((await store.read("club")).length, 0);
});

test("a lost server response keeps the same ID for a safe retry", async () => {
  const store = create();
  await store.enqueue("club", payload("a"));
  const server = new Set();
  let loseResponse = true;
  const sync = createOutboxSync(store, async item => {
    server.add(item.id);
    if (loseResponse) { loseResponse = false; throw new Error("offline"); }
  }, isNetwork);
  await sync("club");
  assert.equal((await store.read("club"))[0].payload.id, "a");
  const report = await sync("club");
  assert.equal(server.size, 1);
  assert.equal(report.uploaded, 1);
  assert.equal(report.error, null);
  assert.equal((await store.read("club")).length, 0);
});

test("concurrent tabs and uploads do not overwrite newly queued results", async () => {
  const factory = new IDBFactory();
  const first = create(storage(), factory);
  const second = create(storage(), factory);
  await Promise.all([first.enqueue("club", payload("a")), second.enqueue("club", payload("b"))]);
  const started = deferred();
  const finish = deferred();
  const sync = createOutboxSync(first, async item => {
    if (item.id === "a") { started.resolve(); await finish.promise; }
  }, isNetwork);
  const uploading = sync("club");
  await started.promise;
  await second.enqueue("club", payload("c"));
  finish.resolve();
  await uploading;
  assert.deepEqual(Array.from(await first.read("club"), entry => entry.id), ["c"]);
});

test("server rejection stays queued while following valid bouts upload", async () => {
  const store = create();
  await store.enqueue("club", payload("a"));
  await store.enqueue("club", payload("b"));
  const report = await createOutboxSync(store, async item => {
    if (item.id === "a") throw new Error("access denied");
  }, isNetwork)("club");
  assert.equal(report.uploaded, 1);
  const entries = await store.read("club");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].error, "access denied");
});

test("offline stops the pass and preserves all unconfirmed bouts", async () => {
  const store = create();
  await store.enqueue("club", payload("a"));
  await store.enqueue("club", payload("b"));
  let requests = 0;
  const report = await createOutboxSync(store, async () => { requests++; throw new Error("offline"); }, isNetwork)("club");
  assert.equal(requests, 1);
  assert.equal(report.uploaded, 0);
  assert.equal((await store.read("club")).length, 2);
});

test("simultaneous retries share one pass and pick up new bouts afterwards", async () => {
  const store = create();
  await store.enqueue("club", payload("a"));
  const started = deferred();
  const finish = deferred();
  const sent = [];
  const sync = createOutboxSync(store, async item => {
    sent.push(item.id);
    if (item.id === "a") { started.resolve(); await finish.promise; }
  }, isNetwork);
  const first = sync("club");
  await started.promise;
  await store.enqueue("club", payload("b"));
  assert.equal(sync("club"), first);
  finish.resolve();
  await first;
  assert.deepEqual(sent, ["a", "b"]);
  assert.equal((await store.read("club")).length, 0);
});

test("changing account stops subsequent sends and club queues remain isolated", async () => {
  const store = create();
  await store.enqueue("club", payload("a"));
  await store.enqueue("club", payload("b"));
  await store.enqueue("other", payload("c", "other"));
  let allowed = true;
  const sent = [];
  await createOutboxSync(store, async item => { sent.push(item.id); allowed = false; }, isNetwork)("club", () => allowed);
  assert.deepEqual(sent, ["a"]);
  assert.equal((await store.read("club"))[0].id, "b");
  assert.equal((await store.read("other"))[0].id, "c");
  await assert.rejects(store.enqueue("club", payload("d", "other")), /different club/);
});

test("reusing an ID does not replace a queued result", async () => {
  const store = create();
  await store.enqueue("club", payload("a"));
  await store.enqueue("club", payload("a"));
  await assert.rejects(store.enqueue("club", { ...payload("a"), blueScore: 9 }));
  assert.equal((await store.read("club"))[0].payload.blueScore, 5);
});

test("duplicate insert is acknowledged only after checking the match ID and club", async () => {
  const expected = payload("a");
  const calls = [];
  const row = { id: "a", club_id: "club", blue_score: 5 };
  let lookup = { data: row, error: null };
  const client = { from() {
    return {
      insert() { return this; }, select() { return this; },
      eq(key, value) { calls.push([key, value]); return this; },
      async single() { return { data: null, error: { code: "23505" } }; },
      async maybeSingle() { return lookup; },
    };
  } };
  const { saveMatch } = load("matches", {
    "@/lib/supabase": { requireSupabase: () => client },
    "@/lib/networkError": { isDuplicateMatchError: error => error.code === "23505" },
  });
  assert.equal((await saveMatch(expected)).id, "a");
  assert.deepEqual(calls, [["id", "a"], ["club_id", "club"]]);
  lookup = { data: null, error: null };
  await assert.rejects(saveMatch(expected), error => error.code === "23505");
  lookup = { data: null, error: { message: "lookup failed" } };
  await assert.rejects(saveMatch(expected), error => error.message === "lookup failed");
});
