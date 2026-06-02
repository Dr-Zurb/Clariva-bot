/**
 * useTabPresenceClaim — multi-tab kick / multi-monitor warn for live consults.
 *
 * Sub-batch E · task-video-E3 (`task-video-E3-multi-tab-kick.md`) · also the
 * shared foundation that voice C4 (`task-voice-C4-multi-tab-kick.md`) and
 * text D2 (`task-text-D2-multi-tab-kick.md`) will reuse when they wire up.
 *
 * Problem we're solving
 * ---------------------
 * A patient opens the same consult URL in two browser tabs (or a tab + their
 * phone). Twilio Video / Voice gets confused by duplicate participant rows;
 * server-side recording forks; the doctor sees two patient rows. Text consult
 * has the analogous race on `consultation_messages` INSERTs (split-brain
 * composer, doubled typing indicators).
 *
 * Decision matrix (locked — see plan-video §29 / plan-voice §10 / text D2):
 *
 *   role: 'patient' → kick the older tab (newest wins). Patients legitimately
 *                     have one device; the older tab gets a full-screen
 *                     "[Take over]" overlay. Clicking takes back over,
 *                     evicting the newer tab in turn.
 *   role: 'doctor'  → warn but DON'T kick. Doctors use multi-monitor setups
 *                     (chart on screen 1, video on screen 2). Surface a small
 *                     "Open in N tabs" pill so they know media routes to the
 *                     newest tab, but don't yank either tab off the call.
 *
 * Mechanism
 * ---------
 * Newest-wins semantics over a Supabase Realtime broadcast channel
 * (`consult-tab-presence-${sessionId}`). On mount, every tab broadcasts a
 * claim `{ tab_id, role, claimed_at }`. Every tab also tracks ALL claims it
 * sees in a local map keyed by `tab_id`. A small reducer derives the status:
 *
 *   - PATIENT side, the SOLE patient claim wins. The patient claim with the
 *     LATEST `claimed_at` is the active one; older patient claims flip to
 *     `'kicked'`.
 *   - DOCTOR side, multiple doctor claims are tolerated; status becomes
 *     `'multi-tab-warned'` with `otherTabsCount = doctorClaims - 1`.
 *
 * `takeOver()` rebroadcasts a fresh claim with `claimed_at = Date.now()`. The
 * other tab's reducer will see the newer timestamp and flip itself to
 * `'kicked'`.
 *
 * Why broadcast (not presence-state)
 * ----------------------------------
 * Supabase Realtime offers two primitives:
 *   - `presence` — persistent set of "who's here right now". Survives
 *      reconnects until the channel times out the leaving client.
 *   - `broadcast` — fire-and-forget message; cheaper; receiver ordering is
 *      monotonic per-channel.
 *
 * We want LATEST-WINS by timestamp. Broadcast is the right primitive — every
 * claim carries its own `claimed_at`, comparison is local, no
 * server-side-state-of-truth needed. We DO supplement with a periodic
 * re-broadcast on `'SUBSCRIBED'` (handles late joiners + channel reconnects)
 * and a final re-broadcast on `takeOver()`. That's it.
 *
 * Why not RLS / server enforcement
 * --------------------------------
 * Per text D2's out-of-scope §"Server-side enforcement": "RLS doesn't have
 * presence semantics; this is a UX guarantee, not a security one." A
 * malicious patient with split tabs could trivially ignore the kick (they
 * already have the JWT). The threat model isn't malicious patients — it's
 * accidental duplicate tabs causing real Twilio / DB confusion.
 *
 * C5 (crash-recovery rejoin) cache contract
 * -----------------------------------------
 * When THIS tab transitions to `'kicked'`, we set a sessionStorage flag:
 *
 *   sessionStorage.setItem(`tab-was-kicked-${sessionId}`, '1')
 *
 * Voice C5 / video E.6 (`useCallRejoinCache`) will read this flag on remount
 * and refuse to auto-rejoin from cache (the kick is the source of truth).
 * `takeOver()` clears the flag — the tab is canonical again.
 *
 * Mode='readonly'
 * ---------------
 * Read-only playback rooms (recording playback, transcript review) don't
 * mount this hook — they don't have a presence channel and can't be
 * "kicked". Callers gate the hook mount on the live-call code path; the
 * hook itself defends against missing/empty inputs by returning the inert
 * `'sole'` shape.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

// ----------------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------------

export type TabPresenceRole = "doctor" | "patient";

/**
 * Status emitted by the hook:
 *   - `'sole'`             — this tab is the only claim of its role.
 *                             Render nothing.
 *   - `'multi-tab-warned'` — DOCTOR-only. Other doctor tabs are present but
 *                             nobody is being kicked. Render a small badge.
 *   - `'kicked'`           — PATIENT-only. A newer patient tab claimed the
 *                             session; this tab MUST tear down its Twilio
 *                             room and surface the [Take over] overlay.
 */
