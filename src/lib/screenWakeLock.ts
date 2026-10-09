/** Each browser session releases only its own lock, including late requests. */
export function acquireScreenWakeLock(
  wakeLock: Pick<WakeLock, "request">,
  page: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">,
): () => void {
  let disposed = false;
  let pending = false;
  let sentinel: WakeLockSentinel | null = null;
  const release = (lock: WakeLockSentinel) => {
    void lock.release().catch(() => { /* Already released or unavailable. */ });
  };
  const acquire = async () => {
    if (disposed || pending || page.visibilityState !== "visible" || (sentinel && !sentinel.released)) return;
    pending = true;
    try {
      const lock = await wakeLock.request("screen");
      if (disposed || page.visibilityState !== "visible") release(lock);
      else sentinel = lock;
    } catch {
      // A denied wake lock must not interrupt the bout.
    } finally {
      pending = false;
    }
  };
  const onVisibilityChange = () => {
    if (page.visibilityState === "visible") void acquire();
    else if (sentinel) {
      release(sentinel);
      sentinel = null;
    }
  };
  page.addEventListener("visibilitychange", onVisibilityChange);
  void acquire();
  return () => {
    disposed = true;
    page.removeEventListener("visibilitychange", onVisibilityChange);
    if (sentinel) release(sentinel);
    sentinel = null;
  };
}

/** Serialize native calls across pause, resume and unmount. */
export function createNativeWakeLockQueue(plugin: {
  keepAwake: () => Promise<void>;
  allowSleep: () => Promise<void>;
}): () => () => void {
  let queue = Promise.resolve();
  const enqueue = (action: () => Promise<void>) => {
    queue = queue.then(action).catch(() => { /* Keep processing after failure. */ });
  };
  return () => {
    let disposed = false;
    enqueue(async () => {
      if (!disposed) await plugin.keepAwake();
    });
    return () => {
      if (disposed) return;
      disposed = true;
      enqueue(() => plugin.allowSleep());
    };
  };
}
