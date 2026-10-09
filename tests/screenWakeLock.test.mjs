import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/screenWakeLock.ts", import.meta.url), "utf8");
const module = { exports: {} };
runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: module.exports });
const { acquireScreenWakeLock, createNativeWakeLockQueue } = module.exports;
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
function page() {
  const listeners = new Set();
  return {
    visibilityState: "visible",
    addEventListener: (_, callback) => listeners.add(callback),
    removeEventListener: (_, callback) => listeners.delete(callback),
    change(state) { this.visibilityState = state; listeners.forEach(callback => callback()); },
    listeners,
  };
}
function lock() {
  return { released: false, releases: 0, async release() { this.released = true; this.releases++; } };
}

test("late browser acquisition releases its own lock without touching a resumed session", async () => {
  const first = deferred();
  const oldLock = lock();
  const newLock = lock();
  const document = page();
  const stopOld = acquireScreenWakeLock({ request: () => first.promise }, document);
  stopOld();
  const stopNew = acquireScreenWakeLock({ request: async () => newLock }, document);
  await tick();
  first.resolve(oldLock);
  await tick();
  assert.equal(oldLock.releases, 1);
  assert.equal(newLock.releases, 0);
  stopNew();
  assert.equal(newLock.releases, 1);
  assert.equal(document.listeners.size, 0);
});

test("visibility changes release and reacquire, without duplicate pending requests", async () => {
  const document = page();
  const locks = [];
  const stop = acquireScreenWakeLock({ request: async () => { const next = lock(); locks.push(next); return next; } }, document);
  document.change("visible");
  await tick();
  assert.equal(locks.length, 1);
  document.change("hidden");
  assert.equal(locks[0].releases, 1);
  document.change("visible");
  await tick();
  assert.equal(locks.length, 2);
  stop();
  assert.equal(locks[1].releases, 1);
});

test("a denied browser request can be retried on return to the page", async () => {
  const document = page();
  let requests = 0;
  const acquired = lock();
  const stop = acquireScreenWakeLock({ request: async () => {
    if (++requests === 1) throw new Error("denied");
    return acquired;
  } }, document);
  await tick();
  document.change("visible");
  await tick();
  assert.equal(requests, 2);
  stop();
  assert.equal(acquired.releases, 1);
});

test("native release finishes before the next acquisition", async () => {
  const pending = deferred();
  const events = [];
  let acquisitions = 0;
  const acquire = createNativeWakeLockQueue({
    async keepAwake() { events.push("acquire"); if (++acquisitions === 1) await pending.promise; },
    async allowSleep() { events.push("release"); },
  });
  const stopOld = acquire();
  await tick();
  stopOld();
  const stopNew = acquire();
  assert.deepEqual(events, ["acquire"]);
  pending.resolve();
  await tick();
  assert.deepEqual(events, ["acquire", "release", "acquire"]);
  stopNew();
  await tick();
  assert.deepEqual(events, ["acquire", "release", "acquire", "release"]);
});

test("native queue continues after a rejected acquisition", async () => {
  let requests = 0;
  let releases = 0;
  const acquire = createNativeWakeLockQueue({
    async keepAwake() { if (++requests === 1) throw new Error("unavailable"); },
    async allowSleep() { releases++; },
  });
  const stop = acquire();
  await tick();
  stop();
  const stopNext = acquire();
  await tick();
  assert.equal(requests, 2);
  assert.equal(releases, 1);
  stopNext();
  await tick();
  assert.equal(releases, 2);
});
