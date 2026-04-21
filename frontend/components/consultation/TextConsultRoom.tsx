"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { createScopedRealtimeClient } from "@/lib/supabase/scoped-client";

/**
 * Text consultation chat room (Plan 04 · Task 19).
 *
 * Mounted by:
 *   - **Patient** at `/c/text/[sessionId]` after the page exchanges the
 *     URL HMAC token for a scoped Supabase JWT.
 *   - **Doctor** inside `<LiveConsultPanel>` (Plan 03 · Task 20) for
 *     `appointment.consultation_type === 'text'`. Doctor passes their
 *     existing Supabase session `access_token` as `accessToken` — same
 *     RLS path, just keyed on `auth.uid() = doctor_id` instead of the
 *     custom-claim patient branch.
 *
 * Backed by `consultation_messages` table + Supabase Realtime broadcast.
 * RLS enforces Decision 5 (live-only writes) at the DB layer — the
 * composer disables itself when the session isn't live, but a stray
 * INSERT would be physically rejected anyway.
 *
 * **No PHI in console logs.** Message bodies stay on the wire to
 * Supabase.
 *
 * Out of scope for v1 (see task-19.md "Out of scope"):
 *   - Attachments — the 📎 button is disabled with a tooltip.
 *   - Read receipts — presence + session membership is the coarse proxy.
 *   - Message edit / delete / threading.
 *   - Replay (`mode='readonly'`) — Plan 07.
 *   - Virtualization — average consult is < 50 messages; revisit when
 *     the first session crosses ~200.
 *
 * @see frontend/app/c/text/[sessionId]/page.tsx
 * @see backend/migrations/051_consultation_messages.sql
 * @see backend/migrations/052_consultation_messages_patient_jwt_rls.sql
 */

// ============================================================================
// Types
// ============================================================================

export type TextConsultSessionStatus =
  | "scheduled"
  | "live"
  | "ended"
  | "no_show"
  | "cancelled";

/**
 * Plan 06 · Task 38: message kind mirrors the backend `consultation_message_kind`
 * ENUM (migration 062). `text` is the legacy bubble; `attachment` rows
 * render with a 📎 download link (v1 polish follow-up in `docs/capture/inbox.md`);
 * `system` rows render as an italic banner line with a clock icon (Task 37
 * writes them; Task 38 is the first render surface).
 */
export type ConsultationMessageKind = "text" | "attachment" | "system";

/**
 * Plan 06 · Task 38: `<VideoRoom>` / `<VoiceConsultRoom>` host surfaces pass
 * this callback to drive the mobile unread-count badge. System rows are
 * filtered OUT at the host layer (not here) per Note #4 in task-38.
 *
 * Fires on Realtime INSERT receipt ONLY — initial-history fetches do NOT
 * invoke this (otherwise the badge would balloon on remount / rejoin).
 */
export interface IncomingMessageMeta {
  id: string;
  kind: ConsultationMessageKind;
  senderRole: "doctor" | "patient" | "system";
  /**
   * Plan 07 · Task 28 — exposed so host surfaces can derive
   * `<RecordingPausedIndicator>` state from the chat's Realtime stream
   * without opening a second subscription. Always `null` for non-system
   * rows; populated for system rows when the sender set a `system_event`.
   */
  systemEvent?: string | null;
  /**
   * Verbatim body text of the row. Host surfaces use this (together with
   * `systemEvent`) to parse the free-text reason out of a
   * `'recording_paused'` banner ("Doctor paused recording at HH:MM.
   * Reason: <reason>"). Keeping the raw body on the meta shape avoids a
   * cross-module contract for how the reason is embedded — it just
   * comes through and the consumer parses. Unbounded (matches the DB
   * column); hosts that don't need it can ignore the field.
   */
  body?: string;
}

