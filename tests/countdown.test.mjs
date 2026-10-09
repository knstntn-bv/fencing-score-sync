import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const exports = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../src/lib/countdown.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports });
const { createCountdown, createCountdownController } = exports;

function setup(duration = 90000) {
  let now = 0;
  const intervals = new Set();
  const listeners = new Set();
  const events = [];
  const callbacks = {
    remaining: seconds => events.push(["remaining", seconds]),
    running: running => events.push(["running", running]),
  };
  const controller = createCountdownController(duration, {
    now: () => now,
    every(callback, milliseconds) {
      assert.equal(milliseconds, 100);
      intervals.add(callback);
      return () => intervals.delete(callback);
    },
    onVisible(callback) { listeners.add(callback); return () => listeners.delete(callback); },
  }, callbacks);
  return {
    controller, callbacks, intervals, listeners, events,
    advance(milliseconds) { now += milliseconds; },
    tick() { intervals.forEach(callback => callback()); },
    visible() { listeners.forEach(callback => callback()); },
  };
}

test("delayed updates catch up to elapsed time instead of counting callbacks", () => {
  const timer = setup();
  timer.controller.start();
  timer.advance(4000);
  timer.tick();
  assert.deepEqual(timer.events.at(-1), ["remaining", 86]);
});

test("pause preserves fractions and excludes time spent paused", () => {
  let now = 0;
  const timer = createCountdown(90000, () => now);
  timer.start();
  now = 300;
  assert.equal(timer.pause().remainingMs, 89700);
  now += 600000;
  assert.equal(timer.read().remainingMs, 89700);
  timer.start();
  now += 700;
  assert.equal(timer.read().remainingMs, 89000);
  assert.equal(timer.read().seconds, 89);
});

test("repeated short starts and pauses never restore fractional seconds", () => {
  let now = 0;
  const timer = createCountdown(1000, () => now);
  for (let i = 0; i < 10; i++) {
    timer.start();
    now += 100;
    timer.pause();
    now += 5000;
  }
  assert.equal(timer.read().remainingMs, 0);
  assert.equal(timer.start().running, false);
});

test("the final fraction shows one second and expiry stops exactly once", () => {
  const timer = setup(1000);
  timer.controller.start();
  timer.advance(999);
  timer.tick();
  assert.deepEqual(timer.events, [["remaining", 1], ["running", true]]);
  timer.advance(1);
  timer.tick();
  timer.visible();
  timer.controller.start();
  assert.deepEqual(timer.events, [["remaining", 1], ["running", true], ["remaining", 0], ["running", false]]);
  assert.equal(timer.intervals.size, 0);
});

test("pause after an overdue deadline publishes zero before enabling Save", () => {
  const timer = setup(1000);
  timer.controller.start();
  timer.advance(2000);
  timer.controller.pause();
  assert.deepEqual(timer.events.slice(-2), [["remaining", 0], ["running", false]]);
  assert.equal(timer.intervals.size, 0);
});

test("returning to a visible page refreshes without waiting for an interval", () => {
  const timer = setup();
  timer.controller.start();
  timer.advance(31000);
  timer.visible();
  assert.deepEqual(timer.events.at(-1), ["remaining", 59]);
  timer.advance(90000);
  timer.visible();
  assert.deepEqual(timer.events.at(-1), ["running", false]);
});

test("reset restores the limit and stops the active interval", () => {
  const timer = setup();
  timer.controller.start();
  timer.advance(12345);
  timer.tick();
  timer.controller.reset();
  assert.deepEqual(timer.events.slice(-2), [["remaining", 90], ["running", false]]);
  assert.equal(timer.intervals.size, 0);
  timer.controller.start();
  timer.advance(1000);
  timer.tick();
  assert.deepEqual(timer.events.at(-1), ["remaining", 89]);
});

test("updating callbacks does not move the deadline or create another interval", () => {
  const timer = setup();
  timer.controller.start();
  timer.advance(1500);
  timer.callbacks.remaining = seconds => timer.events.push(["new callback", seconds]);
  timer.controller.start();
  timer.advance(1500);
  timer.tick();
  assert.deepEqual(timer.events.at(-1), ["new callback", 87]);
  assert.equal(timer.intervals.size, 1);
});

test("dispose clears listeners and blocks callbacks after unmount", () => {
  const timer = setup();
  timer.controller.start();
  timer.controller.dispose();
  const count = timer.events.length;
  timer.advance(100000);
  timer.tick();
  timer.visible();
  timer.controller.start();
  timer.controller.pause();
  assert.equal(timer.events.length, count);
  assert.equal(timer.intervals.size, 0);
  assert.equal(timer.listeners.size, 0);
});