export type TabPresenceStatus = "sole" | "multi-tab-warned" | "kicked";

export interface UseTabPresenceClaimResult {
  status: TabPresenceStatus;
  /**
   * Number of OTHER tabs of the same role currently claimed (so the badge
   * can render "Open in 2 tabs" / "Open in 3 tabs"). Always 0 in the
   * `'sole'` state. For `'kicked'` patients, reports the count of
   * competing patient tabs (always ≥ 1).
   */
  otherTabsCount: number;
  /**
   * Re-broadcasts a fresh claim with `claimed_at = Date.now()`. The OTHER
   * tabs of the same role flip into `'kicked'` (patient) or remain
   * tolerated (doctor). Safe to call from `'kicked'` state — that's the
   * canonical "Take back over" affordance.
   */
  takeOver: () => void;
}

// ----------------------------------------------------------------------------
// Internal types — broadcast wire format
// ----------------------------------------------------------------------------

interface ClaimPayload {
  tab_id: string;
  role: TabPresenceRole;
  claimed_at: number;
}

const CHANNEL_PREFIX = "consult-tab-presence";
const CLAIM_EVENT = "tab-presence-claim";
/**
 * sessionStorage key written when this tab is kicked. C5 (`useCallRejoinCache`)
 * reads this flag and refuses to auto-rejoin if set. Cleared on `takeOver()`.
 */
const KICKED_FLAG_KEY_PREFIX = "tab-was-kicked";

const kickedFlagKey = (sessionId: string) =>
  `${KICKED_FLAG_KEY_PREFIX}-${sessionId}`;

const NOOP = () => {};

const INERT_RESULT: UseTabPresenceClaimResult = {
  status: "sole",
  otherTabsCount: 0,
  takeOver: NOOP,
};

// ----------------------------------------------------------------------------
// Pure reducer — derives status from the local claims map.
// Exported for unit testing (when voice C4 picks up its hook test file).
// ----------------------------------------------------------------------------

export interface DeriveStatusInput {
  selfTabId: string;
  selfRole: TabPresenceRole;
  selfClaimedAt: number;
  /** All claims this tab has observed, including its own. Keyed by tab_id. */
  claims: ReadonlyMap<string, ClaimPayload>;
}

export function deriveStatus(
  input: DeriveStatusInput,
): { status: TabPresenceStatus; otherTabsCount: number } {
  const { selfTabId, selfRole, selfClaimedAt, claims } = input;

  const sameRoleClaims = Array.from(claims.values()).filter(
    (c) => c.role === selfRole,
  );

  if (selfRole === "doctor") {
    const others = sameRoleClaims.filter((c) => c.tab_id !== selfTabId).length;
    if (others === 0) return { status: "sole", otherTabsCount: 0 };
    return { status: "multi-tab-warned", otherTabsCount: others };
  }

  // Patient branch: newest claim wins.
  // Find the strictly-newer patient claim (if any).
  const newerPatientClaims = sameRoleClaims.filter(
    (c) => c.tab_id !== selfTabId && c.claimed_at > selfClaimedAt,
  );
  if (newerPatientClaims.length > 0) {
    return {
      status: "kicked",
      // Count ALL competing patient tabs, not just the strictly-newer ones,
      // so the overlay copy reads correctly when 3+ tabs have raced.
      otherTabsCount: sameRoleClaims.filter((c) => c.tab_id !== selfTabId)
        .length,
    };
  }

  // No newer patient tab → we're either alone or strictly the newest.
  const otherPatientCount = sameRoleClaims.filter(
    (c) => c.tab_id !== selfTabId,
  ).length;
  // Older patient tabs exist but they're stale — we DON'T flip to multi-warn
  // (that's doctor-only). The older tabs see us as newer and flip themselves.
  return { status: "sole", otherTabsCount: otherPatientCount };
}