export interface TextConsultRoomProps {
  /** UUID of `consultation_sessions` row. */
  sessionId: string;
  /**
   * Sender UUID for the local user. For doctors, this is `auth.uid()`.
   * For patients (bot-booked), the backend hands over a synthetic UUID
   * via the token-exchange response — see
   * `requestTextSessionToken().currentUserId`.
   */
  currentUserId: string;
  currentUserRole: "doctor" | "patient";
  /** JWT scoped to this session (Supabase auth header). */
  accessToken: string;
  /** Initial session status — drives composer enable + holding-screen. */
  sessionStatus: TextConsultSessionStatus;
  /** Header label for the counterparty. Falls back to a role-appropriate string. */
  counterpartyName?: string;
  /**
   * Called when the local Supabase request returns 401 (JWT expired).
   * Should mint a fresh JWT and resolve to it. The component swaps to
   * the new token transparently. If undefined or it rejects, the
   * connection status flips to red.
   */
  onRequestTokenRefresh?: () => Promise<string>;
  /**
   * Plan 07 · Task 31 — render mode:
   *   - `'live'` (default — Plan 04 Task 19 baseline): Realtime
   *     subscription + presence + composer. Doctor & patient mid-consult.
   *   - `'readonly'`: catch-up SELECT only (no Realtime sub, no
   *     presence, no typing broadcast, no composer). Used by the
   *     post-consult chat-history surface (`/c/history/[sessionId]` for
   *     patients, `/dashboard/appointments/[id]/chat-history` for
   *     doctors). The session banner is replaced with a "Read-only —
   *     view of your consultation on {date}" watermark; the composer
   *     is removed from the DOM (NOT just disabled — Decision 1 sub
   *     LOCKED). The 📎 / typing / presence affordances are also
   *     gone for the same reason.
   *
   * Composes orthogonally with `layout` — but the only layout that
   * makes sense for `'readonly'` is `'standalone'` (the post-consult
   * surface is a full-page mount). The other layouts are not blocked
   * but are untested for readonly.
   */
  mode?: "live" | "readonly";
  /**
   * Plan 07 · Task 31 — ISO timestamp for the readonly watermark date.
   * Sourced from `consultation_sessions.actual_ended_at` on both the
   * patient page (token-exchange response) and the doctor page (RLS
   * SELECT on the session row). When omitted, the watermark falls
   * back to a generic "Read-only" label (no date) so the prop is not
   * required for compile-time correctness, but the spec calls for the
   * date so callers should always pass it.
   *
   * Ignored when `mode !== 'readonly'`.
   */
  consultEndedAt?: string;
  /**
   * Plan 06 · Task 38 — layout mode:
   *   - `'standalone'` (default — Plan 04 Task 19 baseline): full-page
   *     chat, full header, wide bubbles, composer pinned. Used at
   *     `/c/text/[sessionId]` on the patient side.
   *   - `'panel'`: mounted in a side panel inside `<VideoRoom>`. Hides
   *     the header (parent room owns the framing), narrows bubble
   *     max-width, drops the outer rounded-border (parent's panel edge
   *     already supplies it). Min container width target: 320px.
   *   - `'canvas'`: mounted as the main canvas inside `<VoiceConsultRoom>`
   *     (Task 24c). Keeps a slim header (avatar + counterparty name),
   *     medium-width bubbles. No outer border because the parent frames.
   *
   * The visual diff is pure CSS — no branching on chat-plumbing logic.
   */
  layout?: "standalone" | "panel" | "canvas";
  /**
   * Plan 06 · Task 38 — fires on every Realtime INSERT received. Drives
   * the mobile chat-tab unread-count badge in the host `<VideoRoom>` /
   * `<VoiceConsultRoom>`. NOT fired during initial-history catch-up
   * (those messages already happened; the doctor knows about them).
   * Host decides whether to count a given row (Task 38 filters out
   * `kind === 'system'` banners per Note #4 — they're informational).
   */
  onIncomingMessage?: (msg: IncomingMessageMeta) => void;
}

interface ChatMessage {
  /** Server-acked id (UUID), or the optimistic client-generated UUID. */
  id: string;
  sessionId: string;
  senderId: string;
  senderRole: "doctor" | "patient" | "system";
  body: string;
  createdAt: string;
  /** Plan 06 · Task 38 — mirrors the DB `kind` ENUM (migration 062). */
  kind: ConsultationMessageKind;
  /** Plan 06 · Task 38 — populated only when `kind === 'attachment'`. */
  attachmentUrl?: string | null;
  attachmentMimeType?: string | null;
  attachmentByteSize?: number | null;
  /** Plan 06 · Task 38 — canonical tag for `kind === 'system'` rows. */
  systemEvent?: string | null;
  /** True while the local insert is in-flight. */
  pending?: boolean;
  /** Set when the insert failed irrecoverably (RLS reject / network). */
  failed?: boolean;
  /** Saved on failure so the user can retry the same body. */
  retryBody?: string;
}

type ConnectionStatus = "online" | "reconnecting" | "offline";

interface ConsultationMessageRow {
  id: string;
  session_id: string;
  sender_id: string;
  sender_role: string;
  body: string | null;
  created_at: string;
  /**
   * Plan 06 · Task 38 — migration 062 ENUM additions. May be absent on
   * pre-062 deployments / rows — treated as `'text'` by `rowToMessage`.
   */
  kind?: string | null;
  attachment_url?: string | null;
  attachment_mime_type?: string | null;
  attachment_byte_size?: number | null;
  system_event?: string | null;
}

