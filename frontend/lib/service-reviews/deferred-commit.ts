export interface DeferredCommit {
  fire: () => void;
  cancel: () => void;
}

export interface DeferredCommitTimers {
  set: typeof setTimeout;
  clear: typeof clearTimeout;
}

/** Schedule `commit` after `delayMs`; returns handles. `onElapse` runs the real call. */
export function scheduleCommit(
  commit: () => void,
  delayMs: number,
  timers: DeferredCommitTimers = { set: setTimeout, clear: clearTimeout }
): DeferredCommit {
  let done = false;
  const id = timers.set(() => {
    if (!done) {
      done = true;
      commit();
    }
  }, delayMs);
  return {
    fire() {
      if (!done) {
        done = true;
        timers.clear(id);
        commit();
      }
    },
    cancel() {
      if (!done) {
        done = true;
        timers.clear(id);
      }
    },
  };
}