// ----------------------------------------------------------------------------
// Hook
// ----------------------------------------------------------------------------

/**
 * Live multi-tab presence guard. Pass the live consult `sessionId` and the
 * caller's `role`. Returns a render-ready `{ status, otherTabsCount,
 * takeOver }` triple.
 *
 * Pass `null` / `undefined` for either input to no-op (returns the inert
 * `'sole'` shape and never opens a channel). That's the right shape for
 * read-only playback rooms or rooms whose role hasn't been determined yet.
 *
 * @param sessionId  `consultation_sessions.id` for the live consult. Must be
 *                   the SAME id on every tab claiming the same session.
 * @param role       'patient' | 'doctor'. Patients get newest-wins kick;
 *                   doctors get tolerated-multi-warn.
 */
export function useTabPresenceClaim(
  sessionId: string | null | undefined,
  role: TabPresenceRole | null | undefined,
): UseTabPresenceClaimResult {
  // Stable identity for THIS tab. `useState(() => ...)` runs once per mount.
  const selfTabId = useMemo(() => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    // Fallback for older runtimes (test envs). Math.random() collisions are
    // astronomically unlikely at our concurrency.
    return `tab-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }, []);

  const [status, setStatus] = useState<TabPresenceStatus>("sole");
  const [otherTabsCount, setOtherTabsCount] = useState(0);

  // Refs for the long-lived runtime state. We keep these out of React state so
  // the broadcast handlers and the takeOver callback have stable closures
  // that always see the latest values without re-subscribing.
  const claimsRef = useRef<Map<string, ClaimPayload>>(new Map());
  const selfClaimedAtRef = useRef<number>(Date.now());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const clientRef = useRef<SupabaseClient | null>(null);
  const mountedRef = useRef(true);

  /** Recomputes status + writes the C5 sessionStorage flag if needed. */
  const recompute = useCallback(() => {
    if (!mountedRef.current || !role || !sessionId) return;

    const next = deriveStatus({
      selfTabId,
      selfRole: role,
      selfClaimedAt: selfClaimedAtRef.current,
      claims: claimsRef.current,
    });

    setStatus((prev) => {
      // Side-effect: maintain the C5 cache contract flag on transitions
      // INTO/OUT OF the kicked state. We only flip the flag on actual
      // edges so re-render churn doesn't churn sessionStorage.
      if (next.status !== prev) {
        try {
          if (next.status === "kicked") {
            sessionStorage.setItem(kickedFlagKey(sessionId), "1");
          } else if (prev === "kicked") {
            // Recovered (via takeOver re-claim) — clear the flag.
            sessionStorage.removeItem(kickedFlagKey(sessionId));
          }
        } catch {
          // sessionStorage can throw in privacy modes / disabled-storage
          // environments. The kick UX still works without the flag; only
          // the C5 auto-rejoin coupling is lost. Best-effort, swallow.
        }
      }
      return next.status;
    });
    setOtherTabsCount(next.otherTabsCount);
  }, [role, selfTabId, sessionId]);

  /** Sends one fresh claim broadcast and updates our local self-record. */
  const broadcastClaim = useCallback(
    (claimedAt: number) => {
      if (!role || !sessionId) return;
      const channel = channelRef.current;
      if (!channel) return;

      selfClaimedAtRef.current = claimedAt;
      const payload: ClaimPayload = {
        tab_id: selfTabId,
        role,
        claimed_at: claimedAt,
      };
      // Update our own slot eagerly so the local reducer reflects the new
      // timestamp even before the broadcast loops back.
      claimsRef.current.set(selfTabId, payload);
      recompute();

      void channel.send({
        type: "broadcast",
        event: CLAIM_EVENT,
        payload,
      });
    },
    [recompute, role, selfTabId, sessionId],
  );

  // ------------------------------------------------------------------------
  // Subscription lifecycle
  // ------------------------------------------------------------------------
  useEffect(() => {
    mountedRef.current = true;
    if (!sessionId || !role) return;

    let cancelled = false;
    let client: SupabaseClient;
    try {
      client = createClient();
    } catch {
      // Supabase not configured (dev env without env vars). Hook degrades
      // to inert behavior; the consult page itself surfaces the config
      // error elsewhere. Don't crash the room.
      return;
    }
    clientRef.current = client;

    const channelName = `${CHANNEL_PREFIX}-${sessionId}`;
    const channel = client.channel(channelName, {
      config: { broadcast: { self: false, ack: false } },
    });
    channelRef.current = channel;

    channel.on(
      "broadcast",
      { event: CLAIM_EVENT },
      ({ payload }: { payload: ClaimPayload }) => {
        if (!payload || typeof payload !== "object") return;
        if (
          typeof payload.tab_id !== "string" ||
          typeof payload.claimed_at !== "number" ||
          (payload.role !== "doctor" && payload.role !== "patient")
        ) {
          return;
        }
        // Self-broadcasts are filtered server-side via `self: false`, but
        // belt-and-suspenders: never overwrite our own slot from the wire.
        if (payload.tab_id === selfTabId) return;

        const existing = claimsRef.current.get(payload.tab_id);
        // Monotonic by claimed_at: never regress to an older claim from the
        // same tab (e.g. out-of-order delivery on reconnect).
        if (existing && existing.claimed_at >= payload.claimed_at) return;

        claimsRef.current.set(payload.tab_id, payload);
        recompute();
      },
    );

    void channel.subscribe((subStatus) => {
      if (cancelled || subStatus !== "SUBSCRIBED") return;
      // Fresh `claimed_at` on EVERY subscribe — that means a reconnect
      // (channel torn down + resubscribed) re-asserts our claim with a new
      // timestamp, which is the right semantic: the user genuinely re-asked
      // for the session as of "now".
      broadcastClaim(Date.now());
    });

    return () => {
      cancelled = true;
      mountedRef.current = false;
      try {
        client.removeChannel(channel);
      } catch {
        // Best-effort.
      }
      channelRef.current = null;
      clientRef.current = null;
      claimsRef.current = new Map();
      // We deliberately DON'T clear the kicked flag here — the C5 contract
      // wants it to survive a page refresh. takeOver() is the only thing
      // that clears it (or a fresh claim wins on the next mount).
    };
  }, [broadcastClaim, recompute, role, selfTabId, sessionId]);

  // ------------------------------------------------------------------------
  // Public takeOver()
  // ------------------------------------------------------------------------
  const takeOver = useCallback(() => {
    if (!sessionId || !role) return;
    // Generate a strictly-newer timestamp than anything we've observed so we
    // beat any in-flight claim. Date.now() is monotonic-enough on modern
    // browsers; we add 1ms slack to dominate same-millisecond races.
    const newest = Math.max(
      Date.now(),
      ...Array.from(claimsRef.current.values()).map((c) => c.claimed_at),
    ) + 1;
    broadcastClaim(newest);
  }, [broadcastClaim, role, sessionId]);

  // Inputs missing → inert. Important: hook has to call useState/useEffect
  // unconditionally, so we branch HERE (after all hook calls).
  if (!sessionId || !role) {
    return INERT_RESULT;
  }

  return { status, otherTabsCount, takeOver };
}
