"use client";

/**
 * useAutoSave (EHR Sub-batch B1 / T2.13)
 *
 * Generic auto-save hook with a debounced PATCH against the upstream
 * backend. Replaces the explicit "Save draft" button per Decision E5
 * (and tier-decision T2-D5).
 *
 * Why a single hook (not a reducer / useSWRMutation):
 *   - the backend already exposes idempotent updatePrescription PATCH;
 *   - the UI surface needs three states only (saving / saved / error);
 *   - we don't want a 3rd-party data layer dragged in for one form;
 *   - swappable per-form: the same hook will power vitals quick-add
 *     (Sub-batch A.5) and possibly templates editor (B1.7) later.
 *
 * Lifecycle:
 *   1. On mount, isFirstRunRef = true → no PATCH fires (avoids the
 *      load-snapshot-then-save loop that would race against the
 *      initial fetch).
 *   2. When `value` changes, schedule a debounced trailing call to
 *      `save(value)` `debounceMs` after the LAST change.
 *   3. While the debounce timer is pending we surface state='saving'?
 *      → No. State stays 'idle' (or last 'saved') until the actual
 *      network call begins. Otherwise rapid typing would flicker the
 *      pill. We also expose `isPending` for any UI that wants to show
 *      "unsaved changes…" before the save fires.
 *   4. On success → state='saved', savedAt=Date.now(). On failure →
 *      state='error', error set, retry() callable.
 *
 * Race / cancellation:
 *   - Saves are single-flight. A flush (Print / Send) that lands while
 *     autosave is in-flight waits, then writes the latest snapshot.
 *     Overlapping delete-then-insert PATCHes were doubling medicines
 *     on the printed parchi.
 *   - If `value` changes while a save is in-flight, UI state from the
 *     older save is discarded. We tag each save with a monotonically-
 *     increasing `saveIdRef` and only commit state from the latest.
 *
 * "Force final save before send" path:
 *   - Callers can call `flush()` to bypass the debounce and persist
 *     immediately (returns the save promise so the caller can await
 *     before performing a downstream action like
 *     `sendPrescriptionToPatient`).
 *   - `flush()` cancels any pending debounce timer and starts a save
 *     with the current `value` (latest snapshot).
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type AutoSaveState = "idle" | "saving" | "saved" | "error";

export interface UseAutoSaveOptions<T> {
  /**
   * The value to persist. Must be referentially stable when unchanged
   * (e.g. memoize objects upstream OR pass a string snapshot).
   */
  value: T;
  /**
   * Save callback. Receives the latest snapshot. Should resolve on
   * success and reject on any error. Network 401s should be retried by
   * the caller's existing axios/fetch interceptor.
   */
  save: (snapshot: T) => Promise<void>;
  /** Debounce window in ms. Defaults to 1500 per Decision T2-D3. */
  debounceMs?: number;
  /**
   * If true, the hook is disabled — no PATCHes fire even if `value`
   * changes. Useful for read-only mounts (post-call view) and during
   * the initial-load window before the backing record exists.
   */
  enabled?: boolean;
  /**
   * Optional callback fired on every error (in addition to the state
   * being set to 'error'). Useful for telemetry.
   */
  onError?: (err: unknown) => void;
}

export interface UseAutoSaveResult {
  state: AutoSaveState;
  /** ISO timestamp of last successful save; null until first success. */
  savedAt: Date | null;
  error: Error | null;
  /** True when there is a debounced save pending (timer active). */
  isPending: boolean;
  /**
   * Force an immediate save (cancels pending debounce).
   * `force` writes even when the hook is disabled (e.g. Send before
   * the dirty flag is set, or after a seed/RESET).
   */
  flush: (options?: { force?: boolean }) => Promise<void>;
  /** Re-run save against the latest value after a failure. */
  retry: () => Promise<void>;
}

const DEFAULT_DEBOUNCE_MS = 1500;

export function useAutoSave<T>({
  value,
  save,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  enabled = true,
  onError,
}: UseAutoSaveOptions<T>): UseAutoSaveResult {
  const [state, setState] = useState<AutoSaveState>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isPending, setIsPending] = useState<boolean>(false);

  const isFirstRunRef = useRef(true);
  /** Skip the first *enabled* snapshot only if we mounted already enabled (load). */
  const skipInitialEnabledSnapshotRef = useRef(enabled);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic "save id" — only the latest one commits state.
  const saveIdRef = useRef(0);
  /** In-flight save chain — flush waits instead of starting a parallel PATCH. */
  const inFlightRef = useRef<Promise<void> | null>(null);
  // Always-fresh references so flush() / retry() see the latest value
  // and save fn without re-binding (and without forcing the consumer
  // to memoize their save callback).
  const valueRef = useRef(value);
  const saveRef = useRef(save);
  const onErrorRef = useRef(onError);

  // Keep refs in sync with the latest props on every render.
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  /**
   * Internal: actually execute the save against the latest snapshot.
   * Tags this attempt with a unique id so a stale completion doesn't
   * overwrite a newer state.
   */
  const performSave = useCallback(async (): Promise<void> => {
    const run = async (): Promise<void> => {
      const myId = ++saveIdRef.current;
      setState("saving");
      setIsPending(false);
      try {
        await saveRef.current(valueRef.current);
        // Only commit if this is still the latest save.
        if (myId === saveIdRef.current) {
          setState("saved");
          setSavedAt(new Date());
          setError(null);
        }
      } catch (err) {
        if (myId === saveIdRef.current) {
          const e = err instanceof Error ? err : new Error(String(err));
          setError(e);
          setState("error");
          try {
            onErrorRef.current?.(err);
          } catch {
            /* swallow telemetry errors */
          }
        }
        // Re-throw so flush() callers can `await` and react.
        throw err;
      }
    };

    const pending = inFlightRef.current?.then(run, run) ?? run();
    inFlightRef.current = pending;
    try {
      await pending;
    } finally {
      if (inFlightRef.current === pending) {
        inFlightRef.current = null;
      }
    }
  }, []);

  /**
   * Public: cancel pending debounce and save immediately.
   * Returns the save promise (so callers can await before "Send").
   */
  const flush = useCallback(
    async (options?: { force?: boolean }): Promise<void> => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setIsPending(false);
      if (!enabled && !options?.force) return;
      await performSave();
    },
    [enabled, performSave]
  );

  /** Public: retry the last failure. */
  const retry = useCallback(async (): Promise<void> => {
    if (!enabled) return;
    await performSave();
  }, [enabled, performSave]);

  // Debounce on value change. First enabled snapshot is skipped only when
  // we mounted already enabled (load). Mounting disabled, then enabling
  // on the first user edit, must schedule a save (rxl-03).
  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setIsPending(false);
      return;
    }
    if (isFirstRunRef.current) {
      isFirstRunRef.current = false;
      if (skipInitialEnabledSnapshotRef.current) {
        skipInitialEnabledSnapshotRef.current = false;
        return;
      }
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setIsPending(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      // Fire-and-forget; performSave handles state transitions and
      // error swallowing for the auto-trigger path.
      performSave().catch(() => {
        /* error already surfaced via state */
      });
    }, debounceMs);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // `enabled` is required so a seed (dirty=false) cannot leave a
    // pending timer, and the first user edit (dirty=true) does save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, debounceMs, enabled]);

  return { state, savedAt, error, isPending, flush, retry };
}