// ============================================================================
// Constants
// ============================================================================

/** Backoff schedule for reconnect (ms). Caps at the last entry. */
const RECONNECT_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

/** How long without keydown before we broadcast typing:false. */
const TYPING_IDLE_MS = 3_000;

/** Floor between successive typing:true broadcasts. */
const TYPING_BROADCAST_THROTTLE_MS = 1_000;

/** Composer auto-grow cap. */
const COMPOSER_MAX_LINES = 4;

const PRESENCE_CHANNEL_PREFIX = "text-presence";

// ============================================================================
// Helpers
// ============================================================================

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function rowToMessage(row: ConsultationMessageRow): ChatMessage {
  const role: ChatMessage["senderRole"] =
    row.sender_role === "doctor" || row.sender_role === "patient" || row.sender_role === "system"
      ? row.sender_role
      : "system";
  const kind: ConsultationMessageKind =
    row.kind === "attachment" || row.kind === "system" ? row.kind : "text";
  return {
    id: row.id,
    sessionId: row.session_id,
    senderId: row.sender_id,
    senderRole: role,
    body: row.body ?? "",
    createdAt: row.created_at,
    kind,
    attachmentUrl: row.attachment_url ?? null,
    attachmentMimeType: row.attachment_mime_type ?? null,
    attachmentByteSize: row.attachment_byte_size ?? null,
    systemEvent: row.system_event ?? null,
  };
}

/** Group bubble timestamps — show time on first message of a minute-bucket. */
function shouldShowTimestamp(prev: ChatMessage | undefined, current: ChatMessage): boolean {
  if (!prev) return true;
  const a = new Date(prev.createdAt).getTime();
  const b = new Date(current.createdAt).getTime();
  // Different minute bucket OR different sender = show.
  return Math.floor(a / 60_000) !== Math.floor(b / 60_000) || prev.senderId !== current.senderId;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/**
 * Plan 07 · Task 31 — format the readonly watermark date. Mirrors the
 * `formatConsultDateLabel` helper on the backend (`notification-service.ts`)
 * so the patient sees the same "19 Apr 2026" label in both the DM body
 * and the page header. Locale-stable using a fixed locale + format
 * options so server-side renders match client hydration.
 */
function formatReadonlyDateLabel(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return d.toLocaleDateString("en-GB", {
      day:   "numeric",
      month: "short",
      year:  "numeric",
    });
  } catch {
    return null;
  }
}

function statusError(status: TextConsultSessionStatus): string | null {
  if (status === "ended") return "This consult has ended.";
  if (status === "cancelled") return "This consult was cancelled.";
  if (status === "no_show") return "This consult was marked as a no-show.";
  return null;
}

function isAtBottom(el: HTMLElement | null, slack = 80): boolean {
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < slack;
}

// ============================================================================
// Component
// ============================================================================

