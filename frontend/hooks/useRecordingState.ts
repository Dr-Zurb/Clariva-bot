"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getRecordingState, type RecordingStateData } from "@/lib/api";

/**
 * Shared hook that tracks the mid-consult recording pause state for a
 * single session. Plan 07 · Task 28 · Decision 4 LOCKED.
 *
 * Source-of-truth ordering:
 *   1. **Initial GET** — the hook fires `GET /recording/state` on mount
 *      so the indicator + controls show the correct state immediately,
 *      even if the user refreshes mid-pause. Failures fall back to
 *      `{ paused: false }` and are retried on next `refresh()` or
 *      `applyIncomingMessage()` call.
 *   2. **Realtime derive** — after mount, the host's chat subscription
 *      forwards every new companion-chat system message into
 *      `applyIncomingMessage({ systemEvent, body, ... })`. The hook
 *      parses `recording_paused` / `recording_resumed` events and
 *      flips the state without a network round-trip.
 *
 * The hook doesn't open its own Realtime channel — the companion chat
 * already has one and we reuse it via `onIncomingMessage`. That keeps
 * v1 to ONE live subscription per session (see Plan 07 open question #2
 * + task-28 Notes #4).
 *
 * ## Reason transport (rec-15)
 *
 * The pause banner body no longer carries a reason. `meta` is not
 * persisted, so Realtime cannot deliver the code. On
 * `recording_paused`, the hook flips `paused` immediately and then
 * refreshes `GET /recording/state`, which is the surviving transport
 * for the preset code (or `not_recorded_in_preset_form`).
 */

interface UseRecordingStateArgs {
  /** Session UUID. Hook is a no-op when empty / null. */
  sessionId:    string | null | undefined;
  /**
   * Doctor JWT / patient session JWT. Required for the initial state
   * fetch. When undefined the hook skips the fetch (useful while the
   * host is still bootstrapping its own auth).
   */
  token:        string | null | undefined;
  /** Flip to `false` to disable all activity (used when session ended). */
  enabled?:     boolean;
}

export interface RecordingStateSnapshot {
  paused:       boolean;
  pausedAt?:    Date;
  pausedBy?:    string;
  pausedByRole?: "doctor" | "patient";
  pauseReason?: string;
  resumedAt?:   Date;
  autoResumeAt?: Date;
  autoResumeExtensionsUsed?: 0 | 1;
  autoResumeBoundMs?: number;
  /**
   * `true` during the initial state fetch. Children can show a skeleton
   * until this flips to `false`, or treat loading as "probably not
   * paused" for the optimistic baseline.
   */
  loading:      boolean;
  /** Last fetch error (stringified); cleared on the next successful read. */
  error:        string | null;
}

export interface IncomingSystemMeta {
  systemEvent?: string | null;
  body?:        string;
  senderRole:   "doctor" | "patient" | "system";
  /**
   * Chat message kind. Accepted for forward-compat so host components
   * can forward unfiltered `IncomingMessageMeta` objects; the hook
   * ignores the value and keys off `senderRole + systemEvent` instead.
   */
  kind?:        string;
}

export interface UseRecordingStateResult {
  state:                  RecordingStateSnapshot;
  /**
   * Forward EVERY incoming chat message here (unfiltered). The hook
   * filters internally for `kind='system' && systemEvent in {...}` so
   * host components don't have to reproduce the filter.
   */
  applyIncomingMessage:   (meta: IncomingSystemMeta) => void;
  /** Force-refresh from the REST endpoint (e.g. after a reconnect). */
  refresh:                () => Promise<void>;
}

const INITIAL: RecordingStateSnapshot = {
  paused:  false,
  loading: true,
  error:   null,
};

function mapDataToSnapshot(data: RecordingStateData): RecordingStateSnapshot {
  return {
    paused:      data.paused,
    pausedAt:    data.pausedAt ? new Date(data.pausedAt) : undefined,
    pausedBy:    data.pausedBy,
    pausedByRole: data.pausedByRole,
    pauseReason: data.pauseReason,
    resumedAt:   data.resumedAt ? new Date(data.resumedAt) : undefined,
    autoResumeAt: data.autoResumeAt ? new Date(data.autoResumeAt) : undefined,
    autoResumeExtensionsUsed: data.autoResumeExtensionsUsed,
    autoResumeBoundMs: data.autoResumeBoundMs,
    loading:     false,
    error:       null,
  };
}

export function useRecordingState({
  sessionId,
  token,
  enabled = true,
}: UseRecordingStateArgs): UseRecordingStateResult {
  const [state, setState] = useState<RecordingStateSnapshot>(INITIAL);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    if (!enabled || !sessionId || !token) {
      setState((prev) => ({ ...prev, loading: false }));
      return;
    }
    setState((prev) => ({ ...prev, loading: true }));
    try {
      const res = await getRecordingState(token, sessionId);
      if (!mountedRef.current) return;
      setState(mapDataToSnapshot(res.data));
    } catch (err) {
      if (!mountedRef.current) return;
      const message = err instanceof Error ? err.message : "Failed to read recording state";
      setState((prev) => ({
        paused:      prev.paused,
        pausedAt:    prev.pausedAt,
        pausedBy:    prev.pausedBy,
        pausedByRole: prev.pausedByRole,
        pauseReason: prev.pauseReason,
        resumedAt:   prev.resumedAt,
        autoResumeAt: prev.autoResumeAt,
        autoResumeExtensionsUsed: prev.autoResumeExtensionsUsed,
        autoResumeBoundMs: prev.autoResumeBoundMs,
        loading:     false,
        error:       message,
      }));
    }
  }, [enabled, sessionId, token]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);

  const applyIncomingMessage = useCallback(
    (meta: IncomingSystemMeta): void => {
      if (!enabled) return;
      if (meta.senderRole !== "system") return;
      const event = meta.systemEvent;
      if (event !== "recording_paused" && event !== "recording_resumed") return;
      const now = new Date();
      if (event === "recording_paused") {
        setState({
          paused: true,
          pausedAt: now,
          pauseReason: undefined,
          loading: false,
          error: null,
        });
        void refresh();
        return;
      }
      setState({
        paused:    false,
        resumedAt: now,
        loading:   false,
        error:     null,
      });
    },
    [enabled, refresh],
  );

  return { state, applyIncomingMessage, refresh };
}
