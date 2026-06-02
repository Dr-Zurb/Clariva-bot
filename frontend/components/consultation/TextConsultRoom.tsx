"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { Clock, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { createScopedRealtimeClient } from "@/lib/supabase/scoped-client";
import { signAttachmentUrls } from "@/lib/api";
import { formatDate, formatTime } from "@/lib/format-date";
import { buildMessageRows } from "@/lib/text/build-message-rows";
import {
  applyMarkdownToolbarAction,
  renderMarkdownLite,
  type MarkdownToolbarAction,
} from "@/lib/text/markdown-lite";
import {
  discardFailedMessage,
  markMessageRetrying,
} from "@/lib/text/failed-message-mutations";
import { Avatar } from "@/components/consultation/Avatar";
import { MessageList } from "@/components/consultation/MessageList";
import { PinnedMessagesBanner } from "@/components/consultation/PinnedMessagesBanner";
import { CameraPreviewOverlay } from "@/components/consultation/CameraPreviewOverlay";
import { ImageLightbox } from "@/components/consultation/ImageLightbox";
import { ReactionPicker } from "@/components/consultation/ReactionPicker";
import TextChatJumpToLatest from "@/components/consultation/TextChatJumpToLatest";
import {
  isReactionEmoji,
  type ConsultationMessageReaction,
  type ReactionEmoji,
} from "@/lib/text/aggregate-reactions";
import { projectConsultationMessageRow } from "@/lib/text/text-session-supabase";
import { buildChatImageLightboxImages } from "@/lib/text/image-lightbox-images";
import {
  appendDictationFinal,
  isSpeechRecognitionSupported,
  SPEECH_RECOGNITION_LOCALES,
  useSpeechRecognition,
} from "@/lib/text/use-speech-recognition";
import { useComposerHotkeys } from "@/lib/text/use-composer-hotkeys";
import { useComposerDraft } from "@/lib/text/use-composer-draft";
import { useTabPresenceClaim } from "@/lib/text/use-tab-presence-claim";
import { useChatQualitySampler } from "@/lib/text/use-chat-quality-sampler";
import { useRateLimitCooldown } from "@/lib/text/use-rate-limit-cooldown";
import { usePushSubscription } from "@/lib/text/use-push-subscription";
import { PushOptInBanner } from "@/components/consultation/PushOptInBanner";
import { LocalNotificationConsentPrompt } from "@/components/consultation/LocalNotificationConsentPrompt";
import {
  clearLocalNotificationNavigation,
  configureLocalNotificationNavigation,
  dismissLocalNotifPrompt,
  fireLocalNotification,
  isLocalNotifPromptDismissed,
  isLocalNotifPromptSnoozed,
  snoozeLocalNotifPrompt,
} from "@/lib/push/local-notifications";
import { ConnectionQualityBadge } from "@/components/consultation/ConnectionQualityBadge";
import { findLastEditableOwnMessage } from "@/lib/text/edit-message-eligibility";
import type { ConsultationMessage, ConsultationMessageKind } from "@/lib/text/types";

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
 *   - Per-message read receipts in DB — text-A7 uses ephemeral
 *     `viewed-bottom` broadcasts (local `seen` state only).
 *   - Message threading (edit/delete ship in text-B6).
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
 * render with a 📎 download link (v1 polish follow-up in `docs/Work/capture/inbox.md`);
 * `system` rows render as an italic banner line with a clock icon (Task 37
 * writes them; Task 38 is the first render surface).
 */
export type { ConsultationMessageKind } from "@/lib/text/types";

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
  /**
   * Plan 06 metadata JSON for system rows (`hold_changed`, `mute_changed`, …).
   * Host surfaces use this to sync bilateral call state without a second
   * Realtime subscription (voice B3 / task-voice-B3).
   */
  metadata?: Record<string, unknown> | null;
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
  /**
   * CP-D5: Mark patient as no-show while the text consult is live.
   * When supplied (cockpit + doctor role only), renders a destructive-ghost
   * button next to the composer with a 2-step confirm pattern matching
   * VideoRoom / VoiceConsultRoom. Optional so legacy / patient callers are
   * unaffected.
   */
  onMarkNoShow?: () => void | Promise<void>;
  /**
   * text-C7 — files received via PWA share-target; queued into the
   * composer attachment row on first mount (live mode only).
   */
  initialShareTargetFiles?: File[];
}

type ChatMessage = ConsultationMessage;

type ConnectionStatus = "online" | "reconnecting" | "offline";

/**
 * text-A3 — send button visual state machine.
 *
 * text-D5 — extended with `'rate-limited'` for the local mirror of the
 * server-side INSERT rate limit (30 msg/min/sender/session). The
 * rate-check is a UX hint, not a security boundary; the server-side
 * `check_chat_insert_rate()` SQL function (migration 110) is the
 * authoritative enforcer.
 */
export type SendButtonState =
  | "idle"
  | "ready"
  | "sending"
  | "queued"
  | "disabled-too-long"
  | "rate-limited";

export function deriveSendButtonState({
  composerTrim,
  sending,
  connection,
  charCountOverCap,
  hasAttachments = false,
  rateLimited = false,
}: {
  composerTrim: string;
  sending: boolean;
  connection: ConnectionStatus;
  charCountOverCap: boolean;
  hasAttachments?: boolean;
  /** text-D5 — true when the local in-window count has hit the cap. */
  rateLimited?: boolean;
}): SendButtonState {
  if (charCountOverCap) return "disabled-too-long";
  if (sending) return "sending";
  const hasPayload = !!composerTrim || hasAttachments;
  if (!hasPayload) return "idle";
  // text-D5: rate-limit gates payload-bearing states only — keeps the
  // empty composer in 'idle' so the cap doesn't visually trap a user
  // who's just typed nothing yet.
  if (rateLimited) return "rate-limited";
  if (connection !== "online") return "queued";
  return "ready";
}

/** text-B8 — queued files before send (max 5 per batch). */
export interface ComposerAttachment {
  localId: string;
  file: File;
  previewUrl: string;
  mime: string;
  sizeBytes: number;
}

const MAX_COMPOSER_ATTACHMENTS = 5;

/** text-B9 — true when the drag payload includes OS files (not in-app drags). */
export function dragDataTransferHasFiles(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types).includes("Files");
}

/**
 * text-B9 — `preventDefault` on dragover is required or `drop` never fires.
 * Exported for unit tests.
 */
export function preventDefaultIfFileDrag(e: {
  dataTransfer: DataTransfer | null;
  preventDefault: () => void;
}): void {
  if (dragDataTransferHasFiles(e.dataTransfer)) {
    e.preventDefault();
  }
}

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
  metadata?: Record<string, unknown> | null;
  batch_id?: string | null;
  reply_to_id?: string | null;
  edited_at?: string | null;
  deleted_at?: string | null;
  pinned_at?: string | null;
  pinned_by?: string | null;
}

/** text-B4 — composer reply-mode target (one level). */
interface ReplyToTarget {
  id: string;
  senderRole: "doctor" | "patient";
  body: string;
  senderName: string;
}

// ============================================================================
// Constants
// ============================================================================

/** text-B7 — doctor-only pin cap enforced at RLS; UI mirrors for fast feedback. */
const MAX_PINNED_MESSAGES = 3;

const CONSULTATION_MESSAGE_SELECT =
  "id, session_id, sender_id, sender_role, body, created_at, kind, attachment_url, attachment_mime_type, attachment_byte_size, system_event, metadata, batch_id, reply_to_id, edited_at, deleted_at, pinned_at, pinned_by";

/** Backoff schedule for reconnect (ms). Caps at the last entry. */
const RECONNECT_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

/** How long without keydown before we broadcast typing:false. */
const TYPING_IDLE_MS = 3_000;

/** Floor between successive typing:true broadcasts. */
const TYPING_BROADCAST_THROTTLE_MS = 1_000;

/** text-A7 — cap `viewed-bottom` broadcasts during rapid INSERT bursts. */
const VIEWED_BOTTOM_THROTTLE_MS = 500;

/**
 * Receiver-side cap: hide the typing indicator if no typing:true arrives
 * within this window (guards tab-close mid-typing without typing:false).
 */
const TYPING_VISIBILITY_CAP_MS = 5_000;

/** Composer auto-grow cap. */
const COMPOSER_MAX_LINES = 4;

/** T1.6 — show `{length} / 4000` once the draft crosses this threshold. */
const COMPOSER_COUNTER_DISPLAY_THRESHOLD = 500;

/** T1.6 — UX hard cap; send + Enter-key path blocked above this. */
const COMPOSER_HARD_CAP = 4000;

/** T1.2 — persisted dismissal for the inline keyboard-hint row. */
const CHAT_HINT_DISMISSED_KEY = "chat_hint_dismissed_v1";

const PRESENCE_CHANNEL_PREFIX = "text-presence";

/**
 * Plan 06 attachments — MIME allowlist. MUST mirror migration 082's
 * `consultation_messages_attachment_mime_allowlist_check` exactly. The DB
 * is the source of truth; this client-side check produces a friendlier
 * error before the request hits the network.
 *
 * Audio MIMEs are intentionally omitted (the "no voice notes" decision —
 * see migration 082 head comment).
 */
const ATTACHMENT_MIME_ALLOWLIST: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "application/pdf",
  // T1.6 attach-as-file CTA — long composer bodies export as `.txt`.
  "text/plain",
]);

/** 10 MiB — mirrors migration 082's max-byte-size CHECK. */
const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/** Storage bucket from migration 051; private; signed URLs at render time. */
const ATTACHMENT_BUCKET = "consultation-attachments";

// ============================================================================
// Helpers
// ============================================================================

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

interface ConsultationMessageReactionRow {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

function rowToReaction(row: ConsultationMessageReactionRow): ConsultationMessageReaction | null {
  if (!isReactionEmoji(row.emoji)) return null;
  return {
    id: row.id,
    message_id: row.message_id,
    user_id: row.user_id,
    emoji: row.emoji,
    created_at: row.created_at,
  };
}

function rowToMessage(row: ConsultationMessageRow): ChatMessage {
  const projected = projectConsultationMessageRow(row);
  const role: ChatMessage["senderRole"] =
    projected.sender_role === "doctor" ||
    projected.sender_role === "patient" ||
    projected.sender_role === "system"
      ? projected.sender_role
      : "system";
  const kind: ConsultationMessageKind =
    projected.kind === "attachment" || projected.kind === "system" ? projected.kind : "text";
  return {
    id: projected.id,
    sessionId: projected.session_id,
    senderId: projected.sender_id,
    senderRole: role,
    body: projected.body ?? "",
    createdAt: projected.created_at,
    kind,
    attachmentUrl: projected.attachment_url ?? null,
    attachmentMimeType: projected.attachment_mime_type ?? null,
    attachmentByteSize: projected.attachment_byte_size ?? null,
    systemEvent: projected.system_event ?? null,
    metadata:
      projected.metadata && typeof projected.metadata === "object"
        ? (projected.metadata as Record<string, unknown>)
        : null,
    batch_id: projected.batch_id ?? null,
    reply_to_id: projected.reply_to_id ?? null,
    edited_at: projected.edited_at ?? null,
    deleted_at: projected.deleted_at ?? null,
    pinned_at: projected.pinned_at ?? null,
    pinned_by: projected.pinned_by ?? null,
  };
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
  return formatDate(d, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Plan 06 attachments — map MIME to a sane file extension for the storage
 * object key. The allowlist guarantees we only see these MIMEs; the
 * `bin` fallback is dead code under normal flow but keeps the function
 * total.
 */
function extForAttachmentMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
      return "heic";
    case "image/heif":
      return "heif";
    case "image/gif":
      return "gif";
    case "application/pdf":
      return "pdf";
    case "text/plain":
      return "txt";
    default:
      return "bin";
  }
}

function formatBytesShort(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function statusError(status: TextConsultSessionStatus): string | null {
  if (status === "ended") return "This consult has ended.";
  if (status === "cancelled") return "This consult was cancelled.";
  if (status === "no_show") return "This consult was marked as a no-show.";
  return null;
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
  onMarkNoShow,
  initialShareTargetFiles,
}: TextConsultRoomProps): JSX.Element {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  /** text-B5 — reactions keyed by message id. */
  const [reactionsByMessageId, setReactionsByMessageId] = useState<
    Record<string, ConsultationMessageReaction[]>
  >({});
  const [reactionPicker, setReactionPicker] = useState<{
    messageId: string;
    anchor: HTMLElement | null;
    coords?: { x: number; y: number };
  } | null>(null);
  /** text-C2 — full-screen image viewer state (live + readonly). */
  const [lightboxState, setLightboxState] = useState<{
    images: { src: string; alt: string; messageId: string }[];
    index: number;
  } | null>(null);
  /** text-B6 — inline edit target (one bubble at a time). C6 Up-arrow sets this via startEditOnMessage. */
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ messageId: string } | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>("reconnecting");

  const chatQuality = useChatQualitySampler({
    sessionId,
    role: currentUserRole,
    accessToken,
    enabled: mode === "live",
  });
  const chatQualityRef = useRef(chatQuality);
  chatQualityRef.current = chatQuality;