export default function TextConsultRoom({
  sessionId,
  currentUserId,
  currentUserRole,
  accessToken,
  sessionStatus: initialStatus,
  counterpartyName,
  onRequestTokenRefresh,
  mode = "live",
  consultEndedAt,
  layout = "standalone",
  onIncomingMessage,
}: TextConsultRoomProps): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connection, setConnection] = useState<ConnectionStatus>("reconnecting");
  const [sessionStatus, setSessionStatus] = useState<TextConsultSessionStatus>(initialStatus);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [counterpartyOnline, setCounterpartyOnline] = useState(false);
  const [counterpartyTyping, setCounterpartyTyping] = useState(false);

  // Plan 06 · Task 38 — ref so Realtime INSERT callback picks up the
  // latest host-supplied handler without needing to re-subscribe.
  const onIncomingMessageRef = useRef(onIncomingMessage);
  useEffect(() => {
    onIncomingMessageRef.current = onIncomingMessage;
  }, [onIncomingMessage]);

  // Refs that survive token-refresh / reconnect cycles.
  const accessTokenRef = useRef(accessToken);
  const clientRef = useRef<SupabaseClient | null>(null);
  const insertChannelRef = useRef<RealtimeChannel | null>(null);
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const lastSeenAtRef = useRef<string | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingBroadcastRef = useRef<number>(0);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const wasAtBottomRef = useRef(true);
  const queuedSendsRef = useRef<ChatMessage[]>([]);
  const offlineSinceRef = useRef<number | null>(null);
  const offlineBadgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Keep refs in sync with state — used in stable callbacks below.
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  // ------------------------------------------------------------------------
  // Token refresh + 401 handling
  // ------------------------------------------------------------------------

  const refreshToken = useCallback(async (): Promise<string | null> => {
    if (!onRequestTokenRefresh) return null;
    try {
      const next = await onRequestTokenRefresh();
      if (!next || typeof next !== "string") return null;
      accessTokenRef.current = next;
      return next;
    } catch {
      return null;
    }
  }, [onRequestTokenRefresh]);

  // ------------------------------------------------------------------------
  // Realtime + REST plumbing
  // ------------------------------------------------------------------------

  const buildClient = useCallback((token: string): SupabaseClient => {
    return createScopedRealtimeClient(token);
  }, []);

  /**
   * Tear down the client + both channels. Safe to call from cleanup
   * paths even when partially initialised.
   */
  const teardown = useCallback(() => {
    if (insertChannelRef.current && clientRef.current) {
      clientRef.current.removeChannel(insertChannelRef.current);
    }
    if (presenceChannelRef.current && clientRef.current) {
      clientRef.current.removeChannel(presenceChannelRef.current);
    }
    insertChannelRef.current = null;
    presenceChannelRef.current = null;
    clientRef.current = null;
  }, []);

  /**
   * Catch-up SELECT for messages that landed while we were disconnected
   * (or on first mount). Filters by `created_at > lastSeenAt` when we
   * have a checkpoint; otherwise pulls the full session history (capped
   * at 200 — past-200 replay is a Plan 07 concern).
   */
  const fetchMissedMessages = useCallback(
    async (client: SupabaseClient): Promise<ChatMessage[]> => {
      let query = client
        .from("consultation_messages")
        .select(
          "id, session_id, sender_id, sender_role, body, created_at, kind, attachment_url, attachment_mime_type, attachment_byte_size, system_event",
        )
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (lastSeenAtRef.current) {
        query = query.gt("created_at", lastSeenAtRef.current);
      }
      const { data, error } = await query;
      if (error) {
        // 401 = expired JWT; bubble to caller for reconnect-with-refresh.
        const status = (error as { status?: number; code?: string }).status;
        if (status === 401) {
          throw Object.assign(new Error("token-expired"), { code: "401" });
        }
        throw error;
      }
      return ((data ?? []) as ConsultationMessageRow[]).map(rowToMessage);
    },
    [sessionId],
  );

  /**
   * Merge fresh rows into local state — dedupes by id (so optimistic
   * sends don't double up when the Realtime echo arrives) and keeps
   * chronological order.
   */
  const mergeMessages = useCallback((incoming: ChatMessage[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      for (const msg of incoming) {
        const existing = byId.get(msg.id);
        if (existing) {
          // Promote optimistic row to server-acked: clear pending, refresh ts.
          byId.set(msg.id, {
            ...existing,
            ...msg,
            pending: false,
            failed: false,
            retryBody: undefined,
          });
        } else {
          byId.set(msg.id, msg);
        }
      }
      const merged = Array.from(byId.values()).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      // Update lastSeenAt to the most recent server-acked row.
      for (let i = merged.length - 1; i >= 0; i -= 1) {
        if (!merged[i].pending && !merged[i].failed) {
          lastSeenAtRef.current = merged[i].createdAt;
          break;
        }
      }
      return merged;
    });
  }, []);

  /**
   * One full connect cycle: build client, do catch-up SELECT, attach
   * INSERT + presence channels, flush queued sends. Returns true on
   * success, false on permanent error (caller schedules backoff).
   */
  const connect = useCallback(async (): Promise<boolean> => {
    if (!mountedRef.current) return false;
    teardown();
    setConnection("reconnecting");

    let token = accessTokenRef.current;
    if (!token) {
      const refreshed = await refreshToken();
      if (!refreshed) return false;
      token = refreshed;
    }

    let client: SupabaseClient;
    try {
      client = buildClient(token);
    } catch {
      return false;
    }
    clientRef.current = client;

    // Catch-up SELECT first so we have a stable lastSeenAt before
    // subscribing — avoids a brief gap window where a Realtime INSERT
    // could land between SELECT and subscribe.
    try {
      const missed = await fetchMissedMessages(client);
      if (!mountedRef.current) return false;
      mergeMessages(missed);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "401") {
        const refreshed = await refreshToken();
        if (!refreshed || !mountedRef.current) return false;
        // Rebuild with fresh token and retry.
        teardown();
        client = buildClient(refreshed);
        clientRef.current = client;
        try {
          const missed = await fetchMissedMessages(client);
          mergeMessages(missed);
        } catch {
          return false;
        }
      } else {
        return false;
      }
    }

    // Plan 07 · Task 31 — readonly mode short-circuits AFTER the catch-up
    // SELECT. We deliberately skip:
    //   - the INSERT Realtime subscription (no live updates expected
    //     — the session is `ended`; new rows would be RLS-rejected
    //     anyway by Migration 051's INSERT policy),
    //   - the presence channel (no online dot / typing affordance —
    //     these only make sense for two parties actively chatting),
    //   - the queued-sends flush (composer is gone from the DOM, so
    //     `queuedSendsRef` is always empty in readonly).
    // Setting connection='online' so that any conditional UI that
    // depends on `connection` doesn't show a misleading
    // "Reconnecting…" badge — but in readonly the watermark replaces
    // the badge entirely, so this mostly matters for ARIA cleanliness.
    if (mode === "readonly") {
      setConnection("online");
      reconnectAttemptRef.current = 0;
      offlineSinceRef.current = null;
      return true;
    }

    // INSERT subscription — RLS scopes to session_id via the JWT, but
    // we also pass the filter to keep the wire payload minimal.
    const insertChannel = client
      .channel(`messages:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "consultation_messages",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as ConsultationMessageRow;
          const msg = rowToMessage(row);
          mergeMessages([msg]);
          // Plan 06 · Task 38 — fire for the HOST surface's unread badge.
          // Swallow handler errors defensively: a buggy parent must not
          // break the chat rendering path.
          try {
            onIncomingMessageRef.current?.({
              id: msg.id,
              kind: msg.kind,
              senderRole: msg.senderRole,
              systemEvent: msg.systemEvent ?? null,
              body: msg.body,
            });
          } catch {
            // best-effort — host responsibility
          }
        },
      )
      .subscribe((status) => {
        if (!mountedRef.current) return;
        if (status === "SUBSCRIBED") {
          setConnection("online");
          reconnectAttemptRef.current = 0;
          offlineSinceRef.current = null;
          // Flush any sends queued while disconnected.
          if (queuedSendsRef.current.length > 0) {
            const queue = queuedSendsRef.current.slice();
            queuedSendsRef.current = [];
            for (const m of queue) void doSendInsert(m);
          }
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          scheduleReconnect();
        }
      });
    insertChannelRef.current = insertChannel;

    // Presence channel — broadcast our identity, listen for the
    // counterparty's joins/leaves + typing broadcasts.
    const presenceChannel = client.channel(`${PRESENCE_CHANNEL_PREFIX}:${sessionId}`, {
      config: { presence: { key: currentUserId } },
    });
    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        // Anyone present whose key differs from ours = counterparty online.
        const others = Object.keys(state).filter((k) => k !== currentUserId);
        setCounterpartyOnline(others.length > 0);
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const p = payload as { user_id?: string; typing?: boolean };
        if (!p || p.user_id === currentUserId) return;
        setCounterpartyTyping(Boolean(p.typing));
      })
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        try {
          await presenceChannel.track({
            user_id: currentUserId,
            role: currentUserRole,
            online_at: new Date().toISOString(),
          });
        } catch {
          // Tracking failure is non-fatal — we still appear online to
          // ourselves and can chat. Counterparty just won't see our dot.
        }
      });
    presenceChannelRef.current = presenceChannel;

    return true;
    // doSendInsert / scheduleReconnect are stable refs declared below;
    // declaring them inline above would create a circular dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    buildClient,
    currentUserId,
    currentUserRole,
    fetchMissedMessages,
    mergeMessages,
    mode,
    refreshToken,
    sessionId,
    teardown,
  ]);

  /**
   * Reconnect with exponential backoff. Capped at the last entry of
   * RECONNECT_BACKOFF_MS so we don't sleep forever.
   */
  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return;
    setConnection("reconnecting");
    if (offlineSinceRef.current === null) {
      offlineSinceRef.current = Date.now();
      // Flip to "offline" if we stay down past 30s — surface the red badge.
      if (offlineBadgeTimerRef.current) clearTimeout(offlineBadgeTimerRef.current);
      offlineBadgeTimerRef.current = setTimeout(() => {
        if (mountedRef.current && offlineSinceRef.current !== null) {
          setConnection("offline");
        }
      }, 30_000);
    }
    const idx = Math.min(reconnectAttemptRef.current, RECONNECT_BACKOFF_MS.length - 1);
    const delay = RECONNECT_BACKOFF_MS[idx];
    reconnectAttemptRef.current += 1;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = setTimeout(() => {
      void connect().then((ok) => {
        if (!ok) scheduleReconnect();
      });
    }, delay);
  }, [connect]);

  // ------------------------------------------------------------------------
  // Send (optimistic + RLS-checked INSERT)
  // ------------------------------------------------------------------------

  const doSendInsert = useCallback(
    async (msg: ChatMessage): Promise<void> => {
      const client = clientRef.current;
      const body = msg.retryBody ?? msg.body;
      if (!client) {
        // No live client → queue and let reconnect drain.
        queuedSendsRef.current.push(msg);
        return;
      }
      try {
        const { error } = await client.from("consultation_messages").insert({
          id: msg.id,
          session_id: sessionId,
          sender_id: currentUserId,
          sender_role: currentUserRole,
          body,
        });
        if (error) {
          const status = (error as { status?: number; code?: string }).status;
          if (status === 401) {
            const refreshed = await refreshToken();
            if (refreshed) {
              // Reconnect will rebuild client; queue this send for the
              // post-subscribe flush.
              queuedSendsRef.current.push({ ...msg, retryBody: body });
              scheduleReconnect();
              return;
            }
          }
          // Non-401 error: mark failed; user can retry from the bubble.
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msg.id
                ? { ...m, pending: false, failed: true, retryBody: body }
                : m,
            ),
          );
          return;
        }
        // Success: the Realtime echo will promote the row. As a fallback
        // (if Realtime drops), clear pending immediately.
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id
              ? { ...m, pending: false, failed: false, retryBody: undefined }
              : m,
          ),
        );
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id
              ? { ...m, pending: false, failed: true, retryBody: body }
              : m,
          ),
        );
      }
    },
    [currentUserId, currentUserRole, refreshToken, scheduleReconnect, sessionId],
  );

  const handleSend = useCallback(() => {
    const body = composer.trim();
    if (!body || sending) return;
    if (sessionStatus !== "live") return;
    if (!isUuid(currentUserId)) return; // safety — sender_id is UUID NOT NULL

    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimistic: ChatMessage = {
      id,
      sessionId,
      senderId: currentUserId,
      senderRole: currentUserRole,
      body,
      createdAt: new Date().toISOString(),
      kind: "text",
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setComposer("");
    setSending(false);
    // Stop typing on send.
    broadcastTyping(false);
    void doSendInsert(optimistic);
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    });
    // broadcastTyping is declared after handleSend in source order but
    // is hoisted via useCallback ref — including it in deps would create
    // a forward reference that ESLint can't statically resolve. The
    // closure picks up the latest broadcastTyping at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composer, currentUserId, currentUserRole, doSendInsert, sending, sessionId, sessionStatus]);

  const handleRetry = useCallback(
    (id: string) => {
      const target = messagesRef.current.find((m) => m.id === id);
      if (!target) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, pending: true, failed: false } : m,
        ),
      );
      void doSendInsert({ ...target, pending: true, failed: false });
    },
    [doSendInsert],
  );

  // ------------------------------------------------------------------------
  // Typing broadcast
  // ------------------------------------------------------------------------

  const broadcastTyping = useCallback(
    (typing: boolean) => {
      const ch = presenceChannelRef.current;
      if (!ch) return;
      const now = Date.now();
      if (typing) {
        if (now - lastTypingBroadcastRef.current < TYPING_BROADCAST_THROTTLE_MS) return;
        lastTypingBroadcastRef.current = now;
      }
      void ch.send({
        type: "broadcast",
        event: "typing",
        payload: { user_id: currentUserId, typing, ts: now },
      });
    },
    [currentUserId],
  );

  const handleComposerChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      setComposer(e.target.value);
      if (e.target.value.length > 0) {
        broadcastTyping(true);
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => {
          broadcastTyping(false);
        }, TYPING_IDLE_MS);
      } else {
        broadcastTyping(false);
      }
      // Auto-grow.
      const ta = e.target;
      ta.style.height = "auto";
      const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 20;
      const maxPx = lineHeight * COMPOSER_MAX_LINES + 16; // padding fudge
      ta.style.height = Math.min(ta.scrollHeight, maxPx) + "px";
    },
    [broadcastTyping],
  );

  const handleComposerKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      handleSend();
    },
    [handleSend],
  );

  // ------------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------------

  // Mount → connect. Re-run only when sessionId changes (new room).
  useEffect(() => {
    mountedRef.current = true;
    void connect().then((ok) => {
      if (!ok) scheduleReconnect();
    });

    const onBeforeUnload = () => {
      try {
        presenceChannelRef.current?.untrack();
      } catch {
        // best-effort
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", onBeforeUnload);
    }

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (offlineBadgeTimerRef.current) clearTimeout(offlineBadgeTimerRef.current);
      teardown();
      if (typeof window !== "undefined") {
        window.removeEventListener("beforeunload", onBeforeUnload);
      }
    };
    // sessionId is the only true identity dependency; the rest are stable
    // refs / callbacks via useCallback. Avoiding re-mount on every prop
    // change is critical so active subscriptions don't churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Track scroll position so auto-scroll only fires when user was at bottom.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      wasAtBottomRef.current = isAtBottom(el);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-scroll on new messages if user was at bottom before.
  useEffect(() => {
    if (!listRef.current) return;
    if (wasAtBottomRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  // ------------------------------------------------------------------------
  // Status badge derivation
  // ------------------------------------------------------------------------

  const composerLockReason: string | null = useMemo(() => {
    if (mode === "readonly") return "This is a read-only view.";
    const ended = statusError(sessionStatus);
    if (ended) return ended;
    if (connection === "offline") return "Reconnecting — your message will send when back online.";
    if (connection === "reconnecting")
      return "Reconnecting — your message will send when back online.";
    return null;
  }, [connection, mode, sessionStatus]);

  const counterpartyLabel =
    counterpartyName?.trim() ||
    (currentUserRole === "doctor" ? "Patient" : "Your doctor");

  const statusBadgeClass =
    connection === "online"
      ? "bg-green-100 text-green-800"
      : connection === "reconnecting"
        ? "bg-amber-100 text-amber-800"
        : "bg-red-100 text-red-800";
  const statusBadgeDot =
    connection === "online" ? "bg-green-500" : connection === "reconnecting" ? "bg-amber-500" : "bg-red-500";
  const statusBadgeText =
    connection === "online" ? "Online" : connection === "reconnecting" ? "Reconnecting…" : "Offline";

  // ------------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------------

  const ended = statusError(sessionStatus);

  // Plan 06 · Task 38 — layout-driven container + bubble styling. The
  // visual diff is pure CSS; no plumbing branches. `standalone` keeps
  // the Task 19 baseline verbatim; `panel` drops the outer frame (the
  // `<VideoRoom>` parent owns the border) + header (parent owns it);
  // `canvas` keeps a slim header for the voice-room single-pane mount.
  const containerClass =
    layout === "standalone"
      ? "flex h-[100dvh] w-full flex-col bg-white md:h-full md:min-h-[480px] md:rounded-lg md:border md:border-gray-200"
      : layout === "canvas"
        ? "flex h-full min-h-[320px] w-full flex-col bg-white"
        : // 'panel'
          "flex h-full min-h-[320px] w-full flex-col bg-white";
  const bubbleMaxWidth =
    layout === "panel" ? "max-w-[90%]" : layout === "canvas" ? "max-w-[75%]" : "max-w-[80%]";

  return (
    <div
      className={containerClass}
      data-testid="text-consult-room"
      data-layout={layout}
      data-mode={mode}
    >
      {/* Plan 07 · Task 31 — readonly watermark replaces the standard
          online/typing header. Online dot + Reconnecting badge are
          meaningless when no Realtime sub is attached, so we suppress
          them entirely and use the header band as the "Read-only"
          watermark surface. Style per task-31 Notes #8: muted bg,
          small text, lock icon prefix, dated when we have an end-at. */}
      {mode === "readonly" ? (
        <div
          className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-600"
          role="status"
          aria-label="This is a read-only view of the consultation"
          data-testid="text-consult-room-readonly-watermark"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>
            {formatReadonlyDateLabel(consultEndedAt)
              ? `Read-only — view of your consultation on ${formatReadonlyDateLabel(consultEndedAt)}`
              : "Read-only — view of your consultation"}
          </span>
        </div>
      ) : layout === "panel" ? null : (
        <header
          className={
            layout === "canvas"
              ? "flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-3 py-2"
              : "flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3"
          }
        >
          <div className="min-w-0 flex-1">
            <p className={layout === "canvas" ? "truncate text-xs font-semibold text-gray-900" : "truncate text-sm font-semibold text-gray-900"}>
              {counterpartyLabel}
            </p>
            <p className="flex items-center gap-2 text-xs text-gray-500">
              <span
                className={
                  "inline-block h-2 w-2 rounded-full " +
                  (counterpartyOnline ? "bg-green-500" : "bg-gray-300")
                }
                aria-hidden
              />
              <span>{counterpartyOnline ? "Online" : "Offline"}</span>
              {counterpartyTyping ? (
                <span className="ml-2 italic text-gray-600" aria-live="polite">
                  Typing…
                </span>
              ) : null}
            </p>
          </div>
          <span
            className={"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium " + statusBadgeClass}
            role="status"
            aria-live="polite"
          >
            <span className={"inline-block h-1.5 w-1.5 rounded-full " + statusBadgeDot} aria-hidden />
            {statusBadgeText}
          </span>
        </header>
      )}

      {/* Messages list */}
      {/* TODO(plan-04 task-19 followup): introduce react-window when an
          observed session crosses ~200 messages. Avg consult is < 50. */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto bg-gray-50 px-3 py-3"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-gray-500">
            Say hello to start the consult.
          </div>
        ) : (
          <ul className="space-y-2">
            {messages.map((m, i) => {
              // Plan 06 · Task 38 — system rows render as a full-width
              // italic banner line with a clock icon prefix. Not a
              // bubble. No align, no retry, no timestamp group label —
              // they're informational, not conversational.
              if (m.kind === "system") {
                return (
                  <li key={m.id} className="flex items-center justify-center">
                    <p
                      className="inline-flex items-center gap-1.5 text-center text-xs italic text-gray-500"
                      data-system-event={m.systemEvent ?? undefined}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      <span>{m.body}</span>
                    </p>
                  </li>
                );
              }

              const isSelf = m.senderId === currentUserId;
              const showTs = shouldShowTimestamp(messages[i - 1], m);
              const align = isSelf ? "items-end" : "items-start";
              const bubble =
                isSelf
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-900 border border-gray-200";
              return (
                <li key={m.id} className={"flex flex-col " + align}>
                  {showTs ? (
                    <p className="mb-0.5 px-1 text-[11px] text-gray-500">{formatTime(m.createdAt)}</p>
                  ) : null}
                  <div
                    className={
                      bubbleMaxWidth +
                      " whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm shadow-sm " +
                      bubble +
                      (m.pending ? " opacity-70" : "") +
                      (m.failed ? " ring-1 ring-red-400" : "")
                    }
                  >
                    {/*
                      Plan 06 · Task 38 — attachment rendering v1 per
                      task-38 Out of scope #1: a generic 📎 line with a
                      tap-to-download link. Rich previews (image thumb,
                      PDF viewer) land in the follow-up captured in
                      `docs/capture/inbox.md`.
                    */}
                    {m.kind === "attachment" && m.attachmentUrl ? (
                      <a
                        href={m.attachmentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={
                          "inline-flex items-center gap-1.5 underline " +
                          (isSelf ? "text-white" : "text-blue-700")
                        }
                      >
                        <span aria-hidden>📎</span>
                        <span>{m.body || "Attachment"}</span>
                      </a>
                    ) : (
                      m.body
                    )}
                  </div>
                  {m.failed ? (
                    <button
                      type="button"
                      onClick={() => handleRetry(m.id)}
                      className="mt-1 text-xs text-red-600 underline hover:text-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
                      aria-label="Retry sending this message"
                    >
                      ⟳ Retry
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Pre-session banner (when status === 'scheduled') */}
      {sessionStatus === "scheduled" && !ended ? (
        <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Your consult hasn’t started yet. The chat will open as soon as the doctor begins the session.
        </div>
      ) : null}

      {/* End-state banner — suppressed in readonly because the
          watermark header already says "view of your consultation on
          {date}", which conveys the same "this is over" signal without
          stacking two banners. */}
      {ended && mode !== "readonly" ? (
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-700">{ended}</div>
      ) : null}

      {/* Composer */}
      {mode === "live" && !ended ? (
        <form
          onSubmit={handleSubmit}
          className="border-t border-gray-200 bg-white px-3 py-2"
        >
          <div className="flex items-end gap-2">
            <button
              type="button"
              disabled
              title="Attachments coming soon"
              aria-label="Attach a file (coming soon)"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 disabled:cursor-not-allowed"
            >
              📎
            </button>
            <textarea
              ref={composerRef}
              value={composer}
              onChange={handleComposerChange}
              onKeyDown={handleComposerKeyDown}
              placeholder={composerLockReason ?? "Type a message…"}
              disabled={composerLockReason !== null}
              title={composerLockReason ?? undefined}
              rows={1}
              aria-label="Message"
              className="min-h-[36px] flex-1 resize-none rounded-2xl border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100"
            />
            <button
              type="submit"
              disabled={composerLockReason !== null || composer.trim().length === 0}
              aria-label="Send message"
              className="flex h-9 shrink-0 items-center justify-center rounded-full bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              Send
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
