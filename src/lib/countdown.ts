export type CountdownSnapshot = { remainingMs: number; seconds: number; running: boolean };

/** A monotonic deadline keeps delayed callbacks from extending the bout. */
export function createCountdown(durationMs: number, now: () => number) {
  let remainingMs = Math.max(0, durationMs);
  let deadline: number | null = null;
  const read = (): CountdownSnapshot => {
    if (deadline !== null) {
      remainingMs = Math.max(0, deadline - now());
      if (remainingMs === 0) deadline = null;
    }
    return { remainingMs, seconds: Math.ceil(remainingMs / 1000), running: deadline !== null };
  };
  return {
    read,
    start() {
      const current = read();
      if (!current.running && remainingMs > 0) deadline = now() + remainingMs;
      return read();
    },
    pause() {
      read();
      deadline = null;
      return read();
    },
    reset(nextDurationMs = durationMs) {
      deadline = null;
      remainingMs = Math.max(0, nextDurationMs);
      return read();
    },
  };
}

export function createCountdownController(
  durationMs: number,
  environment: {
    now: () => number;
    every: (callback: () => void, milliseconds: number) => () => void;
    onVisible: (callback: () => void) => () => void;
  },
  callbacks: { remaining: (seconds: number) => void; running: (running: boolean) => void },
) {
  const countdown = createCountdown(durationMs, environment.now);
  let stopInterval: (() => void) | null = null;
  let disposed = false;
  let seconds: number | null = null;
  let running = false;
  const publish = (snapshot: CountdownSnapshot) => {
    if (disposed) return;
    if (!snapshot.running && stopInterval) {
      stopInterval();
      stopInterval = null;
    }
    // Publish the remainder before enabling Save through the running callback.
    if (seconds !== snapshot.seconds) {
      seconds = snapshot.seconds;
      callbacks.remaining(seconds);
    }
    if (running !== snapshot.running) {
      running = snapshot.running;
      callbacks.running(running);
    }
  };
  const refresh = () => publish(countdown.read());
  const removeVisibilityListener = environment.onVisible(refresh);
  refresh();
  return {
    start() {
      if (disposed) return;
      publish(countdown.start());
      if (running && !stopInterval) stopInterval = environment.every(refresh, 100);
    },
    pause() { if (!disposed) publish(countdown.pause()); },
    reset(nextDurationMs = durationMs) { if (!disposed) publish(countdown.reset(nextDurationMs)); },
    dispose() {
      disposed = true;
      stopInterval?.();
      stopInterval = null;
      removeVisibilityListener();
    },
  };
}
