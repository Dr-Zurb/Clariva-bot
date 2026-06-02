"use client";

/**
 * Per-Rx in-memory acknowledgement store
 * (EHR Sub-batch C / T4.18 step 5; reused by T4.20 + T4.21).
 *
 * Decision §22 LOCKED 2026-05-03: acknowledgement persistence is
 * scoped to the Rx draft in V1 — no DB write, no localStorage, no
 * cross-tab sync. The hook lives in the form's React state so:
 *   - Closing the form (route change / unmount) drops every ack.
 *   - Refreshing the page drops every ack.
 *   - Acks are "for this Rx draft", not "for this patient".
 *
 * Decision §23 LOCKED 2026-05-03 + Sub-batch C exec-order: telemetry
 * for warning ack/edit/send-anyway counts ships SILENT in C.1 — no
 * events emitted from this hook in the C.1 PR. The C.4 PR
 * (`<PrescriptionPreSendCheck>`) wires the analytics emit helper at
 * the aggregator boundary because that's the surface that knows the
 * outcome (`'cancelled' | 'edited' | 'sent-anyway'`). Ack-level
 * telemetry is intentionally avoided to keep the per-keystroke chip
 * UI from becoming a high-volume event source.
 *
 * Key shape is opaque to the hook — callers compute and pass the
 * key. This keeps the same hook reusable for:
 *   - allergy clashes (`${medicineInstanceId}:${allergyId}`)
 *   - DDI chips (`${pairId}` from the interaction row)
 *   - any future warning kind that needs a per-Rx ack model.
 *
 * @see frontend/components/ehr/AllergyClashBanner.tsx
 * @see frontend/lib/ehr/match-allergens.ts
 */

import { useCallback, useState } from "react";

export interface UseAcknowledgementsResult {
  /** True iff `key` has been acknowledged in the current session. */
  isAcked: (key: string) => boolean;
  /** Mark a single key acknowledged. Idempotent; calling on an
   *  already-acked key is a no-op. */
  ack: (key: string) => void;
  /** Mark a batch of keys acknowledged in one state update — useful
   *  when a banner's "Acknowledge and continue" button must clear
   *  every currently-shown match in a single tick (no flicker). */
  ackMany: (keys: ReadonlyArray<string>) => void;
  /** Remove an ack — surfaced for symmetry; the C.1 banner does not
   *  expose an un-ack affordance. The C.3 chips re-fire on
   *  remove-then-re-add via the medicine-instance-id keying scheme,
   *  so explicit un-ack is rarely needed. */
  unack: (key: string) => void;
  /** Drop every ack. Used when the form re-mounts onto a different
   *  prescription draft (e.g. switching appointments while the
   *  in-call panel is open). */
  clear: () => void;
  /** Snapshot of the current acked-keys set. Cheap to read; consumers
   *  that need to gate on "are there any unacked warnings?" can
   *  derive `unacked = matches.filter(m => !isAcked(keyFor(m)))`. */
  ackedKeys: ReadonlySet<string>;
}

export function useAcknowledgements(): UseAcknowledgementsResult {
  // Stored as a Set wrapped in state so identity changes on every
  // mutation (drives re-render). Set is fine here — the worst-case
  // size is bounded by the number of warnings in a draft Rx (small).
  const [acked, setAcked] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  const isAcked = useCallback(
    (key: string) => acked.has(key),
    [acked],
  );

  const ack = useCallback((key: string) => {
    setAcked((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const ackMany = useCallback((keys: ReadonlyArray<string>) => {
    if (keys.length === 0) return;
    setAcked((prev) => {
      let mutated = false;
      const next = new Set(prev);
      for (const key of keys) {
        if (!next.has(key)) {
          next.add(key);
          mutated = true;
        }
      }
      return mutated ? next : prev;
    });
  }, []);

  const unack = useCallback((key: string) => {
    setAcked((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setAcked((prev) => (prev.size === 0 ? prev : new Set<string>()));
  }, []);

  return { isAcked, ack, ackMany, unack, clear, ackedKeys: acked };
}