  /**
   * text-D5 — local mirror of the server-side INSERT rate limit
   * (`check_chat_insert_rate()` in migration 110). Tracks this tab's
   * own sends in a rolling 60s window and exposes:
   *   - `isRateLimited`: true at >= 30 in-window sends;
   *   - `cooldownSecondsRemaining`: seconds until the oldest entry
   *     ages out (drives the Send button countdown).
   * `mode='readonly'` never sends, so we skip the hook overhead.
   */
  const rateLimit = useRateLimitCooldown();
  const rateLimitRef = useRef(rateLimit);
  rateLimitRef.current = rateLimit;

  const pushOptInEnabled =
    mode === "live" && layout === "standalone" && currentUserRole === "patient";
  const pushOptInEnabledRef = useRef(pushOptInEnabled);
  pushOptInEnabledRef.current = pushOptInEnabled;
  const pushSubscription = usePushSubscription({
    accessToken,
    enabled: pushOptInEnabled,
  });
  const [pushOptInEligible, setPushOptInEligible] = useState(false);
  const sawCounterpartyMessageRef = useRef(false);
  /** task-text-D7 — latest realtime inbound row for local notification hook. */
  const latestInboundMessageRef = useRef<ChatMessage | null>(null);
  const [latestInboundMessageId, setLatestInboundMessageId] = useState<string | null>(null);
  const [inboundMessageReceived, setInboundMessageReceived] = useState(false);
  const [localNotifPromptHidden, setLocalNotifPromptHidden] = useState(() =>
    isLocalNotifPromptDismissed(sessionId) || isLocalNotifPromptSnoozed(sessionId),
  );
  const [localNotifPermission, setLocalNotifPermission] = useState<
    NotificationPermission | "unsupported"
  >(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    return Notification.permission;
  });

  const showLocalNotificationConsentPrompt =
    mode === "live" &&
    currentUserRole === "patient" &&
    inboundMessageReceived &&
    localNotifPermission === "default" &&
    !localNotifPromptHidden &&
    !isLocalNotifPromptSnoozed(sessionId) &&
    !isLocalNotifPromptDismissed(sessionId);

  const showPushOptInBanner =
    pushOptInEnabled &&
    pushOptInEligible &&
    pushSubscription.permission === "default" &&
    !pushSubscription.isDismissed &&
    !pushSubscription.notSupported &&
    !pushSubscription.subscribed;

  const pushCounterpartyLabel = counterpartyName?.trim() || "your doctor";

  useEffect(() => {
    configureLocalNotificationNavigation(router.push);
    return () => {
      clearLocalNotificationNavigation();
    };
  }, [router]);

  // Mirror of `connection` for closures (visibilitychange handler) that
  // can't see the latest state value through the effect's stale closure.
  const connectionRef = useRef<ConnectionStatus>("reconnecting");
  useEffect(() => {
    connectionRef.current = connection;
  }, [connection]);
  const [sessionStatus, setSessionStatus] = useState<TextConsultSessionStatus>(initialStatus);
  const [composer, setComposer] = useState("");
  /** text-C3 — interim dictation transcript (local-only; never sent until Send). */
  const [partialTranscript, setPartialTranscript] = useState("");
  const [dictationLocale, setDictationLocale] = useState(() => {
    if (typeof navigator === "undefined") return "en-IN";
    const lang = navigator.language;
    return SPEECH_RECOGNITION_LOCALES.some((l) => l.value === lang) ? lang : "en-IN";
  });
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const stopDictationRef = useRef<() => void>(() => {});
  const [replyTo, setReplyTo] = useState<ReplyToTarget | null>(null);
  const [composerAttachments, setComposerAttachments] = useState<ComposerAttachment[]>([]);
  /** text-D1 — crash-recovery draft banner (sessionStorage hydrate). */
  const [showRestoreBanner, setShowRestoreBanner] = useState(false);
  const draftSaveEnabledRef = useRef(false);
  const draftHydratedRef = useRef(false);
  const { hydratedDraft, saveDraft, clearDraft } = useComposerDraft(
    sessionId,
    mode === "readonly",
  );
  /** text-D2 — patient-only multi-tab kick (newest tab wins). */
  const { evicted, takeOver } = useTabPresenceClaim(
    sessionId,
    currentUserRole,
    accessToken,
    mode === "live",
  );
  const evictedRef = useRef(evicted);
  useEffect(() => {
    evictedRef.current = evicted;
  }, [evicted]);
  /** text-C1 — OS camera capture awaiting preview / caption before B8 queue. */
  const [cameraPreview, setCameraPreview] = useState<{
    file: File;
    previewUrl: string;
  } | null>(null);
  /** text-B9 — desktop drag-and-drop overlay (standalone + canvas only). */
  const [dragOverActive, setDragOverActive] = useState(false);
  const dragDepthRef = useRef(0);
  const [hintDismissed, setHintDismissed] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(CHAT_HINT_DISMISSED_KEY) === "1";
  });
  const [sending, setSending] = useState(false);
  const [counterpartyOnline, setCounterpartyOnline] = useState(false);
  const prevCounterpartyOnlineRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (mode === "readonly") return;
    const prev = prevCounterpartyOnlineRef.current;
    if (prev != null && prev !== counterpartyOnline) {
      chatQualityRef.current.onPresenceFlap();
    }
    prevCounterpartyOnlineRef.current = counterpartyOnline;
  }, [counterpartyOnline, mode]);
  const [counterpartyTyping, setCounterpartyTyping] = useState(false);
  /** text-A1 — unread count while scrolled away from bottom. */
  const [unreadSinceScrollUp, setUnreadSinceScrollUp] = useState(0);

  /**
   * Plan 06 attachments — signed-URL cache, keyed by message id.
   * Populated lazily on render via the backend-mediated
   * `signAttachmentUrls(sessionId, paths, accessToken)` route (which
   * uses service-role to side-step the storage-api auth quirk with
   * synthetic patient JWTs). TTL is set server-side (1h) and we
   * naturally re-mint on the next message mutation if the URL ages
   * out — the cache is refreshed by `signedUrlMintingRef` allowing
   * per-row retry on the next render.
   */
  const [signedAttachmentUrls, setSignedAttachmentUrls] = useState<Record<string, string>>({});

  /**
   * Plan 06 attachments — lightweight banner for client-side validation
   * failures (mime not in allowlist, file too large, upload network
   * error). Set to a string to display, null to hide. Auto-clears after
   * a few seconds via a timer ref.
   */
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  // Plan 06 · Task 38 — ref so Realtime INSERT callback picks up the
  // latest host-supplied handler without needing to re-subscribe.
  const onIncomingMessageRef = useRef(onIncomingMessage);
  useEffect(() => {
    onIncomingMessageRef.current = onIncomingMessage;
  }, [onIncomingMessage]);

  const maybeBroadcastViewedBottomRef = useRef<(atOverride?: string) => void>(() => {});
  const broadcastViewedBottomClearRef = useRef<() => void>(() => {});
  const applyViewedBottomFromPeerRef = useRef<
    (userId: string | undefined, at: string | null | undefined) => void
  >(() => {});

  // Refs that survive token-refresh / reconnect cycles.
  const accessTokenRef = useRef(accessToken);
  const clientRef = useRef<SupabaseClient | null>(null);
  const insertChannelRef = useRef<RealtimeChannel | null>(null);
  const reactionsChannelRef = useRef<RealtimeChannel | null>(null);
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const reactionsByMessageIdRef = useRef<Record<string, ConsultationMessageReaction[]>>({});
  const loadedReactionMessageIdsRef = useRef<Set<string>>(new Set());
  const messagesRef = useRef<ChatMessage[]>([]);
  const lastSeenAtRef = useRef<string | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counterpartyTypingCapRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingBroadcastRef = useRef<number>(0);
  const lastViewedBottomBroadcastRef = useRef<number>(0);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  // text-C6 — separate state for the mounted textarea element so the
  // `useComposerHotkeys` effect can resubscribe once it appears. Refs
  // don't trigger re-renders, so the hook would otherwise see `null`
  // for the initial mount and never re-bind.
  const [composerEl, setComposerEl] = useState<HTMLTextAreaElement | null>(null);
  const setComposerRef = useCallback((el: HTMLTextAreaElement | null) => {
    composerRef.current = el;
    setComposerEl(el);
  }, []);
  /**
   * Plan 06 attachments — gallery + document picker. `multiple` enabled,
   * no `capture` attribute so the OS picker offers Camera AND Library on
   * mobile, and full file browsing on desktop.
   */
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  /**
   * text-C1 — camera-direct capture. `capture="environment"` hints rear
   * camera for clinical photos; opens preview overlay before queueing.
   */
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  /** text-C1 — gallery fallback from the camera preview overlay (no capture). */
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  /** Auto-clears the attachment-error banner so it doesn't pin the UI. */
  const attachmentErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Tracks signed-URL fetches in-flight per message id so the lazy-mint
   * effect doesn't fire duplicate requests for the same row across
   * re-renders (the `messages` dep churns frequently).
   */
  const signedUrlMintingRef = useRef<Set<string>>(new Set());
  const scrollToBottomRef = useRef<((behavior?: ScrollBehavior) => void) | null>(null);
  const scrollToMessageRef = useRef<
    ((id: string, opts?: { highlight?: boolean }) => void) | null
  >(null);
  const wasAtBottomRef = useRef(true);
  const queuedSendsRef = useRef<ChatMessage[]>([]);
  const offlineSinceRef = useRef<number | null>(null);
  const offlineBadgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks when the tab last went hidden (mobile minimize / desktop tab
  // switch). Read by the visibilitychange handler to decide whether to
  // force a reconnect on resume vs. preserve a healthy WS through a
  // brief app switch. See the handler comment for the threshold.
  const hiddenAtRef = useRef<number | null>(null);
  // Debounce timer for non-online connection state transitions. Avoids
  // flashing the "Reconnecting…" badge for sub-second blips.
  const connectionDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // ------------------------------------------------------------------------
  // CP-D5: "Mark no-show" 2-step confirm + busy state.
  // Symmetric with VideoRoom / VoiceConsultRoom. First click arms a confirm
  // step that auto-cancels after 4s; second click invokes `onMarkNoShow`.
  // Button is rendered only when the prop is supplied (cockpit + doctor role).
  // ------------------------------------------------------------------------
  const [noShowStep, setNoShowStep] = useState<"idle" | "confirm">("idle");
  const [noShowBusy, setNoShowBusy] = useState(false);
  const noShowConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const handleMarkNoShowClick = useCallback(() => {
    if (!onMarkNoShow) return;
    if (noShowStep === "idle") {
      setNoShowStep("confirm");
      if (noShowConfirmTimerRef.current) {
        clearTimeout(noShowConfirmTimerRef.current);
      }
      noShowConfirmTimerRef.current = setTimeout(
        () => setNoShowStep("idle"),
        4_000,
      );
      return;
    }
    if (noShowConfirmTimerRef.current) {
      clearTimeout(noShowConfirmTimerRef.current);
      noShowConfirmTimerRef.current = null;
    }
    setNoShowBusy(true);
    void Promise.resolve(onMarkNoShow()).finally(() => {
      setNoShowBusy(false);
      setNoShowStep("idle");
    });
  }, [onMarkNoShow, noShowStep]);
  useEffect(() => {
    return () => {
      if (noShowConfirmTimerRef.current) {
        clearTimeout(noShowConfirmTimerRef.current);
      }
    };
  }, []);

  // Keep refs in sync with state — used in stable callbacks below.
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    reactionsByMessageIdRef.current = reactionsByMessageId;
  }, [reactionsByMessageId]);

  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  // ------------------------------------------------------------------------
  // text-D1 — composer draft crash recovery (sessionStorage, per-tab).
  // ------------------------------------------------------------------------

  useEffect(() => {
    if (mode === "readonly" || draftHydratedRef.current) return;
    draftHydratedRef.current = true;
    if (hydratedDraft) {
      setComposer(hydratedDraft.body);
      if (hydratedDraft.replyTo) {
        setReplyTo({
          id: hydratedDraft.replyTo.id,
          body: hydratedDraft.replyTo.body,
          senderName: hydratedDraft.replyTo.sender_name,
          senderRole:
            hydratedDraft.replyTo.sender_role === "doctor" ? "doctor" : "patient",
        });
      }
      setShowRestoreBanner(true);
    }
    draftSaveEnabledRef.current = true;
  }, [hydratedDraft, mode]);

  useEffect(() => {
    if (mode === "readonly" || !draftSaveEnabledRef.current) return;
    saveDraft({
      body: composer,
      replyTo: replyTo
        ? {
            id: replyTo.id,
            sender_name: replyTo.senderName,
            body: replyTo.body,
            sender_role: replyTo.senderRole,
          }
        : null,
      attachmentMeta: composerAttachments.map((a) => ({
        localId: a.localId,
        name: a.file.name,
        mime: a.mime,
        sizeBytes: a.sizeBytes,
      })),
      savedAt: new Date().toISOString(),
    });
  }, [composer, composerAttachments, mode, replyTo, saveDraft]);

  useEffect(() => {
    if (!showRestoreBanner || !hydratedDraft) return;
    const allReattached =
      hydratedDraft.attachmentMeta.length === 0 ||
      hydratedDraft.attachmentMeta.every((meta) =>
        composerAttachments.some(
          (a) =>
            a.file.name === meta.name &&
            a.mime === meta.mime &&
            a.sizeBytes === meta.sizeBytes,
        ),
      );
    const bodyModified = composer.trim() !== hydratedDraft.body.trim();
    if (allReattached && bodyModified) {
      setShowRestoreBanner(false);
    }
  }, [composer, composerAttachments, hydratedDraft, showRestoreBanner]);

  const handleDiscardDraft = useCallback(() => {
    clearDraft();
    setShowRestoreBanner(false);
    setComposer("");
    setReplyTo(null);
  }, [clearDraft]);

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
    if (reactionsChannelRef.current && clientRef.current) {
      clientRef.current.removeChannel(reactionsChannelRef.current);
    }
    if (presenceChannelRef.current && clientRef.current) {
      clientRef.current.removeChannel(presenceChannelRef.current);
    }
    insertChannelRef.current = null;
    reactionsChannelRef.current = null;
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
        .select(CONSULTATION_MESSAGE_SELECT)
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
          if (
            existing.pending &&
            existing.senderId === currentUserId &&
            !msg.pending
          ) {
            chatQualityRef.current.onMessageAck(msg.id);
          }
          // Promote optimistic row to server-acked: clear pending, refresh ts.
          byId.set(msg.id, {
            ...existing,
            ...msg,
            pending: false,
            failed: false,
            retryBody: undefined,
            seen: existing.seen ?? false,
          });
        } else {
          byId.set(msg.id, { ...msg, seen: msg.seen ?? false });
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
  }, [currentUserId]);

  const visibleMessageIdSet = useCallback((): Set<string> => {
    return new Set(
      messagesRef.current.filter((m) => m.kind !== "system").map((m) => m.id),
    );
  }, []);

  const mergeReactionsForMessages = useCallback(
    (rows: ConsultationMessageReaction[], messageIds: string[]) => {
      if (rows.length === 0) return;
      setReactionsByMessageId((prev) => {
        const next = { ...prev };
        for (const id of messageIds) {
          next[id] = rows.filter((r) => r.message_id === id);
        }
        return next;
      });
      for (const id of messageIds) loadedReactionMessageIdsRef.current.add(id);
    },
    [],
  );

  const fetchReactionsForMessageIds = useCallback(
    async (client: SupabaseClient, messageIds: string[]): Promise<void> => {
      const pending = messageIds.filter(
        (id) => !loadedReactionMessageIdsRef.current.has(id),
      );
      if (pending.length === 0) return;
      const { data, error } = await client
        .from("consultation_message_reactions")
        .select("id, message_id, user_id, emoji, created_at")
        .in("message_id", pending);
      if (error) return;
      const parsed = ((data ?? []) as ConsultationMessageReactionRow[])
        .map(rowToReaction)
        .filter((r): r is ConsultationMessageReaction => r !== null);
      mergeReactionsForMessages(parsed, pending);
    },
    [mergeReactionsForMessages],
  );

  const mergeReactionEvent = useCallback(
    (payload: {
      eventType: string;
      new: ConsultationMessageReactionRow;
      old: ConsultationMessageReactionRow;
    }) => {
      const visible = visibleMessageIdSet();
      if (payload.eventType === "INSERT") {
        const row = rowToReaction(payload.new);
        if (!row || !visible.has(row.message_id)) return;
        setReactionsByMessageId((prev) => {
          const existing = prev[row.message_id] ?? [];
          if (existing.some((r) => r.id === row.id)) return prev;
          return { ...prev, [row.message_id]: [...existing, row] };
        });
        return;
      }
      if (payload.eventType === "DELETE") {
        const row = rowToReaction(payload.old);
        if (!row || !visible.has(row.message_id)) return;
        setReactionsByMessageId((prev) => ({
          ...prev,
          [row.message_id]: (prev[row.message_id] ?? []).filter((r) => r.id !== row.id),
        }));
      }
    },
    [visibleMessageIdSet],
  );

  // ------------------------------------------------------------------------
  // text-A7 — viewed-bottom broadcast (seen ✓✓ derivation)
  // ------------------------------------------------------------------------

  const broadcastViewedBottom = useCallback(
    (at: string | null) => {
      if (mode === "readonly") return;
      const ch = presenceChannelRef.current;
      if (!ch) return;
      const now = Date.now();
      if (at !== null && now - lastViewedBottomBroadcastRef.current < VIEWED_BOTTOM_THROTTLE_MS) {
        return;
      }
      if (at !== null) lastViewedBottomBroadcastRef.current = now;
      void ch.send({
        type: "broadcast",
        event: "viewed-bottom",
        payload: { user_id: currentUserId, at },
      });
    },
    [currentUserId, mode],
  );

  const maybeBroadcastViewedBottom = useCallback(
    (atOverride?: string) => {
      if (mode === "readonly") return;
      if (connectionRef.current !== "online") return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (!wasAtBottomRef.current) return;
      const msgs = messagesRef.current;
      const at =
        atOverride ?? (msgs.length > 0 ? msgs[msgs.length - 1].createdAt : null);
      if (!at) return;
      broadcastViewedBottom(at);
    },
    [broadcastViewedBottom, mode],
  );

  const broadcastViewedBottomClear = useCallback(() => {
    broadcastViewedBottom(null);
  }, [broadcastViewedBottom]);

  const applyViewedBottomFromPeer = useCallback(
    (userId: string | undefined, at: string | null | undefined) => {
      if (!userId || userId === currentUserId) return;
      if (at == null) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.senderId === currentUserId && m.createdAt <= at && !m.seen
            ? { ...m, seen: true }
            : m,
        ),
      );
    },
    [currentUserId],
  );

  useEffect(() => {
    maybeBroadcastViewedBottomRef.current = maybeBroadcastViewedBottom;
  }, [maybeBroadcastViewedBottom]);
  useEffect(() => {
    broadcastViewedBottomClearRef.current = broadcastViewedBottomClear;
  }, [broadcastViewedBottomClear]);
  useEffect(() => {
    applyViewedBottomFromPeerRef.current = applyViewedBottomFromPeer;
  }, [applyViewedBottomFromPeer]);

  /**
   * Connection-state setter that defers non-online transitions by
   * 1200ms. Prevents the "Reconnecting…" badge from flashing for
   * sub-second SDK reconnect blips (the common case on mobile when
   * the OS briefly pauses then resumes the WebSocket). Online flips
   * fire immediately and cancel any pending non-online flip.
   *
   * Important: the underlying React state still drives composer-
   * disabled / queued-send logic. We only debounce the *visible*
   * transition; queued sends still flush correctly because they're
   * keyed off the SUBSCRIBED callback, not the connection state.
   */
  const setConnectionGuarded = useCallback((next: ConnectionStatus) => {
    if (connectionDebounceTimerRef.current) {
      clearTimeout(connectionDebounceTimerRef.current);
      connectionDebounceTimerRef.current = null;
    }
    if (next === "online") {
      setConnection("online");
      return;
    }
    // No-op if we're already showing the target non-online state.
    if (connectionRef.current === next) return;
    connectionDebounceTimerRef.current = setTimeout(() => {
      connectionDebounceTimerRef.current = null;
      if (mountedRef.current) setConnection(next);
    }, 1200);
  }, []);

  const applyCounterpartyTyping = useCallback((typing: boolean) => {
    if (counterpartyTypingCapRef.current) {
      clearTimeout(counterpartyTypingCapRef.current);
      counterpartyTypingCapRef.current = null;
    }
    setCounterpartyTyping(typing);
    if (typing) {
      counterpartyTypingCapRef.current = setTimeout(() => {
        counterpartyTypingCapRef.current = null;
        setCounterpartyTyping(false);
      }, TYPING_VISIBILITY_CAP_MS);
    }
  }, []);

  /**
   * One full connect cycle: build client, do catch-up SELECT, attach
   * INSERT + presence channels, flush queued sends. Returns true on
   * success, false on permanent error (caller schedules backoff).
   */
  const connect = useCallback(async (): Promise<boolean> => {
    if (!mountedRef.current) return false;
    teardown();
    setConnectionGuarded("reconnecting");

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
      const reactionMessageIds = messagesRef.current
        .filter((m) => m.kind !== "system")
        .map((m) => m.id);
      await fetchReactionsForMessageIds(client, reactionMessageIds);
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
          const reactionMessageIds = messagesRef.current
            .filter((m) => m.kind !== "system")
            .map((m) => m.id);
          await fetchReactionsForMessageIds(client, reactionMessageIds);
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
      setConnectionGuarded("online");
      reconnectAttemptRef.current = 0;
      offlineSinceRef.current = null;
      return true;
    }

    // INSERT subscription — RLS scopes to session_id via the JWT, but
    // we also pass the filter to keep the wire payload minimal.
    //
    // Per-mount nonce in the topic — see useVideoEscalationState.ts for
    // the rationale. tl;dr: `@supabase/ssr`'s singleton browser client
    // means `client.channels` survives across mount → cleanup → re-mount
    // (React Strict Mode in dev), and the second mount would otherwise
    // re-use the previously-subscribed channel object — `.on()` after
    // `.subscribe()` throws. The nonce is safe here because the
    // `filter` below scopes rows server-side; the topic is only a
    // client-side multiplexing key.
    const insertNonce =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const insertChannel = client
      .channel(`messages:${sessionId}:${insertNonce}`)
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
          if (msg.kind !== "system" && clientRef.current) {
            void fetchReactionsForMessageIds(clientRef.current, [msg.id]);
          }
          // text-A1 — bump unread when scrolled up and the row isn't our own echo.
          if (!wasAtBottomRef.current && msg.senderId !== currentUserId) {
            setUnreadSinceScrollUp((c) => c + 1);
          }
          if (msg.senderId !== currentUserId && msg.kind !== "system") {
            setInboundMessageReceived(true);
            latestInboundMessageRef.current = msg;
            setLatestInboundMessageId(msg.id);
          }
          // task-text-D6b — first inbound counterparty message triggers push opt-in.
          if (
            pushOptInEnabledRef.current &&
            msg.senderId !== currentUserId &&
            msg.kind !== "system" &&
            !sawCounterpartyMessageRef.current
          ) {
            sawCounterpartyMessageRef.current = true;
            setPushOptInEligible(true);
          }
          // text-A7 — advance peer seen cursor when we're at bottom viewing.
          maybeBroadcastViewedBottomRef.current(msg.createdAt);
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
              metadata: msg.metadata ?? null,
            });
          } catch {
            // best-effort — host responsibility
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "consultation_messages",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as ConsultationMessageRow;
          const visible = messagesRef.current.some((m) => m.id === row.id);
          if (!visible) return;
          mergeMessages([rowToMessage(row)]);
        },
      )
      .subscribe((status) => {
        if (!mountedRef.current) return;
        if (status === "SUBSCRIBED") {
          setConnectionGuarded("online");
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
          chatQualityRef.current.onRealtimeReconnect();
          scheduleReconnect();
        }
      });
    insertChannelRef.current = insertChannel;

    const reactionsNonce =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const reactionsChannel = client
      .channel(`reactions:${sessionId}:${reactionsNonce}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "consultation_message_reactions",
        },
        (payload) => {
          mergeReactionEvent({
            eventType: payload.eventType,
            new: payload.new as ConsultationMessageReactionRow,
            old: payload.old as ConsultationMessageReactionRow,
          });
        },
      )
      .subscribe();
    reactionsChannelRef.current = reactionsChannel;

    // Presence channel — broadcast our identity, listen for the
    // counterparty's joins/leaves + typing broadcasts.
    //
    // CANNOT use the per-mount nonce trick here: the WHOLE POINT of
    // presence is that the patient's browser and the doctor's browser
    // both join the SAME topic so they can see each other. A nonce
    // would put each browser on a different topic and presence would
    // silently break in production.
    //
    // Instead, before creating, we evict any leftover channel for this
    // exact topic that's still sitting in `client.channels` from a
    // previous mount whose async cleanup hasn't completed. This makes
    // `client.channel(...)` below return a fresh, never-subscribed
    // channel object — so `.on()` won't throw on the second React
    // Strict Mode pass.
    const presenceTopic = `${PRESENCE_CHANNEL_PREFIX}:${sessionId}`;
    for (const c of client.getChannels()) {
      // supabase-realtime-js prefixes the topic with `realtime:` once
      // the channel has been subscribed; check both forms defensively.
      if (c.topic === presenceTopic || c.topic === `realtime:${presenceTopic}`) {
        try {
          void client.removeChannel(c);
        } catch {
          // best-effort — if the channel is mid-leave, ignore
        }
      }
    }
    const presenceChannel = client.channel(presenceTopic, {
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
        applyCounterpartyTyping(Boolean(p.typing));
      })
      .on("broadcast", { event: "viewed-bottom" }, ({ payload }) => {
        const p = payload as { user_id?: string; at?: string | null };
        applyViewedBottomFromPeerRef.current(p?.user_id, p?.at);
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
        maybeBroadcastViewedBottomRef.current();
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
    fetchReactionsForMessageIds,
    mergeMessages,
    mergeReactionEvent,
    mode,
    refreshToken,
    sessionId,
    setConnectionGuarded,
    teardown,
  ]);

  /**
   * Reconnect with exponential backoff. Capped at the last entry of
   * RECONNECT_BACKOFF_MS so we don't sleep forever.
   */
  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return;
    setConnectionGuarded("reconnecting");
    if (offlineSinceRef.current === null) {
      offlineSinceRef.current = Date.now();
      // Flip to "offline" if we stay down past 30s — surface the red badge.
      if (offlineBadgeTimerRef.current) clearTimeout(offlineBadgeTimerRef.current);
      offlineBadgeTimerRef.current = setTimeout(() => {
        if (mountedRef.current && offlineSinceRef.current !== null) {
          setConnectionGuarded("offline");
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
  }, [connect, setConnectionGuarded]);

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
        const insertRow: Record<string, unknown> = {
          id: msg.id,
          session_id: sessionId,
          sender_id: currentUserId,
          sender_role: currentUserRole,
          body,
        };
        if (msg.reply_to_id) {
          insertRow.reply_to_id = msg.reply_to_id;
        }
        const { error } = await client.from("consultation_messages").insert(insertRow);
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
          // text-D5 — RLS rejections surface as 42501; we cannot
          // distinguish "rate-limited" from "session ended" purely
          // from the error code. Treat the reject as rate-limit iff
          // the local in-window count has hit the cap. The local
          // mirror is a UX hint, not a security boundary.
          const localRateLimited = rateLimitRef.current.isRateLimited;
          const failureReason: "rate-limited" | "unknown" = localRateLimited
            ? "rate-limited"
            : "unknown";
          if (localRateLimited) {
            setActionToast(
              "You're sending too fast — wait a few seconds.",
            );
            if (actionToastTimerRef.current) {
              clearTimeout(actionToastTimerRef.current);
            }
            actionToastTimerRef.current = setTimeout(() => {
              if (mountedRef.current) setActionToast(null);
            }, 5_000);
          }
          // Non-401 error: mark failed; user can retry from the bubble.
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msg.id
                ? {
                    ...m,
                    pending: false,
                    failed: true,
                    failureReason,
                    retryBody: body,
                  }
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
              ? {
                  ...m,
                  pending: false,
                  failed: false,
                  failureReason: undefined,
                  retryBody: undefined,
                }
              : m,
          ),
        );
        chatQualityRef.current.onMessageAck(msg.id);
        // text-D5 — record the ack in the local rate-limit window so
        // the button derivation can pre-emptively flip to 'rate-limited'
        // once we cross the cap, without waiting for an RLS reject.
        rateLimitRef.current.recordOwnSend();
        clearDraft();
        setShowRestoreBanner(false);
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id
              ? {
                  ...m,
                  pending: false,
                  failed: true,
                  failureReason: "unknown",
                  retryBody: body,
                }
              : m,
          ),
        );
      }
    },
    [clearDraft, currentUserId, currentUserRole, refreshToken, scheduleReconnect, sessionId],
  );

  const handleSend = useCallback((opts?: { forceQueue?: boolean }) => {
    // text-C6 — `forceQueue` is accepted to satisfy the Cmd/Ctrl+Enter
    // contract (explicit "send now even though I know we're
    // reconnecting"). Today's send path always creates an optimistic
    // pending bubble regardless of connection — the "queued" UX lives
    // purely in the send-button state — so the flag does not need to
    // branch behaviour. Preserved on the API for forward compatibility
    // if a future bubble-level "queued" overlay needs to know that the
    // user opted in to immediate display.
    void opts?.forceQueue;
    stopDictationRef.current();
    setPartialTranscript("");
    if (sending) return;
    if (composer.length > COMPOSER_HARD_CAP) return;
    const body = composer.trim();
    if (composerAttachments.length > 0) {
      if (sessionStatus !== "live") return;
      void sendComposerAttachments();
      return;
    }
    if (!body) return;
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
      reply_to_id: replyTo?.id ?? null,
    };
    setMessages((prev) => [...prev, optimistic]);
    chatQualityRef.current.onOptimisticSend(id);
    setComposer("");
    setReplyTo(null);
    setSending(true);
    // Stop typing on send.
    broadcastTyping(false);
    void doSendInsert(optimistic).finally(() => {
      setSending(false);
    });
    requestAnimationFrame(() => {
      scrollToBottomRef.current?.("auto");
    });
    // broadcastTyping is declared after handleSend in source order but
    // is hoisted via useCallback ref — including it in deps would create
    // a forward reference that ESLint can't statically resolve. The
    // closure picks up the latest broadcastTyping at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    composer,
    composerAttachments.length,
    currentUserId,
    currentUserRole,
    doSendInsert,
    replyTo,
    sending,
    sessionId,
    sessionStatus,
  ]);

  const messageSenderDisplayName = useCallback(
    (m: ChatMessage): string => {
      if (m.senderId === currentUserId) return "You";
      return counterpartyName?.trim() || (m.senderRole === "doctor" ? "Doctor" : "Patient");
    },
    [counterpartyName, currentUserId],
  );

  useEffect(() => {
    const msg = latestInboundMessageRef.current;
    if (!latestInboundMessageId || !msg || msg.senderId === currentUserId) return;
    fireLocalNotification({
      title: messageSenderDisplayName(msg),
      body: msg.body,
      sessionId,
      messageId: msg.id,
      sender: msg.senderId,
      mode,
    });
  }, [currentUserId, latestInboundMessageId, messageSenderDisplayName, mode, sessionId]);

  const lookupMessageById = useCallback(
    (id: string): ChatMessage | null => {
      const found = messagesRef.current.find((m) => m.id === id);
      if (!found || found.deleted_at) return null;
      return found;
    },
    [],
  );

  const scrollToMessage = useCallback((id: string, opts?: { highlight?: boolean }) => {
    scrollToMessageRef.current?.(id, opts);
  }, []);

  const handleStartReply = useCallback(
    (message: ChatMessage) => {
      if (message.kind === "system" || message.deleted_at) return;
      const previewBody =
        message.body?.trim() ||
        (message.kind === "attachment" ? "Attachment" : "");
      setReplyTo({
        id: message.id,
        senderRole:
          message.senderRole === "doctor" || message.senderRole === "patient"
            ? message.senderRole
            : "patient",
        body: previewBody,
        senderName: messageSenderDisplayName(message),
      });
      composerRef.current?.focus();
    },
    [messageSenderDisplayName],
  );

  const retryFailed = useCallback(
    (localId: string) => {
      const target = messagesRef.current.find((m) => m.id === localId);
      if (!target?.failed) return;
      // text-D5 — A6's retry must NOT auto-fire while we're still in
      // the rate-limit cooldown; otherwise the user could trip the
      // server-side cap repeatedly and stack failed bubbles. Toast +
      // bail; the button + bubble already render the countdown.
      if (
        target.failureReason === "rate-limited" &&
        rateLimitRef.current.isRateLimited
      ) {
        setActionToast(
          `Wait ${rateLimitRef.current.cooldownSecondsRemaining}s before retrying.`,
        );
        if (actionToastTimerRef.current) {
          clearTimeout(actionToastTimerRef.current);
        }
        actionToastTimerRef.current = setTimeout(() => {
          if (mountedRef.current) setActionToast(null);
        }, 5_000);
        return;
      }
      setMessages((prev) => markMessageRetrying(prev, localId));
      void doSendInsert({
        ...target,
        pending: true,
        failed: false,
        failureReason: undefined,
      });
    },
    [doSendInsert],
  );

  const discardFailed = useCallback((localId: string) => {
    setMessages((prev) => discardFailedMessage(prev, localId));
  }, []);

  // ------------------------------------------------------------------------
  // Plan 06 — Attachments (upload + insert + signed-URL minting)
  // ------------------------------------------------------------------------

  /**
   * Pop a transient banner for attachment-related errors (mime reject,
   * size cap, network failure). Auto-clears after 4s so the UI doesn't
   * stay pinned on a stale error.
   */
  const flashAttachmentError = useCallback((msg: string) => {
    setAttachmentError(msg);
    if (attachmentErrorTimerRef.current) clearTimeout(attachmentErrorTimerRef.current);
    attachmentErrorTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setAttachmentError(null);
    }, 4_000);
  }, []);

  const flashActionToast = useCallback((msg: string) => {
    setActionToast(msg);
    if (actionToastTimerRef.current) clearTimeout(actionToastTimerRef.current);
    actionToastTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setActionToast(null);
    }, 4_000);
  }, []);

  const speechRecognitionSupported = useMemo(() => isSpeechRecognitionSupported(), []);

  const {
    isListening: isDictating,
    start: startDictation,
    stop: stopDictation,
  } = useSpeechRecognition({
    locale: dictationLocale,
    onPartial: setPartialTranscript,
    onFinal: (text) => {
      setComposer((prev) => appendDictationFinal(prev, text));
      setPartialTranscript("");
    },
    onError: (err) => {
      setPartialTranscript("");
      if (err.error === "not-allowed" || err.error === "service-not-allowed") {
        setMicPermissionDenied(true);
        flashActionToast("Microphone permission denied. Enable in browser settings.");
      }
    },
    onSilenceTimeout: () => {
      setPartialTranscript("");
      flashActionToast("Stopped recording after 30s silence.");
    },
  });

  useEffect(() => {
    stopDictationRef.current = stopDictation;
  }, [stopDictation]);

  const handleDictationToggle = useCallback(() => {
    if (micPermissionDenied) {
      flashActionToast("Microphone permission denied. Enable in browser settings.");
      return;
    }
    if (isDictating) {
      stopDictation();
      setPartialTranscript("");
    } else {
      startDictation();
    }
  }, [
    flashActionToast,
    isDictating,
    micPermissionDenied,
    startDictation,
    stopDictation,
  ]);

  const clearDeleteConfirm = useCallback(() => {
    setDeleteConfirm(null);
    if (deleteConfirmTimerRef.current) {
      clearTimeout(deleteConfirmTimerRef.current);
      deleteConfirmTimerRef.current = null;
    }
  }, []);

  const armDeleteConfirm = useCallback(
    (messageId: string) => {
      setDeleteConfirm({ messageId });
      if (deleteConfirmTimerRef.current) clearTimeout(deleteConfirmTimerRef.current);
      deleteConfirmTimerRef.current = setTimeout(() => {
        if (mountedRef.current) setDeleteConfirm(null);
      }, 5_000);
    },
    [],
  );

  const userNameById = useCallback(
    (userId: string): string => {
      if (userId === currentUserId) return "You";
      return (
        counterpartyName?.trim() ||
        (currentUserRole === "doctor" ? "Patient" : "Your doctor")
      );
    },
    [counterpartyName, currentUserId, currentUserRole],
  );

  const handleOpenReactionPicker = useCallback(
    (
      messageId: string,
      anchor: HTMLElement,
      coords?: { x: number; y: number },
    ) => {
      if (mode === "readonly") return;
      setReactionPicker({ messageId, anchor, coords });
    },
    [mode],
  );

  const handleCloseReactionPicker = useCallback(() => {
    setReactionPicker(null);
  }, []);

  const openLightbox = useCallback(
    (messageId: string) => {
      const images = buildChatImageLightboxImages(messages, signedAttachmentUrls);
      const index = images.findIndex((img) => img.messageId === messageId);
      if (index < 0) return;
      setLightboxState({ images, index });
    },
    [messages, signedAttachmentUrls],
  );

  const closeLightbox = useCallback(() => {
    setLightboxState(null);
  }, []);

  const toggleReaction = useCallback(
    async (messageId: string, emoji: ReactionEmoji) => {
      if (mode === "readonly") return;
      const client = clientRef.current;
      if (!client) return;

      const snapshot = { ...reactionsByMessageIdRef.current };
      const rows = snapshot[messageId] ?? [];
      const existing = rows.find(
        (r) => r.user_id === currentUserId && r.emoji === emoji,
      );

      if (existing) {
        setReactionsByMessageId((prev) => ({
          ...prev,
          [messageId]: (prev[messageId] ?? []).filter((r) => r.id !== existing.id),
        }));
        const { error } = await client
          .from("consultation_message_reactions")
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", currentUserId)
          .eq("emoji", emoji);
        if (error) {
          setReactionsByMessageId(snapshot);
          flashAttachmentError("Couldn't remove your reaction. Try again.");
        }
        return;
      }

      const optimisticId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `optimistic-${Date.now()}`;
      const optimistic: ConsultationMessageReaction = {
        id: optimisticId,
        message_id: messageId,
        user_id: currentUserId,
        emoji,
        created_at: new Date().toISOString(),
      };
      setReactionsByMessageId((prev) => ({
        ...prev,
        [messageId]: [...(prev[messageId] ?? []), optimistic],
      }));

      const { data, error } = await client
        .from("consultation_message_reactions")
        .insert({ message_id: messageId, user_id: currentUserId, emoji })
        .select("id, message_id, user_id, emoji, created_at")
        .single();

      if (error) {
        const code = (error as { code?: string }).code;
        if (code === "23505") {
          setReactionsByMessageId((prev) => ({
            ...prev,
            [messageId]: (prev[messageId] ?? []).filter((r) => r.id !== optimisticId),
          }));
          return;
        }
        setReactionsByMessageId(snapshot);
        flashAttachmentError("Couldn't save your reaction. Try again.");
        return;
      }

      const serverRow = data ? rowToReaction(data as ConsultationMessageReactionRow) : null;
      if (serverRow) {
        setReactionsByMessageId((prev) => {
          const withoutOptimistic = (prev[messageId] ?? []).filter(
            (r) => r.id !== optimisticId && r.id !== serverRow.id,
          );
          return { ...prev, [messageId]: [...withoutOptimistic, serverRow] };
        });
      }
    },
    [currentUserId, flashAttachmentError, mode],
  );

  const handleReactionPick = useCallback(
    (emoji: ReactionEmoji) => {
      if (!reactionPicker) return;
      void toggleReaction(reactionPicker.messageId, emoji);
    },
    [reactionPicker, toggleReaction],
  );

  const handleStartEdit = useCallback((message: ChatMessage) => {
    if (message.kind === "attachment" || message.deleted_at) return;
    setEditingMessageId(message.id);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
  }, []);

  const handleSaveEdit = useCallback(
    async (messageId: string, body: string) => {
      const client = clientRef.current;
      if (!client || mode === "readonly") return;
      setEditSaving(true);
      const { data, error } = await client
        .from("consultation_messages")
        .update({ body, edited_at: new Date().toISOString() })
        .eq("id", messageId)
        .select(CONSULTATION_MESSAGE_SELECT)
        .maybeSingle();
      setEditSaving(false);
      if (error || !data) {
        setEditingMessageId(null);
        flashActionToast("Edit window closed.");
        return;
      }
      mergeMessages([rowToMessage(data as ConsultationMessageRow)]);
      setEditingMessageId(null);
    },
    [flashActionToast, mergeMessages, mode],
  );

  const handleSoftDeleteRequest = useCallback(
    (message: ChatMessage) => {
      if (message.deleted_at) return;
      armDeleteConfirm(message.id);
    },
    [armDeleteConfirm],
  );

  const handleSoftDeleteConfirm = useCallback(async () => {
    if (!deleteConfirm) return;
    const messageId = deleteConfirm.messageId;
    clearDeleteConfirm();
    const client = clientRef.current;
    if (!client || mode === "readonly") return;
    const { data, error } = await client
      .from("consultation_messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", messageId)
      .select(CONSULTATION_MESSAGE_SELECT)
      .maybeSingle();
    if (error || !data) {
      flashActionToast("Delete window closed.");
      return;
    }
    mergeMessages([rowToMessage(data as ConsultationMessageRow)]);
  }, [clearDeleteConfirm, deleteConfirm, flashActionToast, mergeMessages, mode]);

  const handleTogglePin = useCallback(
    async (messageId: string) => {
      if (mode === "readonly" || currentUserRole !== "doctor") return;
      const client = clientRef.current;
      if (!client) return;

      const target = messagesRef.current.find((m) => m.id === messageId);
      if (
        !target ||
        target.deleted_at ||
        target.kind === "system" ||
        (target.kind !== "text" && target.kind !== "attachment")
      ) {
        return;
      }

      const isPinned = !!target.pinned_at;
      if (!isPinned) {
        const pinnedCount = messagesRef.current.filter(
          (m) => m.pinned_at && !m.deleted_at,
        ).length;
        if (pinnedCount >= MAX_PINNED_MESSAGES) {
          flashActionToast("Maximum 3 pinned messages. Unpin one first.");
          return;
        }
      }

      const payload = isPinned
        ? { pinned_at: null, pinned_by: null }
        : { pinned_at: new Date().toISOString(), pinned_by: currentUserId };

      const { data, error } = await client
        .from("consultation_messages")
        .update(payload)
        .eq("id", messageId)
        .select(CONSULTATION_MESSAGE_SELECT);

      if (error) {
        if (!isPinned) {
          flashActionToast("Maximum 3 pinned messages. Unpin one first.");
        }
        return;
      }

      const rows = (data ?? []) as ConsultationMessageRow[];
      if (rows.length === 0) {
        if (!isPinned) {
          flashActionToast("Maximum 3 pinned messages. Unpin one first.");
        }
        return;
      }

      mergeMessages([rowToMessage(rows[0])]);
    },
    [currentUserId, currentUserRole, flashActionToast, mergeMessages, mode],
  );

  const revokeComposerPreview = useCallback((previewUrl: string) => {
    try {
      URL.revokeObjectURL(previewUrl);
    } catch {
      // best-effort
    }
  }, []);

  const removeComposerAttachment = useCallback(
    (localId: string) => {
      setComposerAttachments((prev) => {
        const target = prev.find((a) => a.localId === localId);
        if (target) revokeComposerPreview(target.previewUrl);
        return prev.filter((a) => a.localId !== localId);
      });
    },
    [revokeComposerPreview],
  );

  const composerAttachmentsRef = useRef(composerAttachments);
  useEffect(() => {
    composerAttachmentsRef.current = composerAttachments;
  }, [composerAttachments]);

  useEffect(() => {
    return () => {
      for (const a of composerAttachmentsRef.current) revokeComposerPreview(a.previewUrl);
    };
  }, [revokeComposerPreview]);

  const cameraPreviewRef = useRef(cameraPreview);
  useEffect(() => {
    cameraPreviewRef.current = cameraPreview;
  }, [cameraPreview]);

  useEffect(() => {
    return () => {
      const preview = cameraPreviewRef.current;
      if (preview) revokeComposerPreview(preview.previewUrl);
    };
  }, [revokeComposerPreview]);

  const closeCameraPreview = useCallback(() => {
    setCameraPreview((prev) => {
      if (prev) revokeComposerPreview(prev.previewUrl);
      return null;
    });
  }, [revokeComposerPreview]);

  const openCameraPreview = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        flashAttachmentError(`${file.name || "File"}: only images can be captured here.`);
        return;
      }
      if (!ATTACHMENT_MIME_ALLOWLIST.has(file.type)) {
        flashAttachmentError(
          `${file.name || "File"}: only images, PDFs, and text files are accepted.`,
        );
        return;
      }
      if (file.size > ATTACHMENT_MAX_BYTES) {
        flashAttachmentError(
          `${file.name || "File"}: max 10 MB (got ${formatBytesShort(file.size)}).`,
        );
        return;
      }
      setCameraPreview((prev) => {
        if (prev) revokeComposerPreview(prev.previewUrl);
        return {
          file,
          previewUrl: URL.createObjectURL(file),
        };
      });
    },
    [flashAttachmentError, revokeComposerPreview],
  );

  const handleCameraCapture = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (!file) return;
      openCameraPreview(file);
    },
    [openCameraPreview],
  );

  const handleGalleryCaptureForCamera = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (galleryInputRef.current) galleryInputRef.current.value = "";
      if (!file) return;
      openCameraPreview(file);
    },
    [openCameraPreview],
  );

  const handleCameraPreviewSend = useCallback(
    (caption: string) => {
      if (!cameraPreview) return;
      const { file } = cameraPreview;
      const previewUrl = cameraPreview.previewUrl;
      if (composerAttachments.length >= MAX_COMPOSER_ATTACHMENTS) {
        flashAttachmentError("Maximum 5 attachments per send.");
        return;
      }
      if (!ATTACHMENT_MIME_ALLOWLIST.has(file.type)) {
        flashAttachmentError(
          `${file.name || "File"}: only images, PDFs, and text files are accepted.`,
        );
        return;
      }
      if (file.size > ATTACHMENT_MAX_BYTES) {
        flashAttachmentError(
          `${file.name || "File"}: max 10 MB (got ${formatBytesShort(file.size)}).`,
        );
        return;
      }
      const localId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `local-att-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setComposerAttachments((prev) => [
        ...prev,
        {
          localId,
          file,
          previewUrl,
          mime: file.type,
          sizeBytes: file.size,
        },
      ]);
      setComposer(caption);
      setCameraPreview(null);
    },
    [cameraPreview, composerAttachments.length, flashAttachmentError],
  );

  const handleCameraPreviewRetake = useCallback(() => {
    closeCameraPreview();
    cameraInputRef.current?.click();
  }, [closeCameraPreview]);

  const handleCameraPreviewSwitchToGallery = useCallback(() => {
    galleryInputRef.current?.click();
  }, []);

  /**
   * Upload one file to `consultation-attachments/{sessionId}/{uuid}.{ext}`,
   * then INSERT the matching `consultation_messages` row. Adds an
   * optimistic row to local state immediately so the user sees their
   * file appear without waiting for the round-trip; promotes / fails
   * the row based on the two-step result. Storage RLS (migration 079)
   * is the live-only + session-membership gate; the DB row-shape CHECK
   * + mime allowlist (migrations 063 + 082) are defense in depth.
   *
   * Each file uploads independently — we do NOT short-circuit a batch
   * on the first failure, so a 6-photo selection where #3 is a HEIC
   * the doctor's browser later fails to render still uploads #1, #2,
   * #4, #5, #6 cleanly. Per-file failure surfaces as a `failed` flag
   * on that row's bubble; the rest stream through.
   *
   * Note re: retry — `retryFailed` re-INSERTs the row but does NOT
   * re-upload. If the storage upload itself failed, the user has to
   * re-pick the file (the original `File` object is GC-eligible after
   * this function returns). For v1 this matches what most chat UIs do
   * on attachment failure; revisit in Plan 11 polish.
   */
  const uploadAndInsertAttachment = useCallback(
    async (file: File): Promise<void> => {
      const client = clientRef.current;
      if (!client) {
        flashAttachmentError("Not connected — please wait and try again.");
        return;
      }
      if (sessionStatus !== "live") {
        flashAttachmentError("Consult isn't live — attachments are blocked.");
        return;
      }
      if (!isUuid(currentUserId)) return;

      if (!ATTACHMENT_MIME_ALLOWLIST.has(file.type)) {
        flashAttachmentError(
          `${file.name || "File"}: only images, PDFs, and text files are accepted.`,
        );
        return;
      }
      if (file.size > ATTACHMENT_MAX_BYTES) {
        flashAttachmentError(
          `${file.name || "File"}: max 10 MB (got ${formatBytesShort(file.size)}).`,
        );
        return;
      }

      const messageId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const ext = extForAttachmentMime(file.type);
      const objectKey = `${sessionId}/${messageId}.${ext}`;
      const caption = file.name || "Attachment";

      // Optimistic row. `attachmentUrl` carries the storage path until
      // the signed-URL effect mints a renderable URL — image bubbles
      // show a placeholder until then; PDFs show the 📎 link greyed.
      const optimistic: ChatMessage = {
        id: messageId,
        sessionId,
        senderId: currentUserId,
        senderRole: currentUserRole,
        body: caption,
        createdAt: new Date().toISOString(),
        kind: "attachment",
        attachmentUrl: objectKey,
        attachmentMimeType: file.type,
        attachmentByteSize: file.size,
        pending: true,
      };
      setMessages((prev) => [...prev, optimistic]);
      requestAnimationFrame(() => {
        scrollToBottomRef.current?.("auto");
      });

      try {
        const { error: uploadError } = await client.storage
          .from(ATTACHMENT_BUCKET)
          .upload(objectKey, file, {
            contentType: file.type,
            upsert: false,
          });
        if (uploadError) throw uploadError;

        const { error: insertError } = await client
          .from("consultation_messages")
          .insert({
            id: messageId,
            session_id: sessionId,
            sender_id: currentUserId,
            sender_role: currentUserRole,
            kind: "attachment",
            body: caption,
            attachment_url: objectKey,
            attachment_mime_type: file.type,
            attachment_byte_size: file.size,
          });
        if (insertError) throw insertError;

        // Realtime echo will promote pending → acked. Fallback for
        // when Realtime is briefly down: clear pending immediately so
        // the bubble doesn't stay greyed.
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, pending: false, failed: false, retryBody: undefined }
              : m,
          ),
        );
      } catch (err) {
        // Best-effort cleanup of the orphan storage object so we don't
        // accumulate junk in the bucket. RLS allows the same caller
        // who uploaded to delete; we ignore errors (the object may
        // not have been created if upload failed pre-write).
        try {
          await client.storage.from(ATTACHMENT_BUCKET).remove([objectKey]);
        } catch {
          // best-effort
        }
        flashAttachmentError(
          err instanceof Error && err.message
            ? `Upload failed: ${err.message}`
            : "Upload failed. Please try again.",
        );
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, pending: false, failed: true } : m,
          ),
        );
      }
    },
    [currentUserId, currentUserRole, flashAttachmentError, sessionId, sessionStatus],
  );

  /**
   * text-B8 — queue picked files in the composer (up to 5) instead of
   * immediate per-file upload. User sends the batch via the Send button.
   */
  const handleFilePick = useCallback(
    (files: FileList | null, source: "files" | "camera" | "drop") => {
      if (!files || files.length === 0) return;
      const list = Array.from(files);
      if (source === "files" && fileInputRef.current) fileInputRef.current.value = "";
      if (source === "camera" && cameraInputRef.current) cameraInputRef.current.value = "";

      setComposerAttachments((prev) => {
        const room = MAX_COMPOSER_ATTACHMENTS - prev.length;
        if (room <= 0) {
          flashAttachmentError(
            source === "drop"
              ? `Maximum 5 attachments per send. ${list.length} file${list.length === 1 ? "" : "s"} dropped were ignored.`
              : "Maximum 5 attachments per send.",
          );
          return prev;
        }
        if (list.length > room) {
          const ignored = list.length - room;
          flashAttachmentError(
            source === "drop"
              ? `Maximum 5 attachments per send. ${ignored} file${ignored === 1 ? "" : "s"} dropped were ignored.`
              : "Maximum 5 attachments per send.",
          );
        }
        const slice = list.slice(0, room);
        const next = [...prev];
        for (const file of slice) {
          if (next.length >= MAX_COMPOSER_ATTACHMENTS) break;
          if (!ATTACHMENT_MIME_ALLOWLIST.has(file.type)) {
            flashAttachmentError(
              `${file.name || "File"}: only images, PDFs, and text files are accepted.`,
            );
            continue;
          }
          if (file.size > ATTACHMENT_MAX_BYTES) {
            flashAttachmentError(
              `${file.name || "File"}: max 10 MB (got ${formatBytesShort(file.size)}).`,
            );
            continue;
          }
          const localId =
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `local-att-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          next.push({
            localId,
            file,
            previewUrl: URL.createObjectURL(file),
            mime: file.type,
            sizeBytes: file.size,
          });
        }
        return next;
      });
    },
    [flashAttachmentError],
  );

  const shareTargetConsumedRef = useRef(false);
  useEffect(() => {
    if (
      shareTargetConsumedRef.current ||
      mode !== "live" ||
      !initialShareTargetFiles?.length
    ) {
      return;
    }
    shareTargetConsumedRef.current = true;
    const dt = new DataTransfer();
    for (const file of initialShareTargetFiles) {
      dt.items.add(file);
    }
    handleFilePick(dt.files, "files");
  }, [handleFilePick, initialShareTargetFiles, mode]);

  const dropZoneEnabled =
    mode === "live" && (layout === "standalone" || layout === "canvas");

  const handleDragOver = useCallback((e: DragEvent) => {
    preventDefaultIfFileDrag(e);
  }, []);

  const handleDragEnter = useCallback((e: DragEvent) => {
    if (!dragDataTransferHasFiles(e.dataTransfer)) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    if (dragDepthRef.current === 1) setDragOverActive(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragOverActive(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      dragDepthRef.current = 0;
      setDragOverActive(false);
      if (!e.dataTransfer.files?.length) return;
      handleFilePick(e.dataTransfer.files, "drop");
    },
    [handleFilePick],
  );

  /**
   * text-B8 — upload all queued attachments in parallel, INSERT one row
   * per file sharing `batch_id` when length > 1. Caption on first row only.
   */
  const sendComposerAttachments = useCallback(async () => {
    const client = clientRef.current;
    if (!client) {
      flashAttachmentError("Not connected — please wait and try again.");
      return;
    }
    if (sessionStatus !== "live") {
      flashAttachmentError("Consult isn't live — attachments are blocked.");
      return;
    }
    if (!isUuid(currentUserId)) return;
    if (composerAttachments.length === 0) return;

    const snapshot = composerAttachments.slice();
    const caption = composer.trim();
    const batchId =
      snapshot.length > 1
        ? typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `batch-${Date.now()}`
        : null;

    const planned = snapshot.map((att) => {
      const messageId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const ext = extForAttachmentMime(att.mime);
      const objectKey = `${sessionId}/${messageId}.${ext}`;
      return { att, messageId, objectKey };
    });

    const optimistic: ChatMessage[] = planned.map(({ att, messageId, objectKey }, i) => ({
      id: messageId,
      sessionId,
      senderId: currentUserId,
      senderRole: currentUserRole,
      body: i === 0 ? caption : "",
      createdAt: new Date().toISOString(),
      kind: "attachment" as const,
      attachmentUrl: objectKey,
      attachmentMimeType: att.mime,
      attachmentByteSize: att.sizeBytes,
      batch_id: batchId,
      pending: true,
    }));

    setMessages((prev) => [...prev, ...optimistic]);
    setSending(true);
    broadcastTyping(false);

    const uploadedKeys: string[] = [];

    try {
      await Promise.all(
        planned.map(async ({ att, objectKey }, idx) => {
          const { error: uploadError } = await client.storage
            .from(ATTACHMENT_BUCKET)
            .upload(objectKey, att.file, {
              contentType: att.mime,
              upsert: false,
            });
          if (uploadError) throw uploadError;
          uploadedKeys.push(objectKey);

          const { messageId } = planned[idx];
          const { error: insertError } = await client.from("consultation_messages").insert({
            id: messageId,
            session_id: sessionId,
            sender_id: currentUserId,
            sender_role: currentUserRole,
            kind: "attachment",
            body: idx === 0 ? caption || null : null,
            attachment_url: objectKey,
            attachment_mime_type: att.mime,
            attachment_byte_size: att.sizeBytes,
            batch_id: batchId,
          });
          if (insertError) throw insertError;
        }),
      );

      setMessages((prev) =>
        prev.map((m) =>
          optimistic.some((o) => o.id === m.id)
            ? { ...m, pending: false, failed: false, retryBody: undefined }
            : m,
        ),
      );
      for (const att of snapshot) revokeComposerPreview(att.previewUrl);
      setComposerAttachments([]);
      setComposer("");
      setReplyTo(null);
      clearDraft();
      setShowRestoreBanner(false);
    } catch (err) {
      try {
        if (uploadedKeys.length > 0) {
          await client.storage.from(ATTACHMENT_BUCKET).remove(uploadedKeys);
        }
      } catch {
        // best-effort
      }
      const optimisticIds = new Set(optimistic.map((m) => m.id));
      setMessages((prev) => prev.filter((m) => !optimisticIds.has(m.id)));
      flashAttachmentError(
        err instanceof Error && err.message
          ? `Upload failed: ${err.message}`
          : "Upload failed. Please try again.",
      );
    } finally {
      setSending(false);
      requestAnimationFrame(() => {
        scrollToBottomRef.current?.("auto");
      });
    }
    // broadcastTyping is declared below; closure picks it up at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    clearDraft,
    composer,
    composerAttachments,
    currentUserId,
    currentUserRole,
    flashAttachmentError,
    revokeComposerPreview,
    sessionId,
    sessionStatus,
  ]);

  const triggerFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const triggerCameraPicker = useCallback(() => {
    cameraInputRef.current?.click();
  }, []);

  const dismissChatHint = useCallback(() => {
    localStorage.setItem(CHAT_HINT_DISMISSED_KEY, "1");
    setHintDismissed(true);
  }, []);

  /**
   * T1.6 — when the composer exceeds the hard cap, offer attaching the
   * draft as a `.txt` through the existing attachment upload path (not
   * as a text INSERT). File inputs can't be pre-filled, so we construct
   * the File programmatically and pipe it through `uploadAndInsertAttachment`.
   */
  const attachComposerAsFile = useCallback(async () => {
    if (!composer) return;
    const file = new File([composer], "message.txt", { type: "text/plain" });
    await uploadAndInsertAttachment(file);
  }, [composer, uploadAndInsertAttachment]);

  /**
   * Lazy-mint signed URLs for attachment rows in batches. Runs on every
   * message mutation; the in-flight set + the cache map dedupe so we
   * issue one batch per render cycle and one mint per row id over the
   * lifetime of the component.
   *
   * Why batched + backend-mediated (not `client.storage.createSignedUrl`):
   *   the patient JWT (synthetic `sub`) trips Supabase Storage's auth
   *   layer even though the `storage.objects` RLS policy (079) would
   *   pass it. The backend route `POST /:sessionId/attachments/sign`
   *   uses service-role and re-enforces session membership from the
   *   same claims. Batching also halves the round-trips when 5–10
   *   attachments arrive together (e.g. a multi-image batch upload).
   */
  useEffect(() => {
    const toMint: ChatMessage[] = [];
    for (const m of messages) {
      if (m.kind !== "attachment") continue;
      const path = m.attachmentUrl;
      if (!path) continue;
      // Already-resolved (legacy full URL stored directly on the row).
      if (/^https?:\/\//.test(path)) {
        if (!signedAttachmentUrls[m.id]) {
          setSignedAttachmentUrls((prev) =>
            prev[m.id] === path ? prev : { ...prev, [m.id]: path },
          );
        }
        continue;
      }
      if (signedAttachmentUrls[m.id]) continue;
      if (signedUrlMintingRef.current.has(m.id)) continue;
      toMint.push(m);
    }
    if (toMint.length === 0) return;
    for (const m of toMint) signedUrlMintingRef.current.add(m.id);

    // Build path → message-id reverse map so we can fan results back
    // out to per-row state. Multiple rows can theoretically share a
    // path (re-upload of the same blob); we map the URL onto every
    // matching row.
    const pathToIds: Record<string, string[]> = {};
    const paths: string[] = [];
    for (const m of toMint) {
      const p = m.attachmentUrl;
      if (!p) continue;
      if (!pathToIds[p]) {
        pathToIds[p] = [];
        paths.push(p);
      }
      pathToIds[p].push(m.id);
    }

    // CRITICAL: don't gate the apply-result on an effect-scoped
    // `cancelled` flag. `messages` mutates often (typing indicator,
    // presence, optimistic updates) so the effect re-runs constantly;
    // a per-effect cancel would drop the response from any in-flight
    // request whose owning render has been superseded — which is the
    // common case. Instead we only bail on component unmount via
    // `mountedRef`. The in-flight set + `signedAttachmentUrls`
    // already deduplicate, so applying late results is safe and
    // correct.
    void (async () => {
      try {
        const token = accessTokenRef.current;
        if (!token) return;
        const result = await signAttachmentUrls(sessionId, paths, token);
        if (!mountedRef.current) return;
        const updates: Record<string, string> = {};
        for (const [path, signedUrl] of Object.entries(result.urls ?? {})) {
          for (const id of pathToIds[path] ?? []) {
            updates[id] = signedUrl;
          }
        }
        if (Object.keys(updates).length > 0) {
          setSignedAttachmentUrls((prev) => ({ ...prev, ...updates }));
        }
      } catch (err) {
        // Best-effort. Rows stay in "Loading…" UI which doubles as
        // the retry affordance — the next message mutation re-runs
        // this effect and clears `signedUrlMintingRef` for these ids
        // below, so they get re-attempted.
        if (typeof console !== "undefined") {
          console.warn(
            "[TextConsultRoom] signAttachmentUrls failed; will retry on next message mutation",
            err,
          );
        }
      } finally {
        for (const m of toMint) signedUrlMintingRef.current.delete(m.id);
      }
    })();

    return undefined;
    // signedAttachmentUrls reads via the closure — including it in deps
    // would re-run on every successful mint and try to re-mint for
    // rows we just resolved. The in-flight set guards anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, sessionId]);

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

  const handleMarkdownToolbar = useCallback(
    (action: MarkdownToolbarAction) => {
      const ta = composerRef.current;
      if (!ta) return;
      applyMarkdownToolbarAction(ta, composer, setComposer, action);
    },
    [composer],
  );

  const handleComposerKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // text-C6 — Cmd/Ctrl+Enter is owned by `useComposerHotkeys`
      // (force-send semantics). Skip here so we don't double-fire when
      // the native listener also dispatched the React synthetic event.
      if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
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
  // text-C6 — hardware-keyboard shortcuts (Esc / ↑ / Cmd+Enter).
  // ------------------------------------------------------------------------

  // Hardware-keyboard heuristic (`(pointer: fine)` — iPad Pro w/ Magic
  // Keyboard reports `fine`, iPhone reports `coarse`). Drives the
  // extended A2 hint copy. Reactive to plug/unplug via `change`.
  const [hasHardwareKeyboard, setHasHardwareKeyboard] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(pointer: fine)");
    setHasHardwareKeyboard(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setHasHardwareKeyboard(e.matches);
    // Older Safari only supports the deprecated addListener API.
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  const composerEmpty = composer.trim().length === 0;
  const replyToActive = replyTo !== null;

  // Aggregate per-bubble menu / picker visibility for Esc-priority-1.
  // Inline edit mode counts; the host owns cancellation via
  // `setEditingMessageId(null)` (≡ B6's Cancel button).
  const perBubbleMenuOpen =
    reactionPicker !== null ||
    lightboxState !== null ||
    cameraPreview !== null ||
    deleteConfirm !== null ||
    editingMessageId !== null;

  const closeAllPerBubbleMenus = useCallback(() => {
    if (reactionPicker) setReactionPicker(null);
    if (lightboxState) setLightboxState(null);
    if (cameraPreview) closeCameraPreview();
    if (deleteConfirm) clearDeleteConfirm();
    if (editingMessageId) setEditingMessageId(null);
  }, [
    cameraPreview,
    clearDeleteConfirm,
    closeCameraPreview,
    deleteConfirm,
    editingMessageId,
    lightboxState,
    reactionPicker,
  ]);

  const handleClearComposer = useCallback(() => {
    // text-D1 — cleared text remains recoverable via sessionStorage draft.
    setComposer("");
    setPartialTranscript("");
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyTo(null);
  }, []);

  const handleEditLastOwn = useCallback(() => {
    const target = findLastEditableOwnMessage(messagesRef.current, currentUserId);
    if (!target) return;
    setEditingMessageId(target.id);
  }, [currentUserId]);

  const handleForceSend = useCallback(() => {
    handleSend({ forceQueue: true });
  }, [handleSend]);

  // text-D2 — tear down Realtime while evicted; reconnect after take-over.
  const wasEvictedRef = useRef(false);
  useEffect(() => {
    if (mode === "readonly") return;
    if (evicted) {
      wasEvictedRef.current = true;
      reconnectAttemptRef.current = 0;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (offlineBadgeTimerRef.current) {
        clearTimeout(offlineBadgeTimerRef.current);
        offlineBadgeTimerRef.current = null;
      }
      teardown();
      return;
    }
    if (!wasEvictedRef.current) return;
    wasEvictedRef.current = false;
    void connect().then((ok) => {
      if (!ok && mountedRef.current) scheduleReconnect();
    });
  }, [connect, evicted, mode, scheduleReconnect, teardown]);

  useComposerHotkeys({
    composerEl: mode === "live" && !evicted ? composerEl : null,
    composerEmpty,
    replyToActive,
    menuOpen: perBubbleMenuOpen,
    onClear: handleClearComposer,
    onCancelReply: handleCancelReply,
    onEditLastOwn: handleEditLastOwn,
    onForceSend: handleForceSend,
    onCloseMenus: closeAllPerBubbleMenus,
  });

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

    /**
     * Mobile browsers (Safari iOS, Chrome Android) aggressively suspend
     * background tabs — when the chat tab is minimized, the WebSocket
     * gets reaped or paused server-side and the SDK's auto-reconnect
     * can leave us in a misleading "online" state with a half-closed
     * socket. The user-visible symptom is the connection badge
     * flickering between "Online" and "Reconnecting…" while the
     * composer stays disabled.
     *
     * Strategy:
     *   - On `visibilitychange → hidden`: stamp `hiddenAtRef` so we
     *     can measure how long the tab was backgrounded.
     *   - On `visibilitychange → visible`: if hidden ≥ 2s, force a
     *     full teardown + connect() regardless of current connection
     *     state. The 2s threshold prevents churn from quick app
     *     switches. We DO this even when state says "online" because
     *     the SDK can lie about WS health after a long suspend — a
     *     fresh connect() is the only way to guarantee a working
     *     socket.
     *   - For shorter backgrounds (<2s) we skip the kick entirely
     *     (no flicker source) UNLESS we're already non-online, in
     *     which case the kick speeds up recovery.
     */
    const onVisibilityChange = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        broadcastViewedBottomClearRef.current();
        return;
      }
      if (document.visibilityState !== "visible") return;
      if (!mountedRef.current) return;
      if (evictedRef.current) return;

      const hiddenForMs = hiddenAtRef.current
        ? Date.now() - hiddenAtRef.current
        : 0;
      hiddenAtRef.current = null;

      // Quick app switch + healthy WS → don't churn it.
      if (hiddenForMs < 2000 && connectionRef.current === "online") return;

      reconnectAttemptRef.current = 0;
      offlineSinceRef.current = null;
      if (offlineBadgeTimerRef.current) {
        clearTimeout(offlineBadgeTimerRef.current);
        offlineBadgeTimerRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      void connect().then((ok) => {
        if (!ok && mountedRef.current) scheduleReconnect();
        else maybeBroadcastViewedBottomRef.current();
      });
    };

    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", onBeforeUnload);
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (counterpartyTypingCapRef.current) clearTimeout(counterpartyTypingCapRef.current);
      if (offlineBadgeTimerRef.current) clearTimeout(offlineBadgeTimerRef.current);
      if (attachmentErrorTimerRef.current) clearTimeout(attachmentErrorTimerRef.current);
      if (actionToastTimerRef.current) clearTimeout(actionToastTimerRef.current);
      if (deleteConfirmTimerRef.current) clearTimeout(deleteConfirmTimerRef.current);
      if (connectionDebounceTimerRef.current) clearTimeout(connectionDebounceTimerRef.current);
      teardown();
      if (typeof window !== "undefined") {
        window.removeEventListener("beforeunload", onBeforeUnload);
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
    };
    // sessionId is the only true identity dependency; the rest are stable
    // refs / callbacks via useCallback. Avoiding re-mount on every prop
    // change is critical so active subscriptions don't churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Track scroll position so auto-scroll only fires when user was at bottom.
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    scrollToBottomRef.current?.(behavior);
    wasAtBottomRef.current = true;
  }, []);

  const handleListScrollChange = useCallback(
    (atBottom: boolean) => {
      const prevAtBottom = wasAtBottomRef.current;
      wasAtBottomRef.current = atBottom;
      if (!prevAtBottom && atBottom) {
        setUnreadSinceScrollUp(0);
        maybeBroadcastViewedBottom();
      } else if (prevAtBottom && !atBottom) {
        broadcastViewedBottomClear();
      }
    },
    [broadcastViewedBottomClear, maybeBroadcastViewedBottom],
  );

  const handleJumpToLatest = useCallback(() => {
    scrollToBottom("smooth");
    setUnreadSinceScrollUp(0);
    maybeBroadcastViewedBottom();
  }, [maybeBroadcastViewedBottom, scrollToBottom]);

  // Auto-scroll on new messages if user was at bottom before.
  useEffect(() => {
    if (wasAtBottomRef.current) {
      scrollToBottom("auto");
    }
  }, [messages, scrollToBottom]);

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

  const counterpartyRole =
    currentUserRole === "doctor" ? ("patient" as const) : ("doctor" as const);

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

  const sendButtonState = useMemo(
    () =>
      deriveSendButtonState({
        composerTrim: composer.trim(),
        sending,
        connection,
        charCountOverCap: composer.length > COMPOSER_HARD_CAP,
        hasAttachments: composerAttachments.length > 0,
        rateLimited: rateLimit.isRateLimited,
      }),
    [
      composer,
      composerAttachments.length,
      connection,
      sending,
      rateLimit.isRateLimited,
    ],
  );

  const messageRows = useMemo(() => buildMessageRows(messages), [messages]);

  const pinnedMessages = useMemo(
    () =>
      messages
        .filter((m) => m.pinned_at && !m.deleted_at)
        .sort(
          (a, b) =>
            new Date(b.pinned_at!).getTime() - new Date(a.pinned_at!).getTime(),
        )
        .slice(0, MAX_PINNED_MESSAGES),
    [messages],
  );

  const pinCapReached = pinnedMessages.length >= MAX_PINNED_MESSAGES;

  const sendButtonDisabled =
    (composerLockReason !== null && sendButtonState !== "queued") ||
    sendButtonState === "idle" ||
    sendButtonState === "sending" ||
    sendButtonState === "disabled-too-long" ||
    sendButtonState === "rate-limited";

  const sendButtonClass =
    sendButtonState === "idle"
      ? "bg-gray-200 text-gray-400"
      : sendButtonState === "disabled-too-long"
        ? "bg-red-100 text-red-600"
        : sendButtonState === "rate-limited"
          ? "bg-amber-100 text-amber-700"
          : sendButtonState === "queued"
            ? "bg-blue-600 text-white opacity-80 hover:bg-blue-700"
            : "bg-blue-600 text-white hover:bg-blue-700";

  // ------------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------------

  const ended = statusError(sessionStatus);

  // Plan 06 · Task 38 — layout-driven container + bubble styling. The
  // visual diff is pure CSS; no plumbing branches. `standalone` keeps
  // the Task 19 baseline verbatim; `panel` drops the outer frame (the
  // `<VideoRoom>` parent owns the border) + header (parent owns it);
  // `canvas` keeps a slim header for the voice-room single-pane mount.
  // Standalone desktop branch: pin a definite height so the inner
  // `flex-1 overflow-y-auto` messages list actually engages. Without
  // a definite height (`md:h-full` against an unconstrained parent
  // chain — `<LiveConsultPanel>` → `<section>` → page body), the
  // container collapses to natural content height, the messages list
  // can't scroll, and the whole page scrolls instead. 640px is a
  // comfortable chat-window height on a typical 1080p laptop;
  // `md:max-h-[80dvh]` caps it on shorter screens (e.g. 768px tall
  // viewports) so the "Resend join link" footer stays above the fold;
  // `md:min-h-[480px]` keeps the existing floor.
  const containerClass =
    layout === "standalone"
      ? "relative flex h-[100dvh] w-full flex-col bg-white md:h-[640px] md:max-h-[80dvh] md:min-h-[480px] md:rounded-lg md:border md:border-gray-200"
      : layout === "canvas"
        ? "relative flex h-full min-h-[320px] w-full flex-col bg-white"
        : // 'panel'
          "relative flex h-full min-h-[320px] w-full flex-col bg-white";
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
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <ConnectionQualityBadge
              sessionId={sessionId}
              accessToken={accessToken}
              currentUserRole={currentUserRole}
              mode={mode}
            />
            <span
              className={"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium " + statusBadgeClass}
              role="status"
              aria-live="polite"
            >
              <span className={"inline-block h-1.5 w-1.5 rounded-full " + statusBadgeDot} aria-hidden />
              {statusBadgeText}
            </span>
          </div>
        </header>
      )}

      <div
        className={
          dropZoneEnabled
            ? "relative flex min-h-0 flex-1 flex-col"
            : "flex min-h-0 flex-1 flex-col"
        }
        {...(dropZoneEnabled
          ? {
              onDragOver: handleDragOver,
              onDragEnter: handleDragEnter,
              onDragLeave: handleDragLeave,
              onDrop: handleDrop,
              "aria-dropeffect": "copy" as const,
            }
          : {})}
        data-testid={dropZoneEnabled ? "text-consult-room-drop-zone" : undefined}
      >
        {dropZoneEnabled && dragOverActive ? (
          <div
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-blue-500 bg-blue-100/50"
            data-testid="text-consult-room-drop-overlay"
            aria-hidden
          >
            <span
              className={
                layout === "canvas"
                  ? "text-sm font-medium text-blue-700"
                  : "text-lg font-medium text-blue-700"
              }
            >
              Drop to attach
            </span>
          </div>
        ) : null}

      {/* Messages list — text-D3: Virtuoso when >100 messages */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {mode === "live" && layout === "panel" && currentUserRole === "doctor" ? (
          <div className="flex justify-end border-b border-gray-100 bg-white px-2 py-1">
            <ConnectionQualityBadge
              sessionId={sessionId}
              accessToken={accessToken}
              currentUserRole={currentUserRole}
              mode={mode}
            />
          </div>
        ) : null}
        {showLocalNotificationConsentPrompt ? (
          <LocalNotificationConsentPrompt
            sessionId={sessionId}
            onEnabled={() => {
              if (typeof window !== "undefined" && "Notification" in window) {
                setLocalNotifPermission(Notification.permission);
              }
              setLocalNotifPromptHidden(true);
            }}
            onSnooze={() => {
              snoozeLocalNotifPrompt(sessionId);
              setLocalNotifPromptHidden(true);
            }}
            onDismiss={() => {
              dismissLocalNotifPrompt(sessionId);
              setLocalNotifPromptHidden(true);
            }}
          />
        ) : null}
        {showPushOptInBanner ? (
          <PushOptInBanner
            counterpartyLabel={pushCounterpartyLabel}
            onEnable={pushSubscription.subscribe}
            onDismiss={pushSubscription.dismissOptIn}
          />
        ) : null}
        <PinnedMessagesBanner
          pinned={pinnedMessages}
          currentUserRole={currentUserRole}
          layout={layout}
          onJumpToPin={(id) => scrollToMessage(id, { highlight: true })}
          onUnpin={mode === "live" && currentUserRole === "doctor" ? handleTogglePin : undefined}
        />
        <MessageList
          rows={messageRows}
          layout={layout}
          mode={mode}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          signedAttachmentUrls={signedAttachmentUrls}
          reactionsByMessageId={reactionsByMessageId}
          userNameById={userNameById}
          counterpartyName={counterpartyName}
          editingMessageId={editingMessageId}
          editSaving={editSaving}
          pinCapReached={pinCapReached}
          lookupMessageById={lookupMessageById}
          getSenderDisplayName={messageSenderDisplayName}
          onScrollChange={handleListScrollChange}
          scrollToMessageRef={scrollToMessageRef}
          scrollToBottomRef={scrollToBottomRef}
          onStartReply={mode === "live" ? handleStartReply : undefined}
          onRetryFailed={retryFailed}
          onDiscardFailed={discardFailed}
          onStartEdit={mode === "live" ? handleStartEdit : undefined}
          onSaveEdit={mode === "live" ? handleSaveEdit : undefined}
          onCancelEdit={mode === "live" ? handleCancelEdit : undefined}
          onSoftDelete={mode === "live" ? handleSoftDeleteRequest : undefined}
          onTogglePin={
            mode === "live" && currentUserRole === "doctor" ? handleTogglePin : undefined
          }
          onToggleReaction={mode === "live" ? toggleReaction : undefined}
          onOpenReactionPicker={mode === "live" ? handleOpenReactionPicker : undefined}
          onOpenLightbox={openLightbox}
        />
        {mode === "live" ? (
          <TextChatJumpToLatest
            unreadCount={unreadSinceScrollUp}
            onJump={handleJumpToLatest}
          />
        ) : null}
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

      {/* Plan 06 attachments — transient validation / upload error banner.
          Auto-clears after 4s via flashAttachmentError; no dismiss UI
          because the timeout is short and stacking is disabled (each
          flash replaces the prior). Suppressed in readonly because the
          composer is gone. */}
      {mode === "live" && attachmentError ? (
        <div
          role="alert"
          className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800"
          data-testid="text-consult-room-attachment-error"
        >
          {attachmentError}
        </div>
      ) : null}

      {mode === "live" && deleteConfirm ? (
        <div
          role="alert"
          className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900"
          data-testid="text-consult-room-delete-confirm"
        >
          <span>Delete this message? This can&apos;t be undone.</span>
          <span className="ml-2 inline-flex gap-2">
            <button
              type="button"
              onClick={() => void handleSoftDeleteConfirm()}
              className="font-medium underline hover:text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={clearDeleteConfirm}
              className="underline hover:text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              Cancel
            </button>
          </span>
        </div>
      ) : null}

      {mode === "live" && actionToast ? (
        <div
          role="status"
          className="border-t border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-700"
          data-testid="text-consult-room-action-toast"
        >
          {actionToast}
        </div>
      ) : null}

      {/* Counterparty typing — above composer; panel has no header so this
          is the only surface for typing in that layout. */}
      {mode === "live" && !ended && counterpartyTyping ? (
        <div
          className="flex items-center gap-2 border-t border-gray-100 bg-white px-3 py-1 text-xs text-gray-500"
          aria-live="polite"
          data-testid="text-consult-room-typing-indicator"
        >
          <Avatar role={counterpartyRole} size="xs" />
          <span
            className="inline-flex gap-0.5"
            aria-label={`${counterpartyLabel} is typing`}
          >
            <span className="animate-typing-dot">·</span>
            <span className="animate-typing-dot [animation-delay:150ms]">·</span>
            <span className="animate-typing-dot [animation-delay:300ms]">·</span>
          </span>
        </div>
      ) : null}

      {/* Composer — hidden while evicted (text-D2 overlay blocks interaction). */}
      {mode === "live" && !ended && !evicted ? (
        <form
          onSubmit={handleSubmit}
          data-host={layout}
          className="group border-t border-gray-200 bg-white px-3 py-2"
        >
          {/* CP-D5: in-call mark-no-show parity with video / voice rooms.
              Rendered only when the prop is supplied (cockpit + doctor role).
              type="button" prevents accidental form submission. */}
          {onMarkNoShow && (
            <div className="mb-1.5 flex justify-end">
              <button
                type="button"
                onClick={handleMarkNoShowClick}
                disabled={noShowBusy}
                title={
                  noShowStep === "confirm"
                    ? "Click again to confirm no-show"
                    : "Mark this patient as a no-show"
                }
                aria-label={
                  noShowStep === "confirm"
                    ? "Confirm marking patient as no-show"
                    : "Mark patient as no-show"
                }
                className={
                  noShowStep === "confirm"
                    ? "rounded-md border border-red-600 bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-60"
                    : "rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-60"
                }
              >
                {noShowBusy
                  ? "Marking…"
                  : noShowStep === "confirm"
                    ? "Confirm no-show?"
                    : "Mark no-show"}
              </button>
            </div>
          )}
          {/* Plan 06 attachments — hidden file inputs. Paperclip uses the
              multi-type picker; camera uses capture + preview overlay (C1);
              gallery input is for "Switch to gallery" from that overlay. */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => void handleFilePick(e.target.files, "files")}
            data-testid="text-consult-room-file-input"
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleCameraCapture}
            data-testid="text-consult-room-camera-input"
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleGalleryCaptureForCamera}
            data-testid="text-consult-room-gallery-input"
          />
          <div className="flex flex-col gap-1">
            {showRestoreBanner && hydratedDraft ? (
              <div
                className="border-l-2 border-yellow-400 bg-yellow-50 px-3 py-1 text-xs text-yellow-800"
                data-testid="text-consult-room-draft-restore-banner"
              >
                Your draft was restored.
                {hydratedDraft.attachmentMeta.length > 0 ? (
                  <>
                    {" "}
                    Re-attach:{" "}
                    {hydratedDraft.attachmentMeta.map((a) => a.name).join(", ")}
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={handleDiscardDraft}
                  className="ml-2 underline"
                >
                  Discard
                </button>
              </div>
            ) : null}
            {layout === "standalone" ? (
              <div
                className="flex flex-wrap items-center gap-0.5"
                data-testid="text-consult-room-markdown-toolbar"
                role="toolbar"
                aria-label="Formatting"
              >
                {(
                  [
                    ["bold", "B", "Bold"],
                    ["italic", "I", "Italic"],
                    ["strike", "S", "Strikethrough"],
                    ["code", "</>", "Inline code"],
                    ["link", "🔗", "Link"],
                    ["list", "≡", "Bullet list"],
                  ] as const
                ).map(([action, label, title]) => (
                  <button
                    key={action}
                    type="button"
                    title={title}
                    aria-label={title}
                    disabled={composerLockReason !== null}
                    onClick={() => handleMarkdownToolbar(action)}
                    className="min-w-[28px] rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-xs text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
            {replyTo ? (
              <div
                className="flex items-start gap-2 border-l-2 border-blue-500 bg-blue-50 px-3 py-1.5 text-xs"
                data-testid="text-consult-room-reply-banner"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-gray-900">
                    Replying to {replyTo.senderName}
                  </div>
                  <div className="truncate text-gray-600">
                    {renderMarkdownLite(replyTo.body, { compact: true })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  className="shrink-0 text-lg leading-none text-gray-500 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="Cancel reply"
                >
                  ×
                </button>
              </div>
            ) : null}
            {composerAttachments.length > 0 ? (
              <div
                className="flex gap-2 overflow-x-auto pb-2"
                data-testid="text-consult-room-attachment-preview"
              >
                {composerAttachments.map((a) => (
                  <div key={a.localId} className="relative h-16 w-16 flex-shrink-0">
                    {a.mime.startsWith("image/") ? (
                      /* eslint-disable-next-line @next/next/no-img-element -- blob preview */
                      <img
                        src={a.previewUrl}
                        alt=""
                        className="h-full w-full rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center rounded bg-gray-100 text-lg">
                        📄
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removeComposerAttachment(a.localId)}
                      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white"
                      aria-label="Remove attachment"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="flex items-end gap-2">
              {/* text-C1 — camera-direct with preview overlay; all layouts. */}
              <button
                type="button"
                onClick={triggerCameraPicker}
                disabled={composerLockReason !== null}
                title="Take photo"
                aria-label="Take photo"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full p-2 text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:text-gray-300"
                data-testid="text-consult-room-camera-button"
              >
                📷
              </button>
              <button
                type="button"
                onClick={triggerFilePicker}
                disabled={composerLockReason !== null}
                title="Attach images or PDF"
                aria-label="Attach images or PDF"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:text-gray-300"
                data-testid="text-consult-room-file-button"
              >
                📎
              </button>
              {speechRecognitionSupported ? (
                <>
                  <button
                    type="button"
                    onClick={handleDictationToggle}
                    disabled={composerLockReason !== null}
                    aria-pressed={isDictating}
                    aria-label={isDictating ? "Stop dictation" : "Start dictation"}
                    title={
                      isDictating
                        ? "Recording — tap to stop"
                        : "Dictate (audio processed by your browser; not stored)"
                    }
                    className={
                      "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:text-gray-300 " +
                      (isDictating
                        ? "animate-pulse bg-red-100 text-red-700"
                        : "text-gray-600 hover:bg-gray-100")
                    }
                    data-testid="text-consult-room-dictation-button"
                  >
                    🎙
                    {isDictating ? (
                      <span
                        className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500"
                        aria-hidden
                      />
                    ) : null}
                  </button>
                  <select
                    value={dictationLocale}
                    onChange={(e) => setDictationLocale(e.target.value)}
                    disabled={composerLockReason !== null || isDictating}
                    aria-label="Dictation language"
                    title="Dictation language"
                    className="h-9 max-w-[5.5rem] shrink-0 rounded-lg border border-gray-300 bg-white px-1.5 text-xs text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 group-data-[host=panel]:max-w-[4.25rem] group-data-[host=canvas]:max-w-[6.5rem] group-data-[host=standalone]:max-w-[7.5rem]"
                    data-testid="text-consult-room-dictation-locale"
                  >
                    {SPEECH_RECOGNITION_LOCALES.map((loc) => (
                      <option key={loc.value} value={loc.value}>
                        {layout === "panel" ? loc.value : loc.label}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
              <div className="relative min-h-[36px] flex-1">
                {partialTranscript ? (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl border border-transparent px-3 py-2 text-sm leading-[1.25rem] text-gray-900 whitespace-pre-wrap break-words"
                    data-testid="text-consult-room-dictation-overlay"
                  >
                    <span className="whitespace-pre-wrap">{composer}</span>
                    <span className="text-gray-400 italic">{partialTranscript}</span>
                  </div>
                ) : null}
                <textarea
                  ref={setComposerRef}
                  value={composer}
                  onChange={handleComposerChange}
                  onKeyDown={handleComposerKeyDown}
                  placeholder={composerLockReason ?? "Type a message…"}
                  disabled={composerLockReason !== null}
                  title={composerLockReason ?? undefined}
                  rows={1}
                  aria-label="Message"
                  className={
                    "relative z-[1] min-h-[36px] w-full resize-none rounded-2xl border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 " +
                    (partialTranscript
                      ? "bg-transparent text-transparent caret-gray-900"
                      : "bg-white text-gray-900")
                  }
                />
              </div>
            </div>
            {!hintDismissed ? (
              <div
                className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-gray-500 group-data-[host=canvas]:hidden"
                data-testid="text-consult-room-keyboard-hint"
                data-has-hardware-keyboard={hasHardwareKeyboard || undefined}
              >
                <kbd className="rounded border border-gray-300 bg-gray-100 px-1 py-0.5 font-mono text-[10px]">
                  Enter
                </kbd>
                <span>to send ·</span>
                <kbd className="rounded border border-gray-300 bg-gray-100 px-1 py-0.5 font-mono text-[10px]">
                  Shift+Enter
                </kbd>
                <span>for newline ·</span>
                {/* text-C6 — extra shortcuts surfaced only when a
                    hardware keyboard is plausible (`(pointer: fine)`).
                    Touch-only devices keep the A2 hint untouched. */}
                {hasHardwareKeyboard ? (
                  <>
                    <kbd className="rounded border border-gray-300 bg-gray-100 px-1 py-0.5 font-mono text-[10px]">
                      Esc
                    </kbd>
                    <span>to clear ·</span>
                    <kbd className="rounded border border-gray-300 bg-gray-100 px-1 py-0.5 font-mono text-[10px]">
                      ↑
                    </kbd>
                    <span>to edit last ·</span>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={dismissChatHint}
                  className="font-medium text-blue-600 underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                >
                  Got it
                </button>
              </div>
            ) : null}
            {composer.length >= COMPOSER_COUNTER_DISPLAY_THRESHOLD ? (
              <div className="flex flex-col items-end gap-0.5">
                <span
                  className={
                    composer.length > COMPOSER_HARD_CAP
                      ? "text-xs text-red-600"
                      : "text-xs text-gray-500"
                  }
                  aria-live="polite"
                  data-testid="text-consult-room-char-counter"
                >
                  {composer.length} / {COMPOSER_HARD_CAP}
                </span>
                {composer.length > COMPOSER_HARD_CAP ? (
                  <p
                    className="text-xs text-red-600"
                    data-testid="text-consult-room-too-long-cta"
                  >
                    Message too long —{" "}
                    <button
                      type="button"
                      onClick={() => void attachComposerAsFile()}
                      className="font-medium underline underline-offset-2 hover:text-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
                    >
                      attach as file instead
                    </button>
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={sendButtonDisabled}
                aria-label={
                  sendButtonState === "rate-limited"
                    ? `Rate limit hit — wait ${rateLimit.cooldownSecondsRemaining}s before sending again`
                    : "Send message"
                }
                aria-busy={sendButtonState === "sending"}
                title={
                  sendButtonState === "queued"
                    ? "Will send when back online"
                    : sendButtonState === "rate-limited"
                      ? `Wait ${rateLimit.cooldownSecondsRemaining}s before sending again`
                      : undefined
                }
                data-send-state={sendButtonState}
                data-rate-limit-cooldown={
                  sendButtonState === "rate-limited"
                    ? rateLimit.cooldownSecondsRemaining
                    : undefined
                }
                className={
                  "relative flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed " +
                  sendButtonClass
                }
              >
                {sendButtonState === "sending" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : sendButtonState === "queued" ? (
                  <>
                    <span>Send</span>
                    <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  </>
                ) : sendButtonState === "rate-limited" ? (
                  <>
                    <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>{rateLimit.cooldownSecondsRemaining}s</span>
                  </>
                ) : (
                  "Send"
                )}
              </button>
            </div>
          </div>
        </form>
      ) : null}
      {mode === "live" && reactionPicker ? (
        <ReactionPicker
          messageId={reactionPicker.messageId}
          anchor={reactionPicker.anchor}
          coords={reactionPicker.coords}
          open
          onClose={handleCloseReactionPicker}
          onPick={handleReactionPick}
        />
      ) : null}
      {/* text-D2 — patient multi-tab kick overlay (z-50 above banners/lightbox). */}
      {evicted ? (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="text-consult-eviction-overlay"
          className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/95 p-6 text-center"
        >
          <h2 className="mb-2 text-lg font-semibold">
            This consultation is open in another tab
          </h2>
          <p className="mb-4 text-sm text-gray-600">
            Switch to that tab to continue, or take over here.
          </p>
          <button
            type="button"
            onClick={takeOver}
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Take over
          </button>
        </div>
      ) : null}

      {mode === "live" && !ended && cameraPreview ? (
        <CameraPreviewOverlay
          previewUrl={cameraPreview.previewUrl}
          onRetake={handleCameraPreviewRetake}
          onSwitchToGallery={handleCameraPreviewSwitchToGallery}
          onCancel={closeCameraPreview}
          onSend={handleCameraPreviewSend}
          sendDisabled={composerAttachments.length >= MAX_COMPOSER_ATTACHMENTS}
        />
      ) : null}
      {lightboxState ? (
        <ImageLightbox
          images={lightboxState.images}
          initialIndex={lightboxState.index}
          onClose={closeLightbox}
        />
      ) : null}
      </div>
    </div>
  );
}
