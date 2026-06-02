"use client";

import { useCallback, useRef } from "react";
import {
  deriveMessageDeliveryStatus,
  MessageStatus,
} from "@/components/consultation/MessageStatus";
import { QuotedParentPreview } from "@/components/consultation/QuotedParentPreview";
import { formatSystemMessageBody } from "@/lib/consultation/format-system-message";
import { formatTime } from "@/lib/format-date";
import { useLongPress } from "@/lib/gestures/use-long-press";
import { useSwipeToReply } from "@/lib/gestures/use-swipe-to-reply";
import {
  aggregateReactions,
  type ConsultationMessageReaction,
  type ReactionEmoji,
} from "@/lib/text/aggregate-reactions";
import { EditableMessageBubble } from "@/components/consultation/EditableMessageBubble";
import { MessageBubbleMenu } from "@/components/consultation/MessageBubbleMenu";
import { renderMarkdownLite } from "@/lib/text/markdown-lite";
import type { ConsultationMessage } from "@/lib/text/types";

export interface ReactionPickerAnchorCoords {
  x: number;
  y: number;
}
export interface MessageBubbleProps {
  message: ConsultationMessage;
  currentUserId: string;
  currentUserRole: "doctor" | "patient";
  layout: "standalone" | "panel" | "canvas";
  mode: "live" | "readonly";
  /** Whether to show the minute-bucket timestamp above this bubble. */
  showTimestamp: boolean;
  /** Lazily signed URL for attachment rows (keyed by message id in parent). */
  signedAttachmentUrl?: string | null;
  lookupMessageById: (id: string) => ConsultationMessage | null;
  getSenderDisplayName: (message: ConsultationMessage) => string;
  onScrollToMessage?: (id: string, opts?: { highlight?: boolean }) => void;
  onStartReply?: (message: ConsultationMessage) => void;
  onRetryFailed?: (localId: string) => void;
  onDiscardFailed?: (localId: string) => void;
  /** text-B5 — rows for this message (parent filters by message id). */
  reactions?: ConsultationMessageReaction[];
  /** text-B5 — tap badge to toggle; long-press / right-click opens picker. */
  onToggleReaction?: (messageId: string, emoji: ReactionEmoji) => void;
  onOpenReactionPicker?: (
    messageId: string,
    anchor: HTMLElement,
    coords?: ReactionPickerAnchorCoords,
  ) => void;  userNameById?: (userId: string) => string;
  /** Header counterparty name — used for soft-delete tombstone copy. */
  counterpartyName?: string;
  /** text-B6 — inline edit for this bubble. */
  isEditing?: boolean;
  editSaving?: boolean;
  onStartEdit?: (message: ConsultationMessage) => void;
  onSaveEdit?: (messageId: string, body: string) => void;
  onCancelEdit?: () => void;
  onSoftDelete?: (message: ConsultationMessage) => void;
  onTogglePin?: (messageId: string) => void;
  /** text-B7 — disable Pin in menu when three messages are already pinned. */
  pinCapReached?: boolean;
  /** text-C2 — tap image attachment to open full-screen lightbox. */
  onOpenLightbox?: (messageId: string) => void;
}

function formatDeletedByLabel(
  message: ConsultationMessage,
  counterpartyName: string | undefined,
  currentUserId: string,
): string {
  if (message.senderRole === "patient") return "Patient";
  if (message.senderId !== currentUserId) {
    const name = counterpartyName?.trim();
    return name ? `Dr. ${name}` : "Doctor";
  }
  return "Doctor";
}

function isImageMime(mime: string | null | undefined): boolean {
  return !!mime && mime.startsWith("image/");
}

function formatBytesShort(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function bubbleMaxWidthForLayout(layout: MessageBubbleProps["layout"]): string {
  return layout === "panel" ? "max-w-[90%]" : layout === "canvas" ? "max-w-[75%]" : "max-w-[80%]";
}

/**
 * Single consultation message row — text / attachment bubble, system banner,
 * or failed-send affordances. Extracted from TextConsultRoom (text-B2).
 */
export function MessageBubble({
  message: m,
  currentUserId,
  currentUserRole: _currentUserRole,
  layout,
  mode,
  showTimestamp: showTs,
  signedAttachmentUrl,
  lookupMessageById,
  getSenderDisplayName,
  onScrollToMessage,
  onStartReply,
  onRetryFailed,
  onDiscardFailed,
  reactions = [],
  onToggleReaction,
  onOpenReactionPicker,
  userNameById,
  counterpartyName,
  isEditing = false,
  editSaving = false,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onSoftDelete,
  onTogglePin,
  pinCapReached = false,
  onOpenLightbox,
}: MessageBubbleProps): JSX.Element {
  const bubbleBodyRef = useRef<HTMLDivElement | null>(null);
  const longPressCoordsRef = useRef<ReactionPickerAnchorCoords | null>(null);

  const openPickerFromAnchor = useCallback(
    (coords?: ReactionPickerAnchorCoords) => {
      if (!onOpenReactionPicker || !bubbleBodyRef.current) return;
      onOpenReactionPicker(m.id, bubbleBodyRef.current, coords);
    },
    [m.id, onOpenReactionPicker],
  );

  const longPressHandlers = useLongPress({
    onLongPress: () => {
      openPickerFromAnchor(longPressCoordsRef.current ?? undefined);
      longPressCoordsRef.current = null;
    },
  });

  const showMenu =
    mode === "live" &&
    !!onStartReply &&
    !m.failed &&
    !m.pending;

  const { handlers: swipeHandlers, dragOffset, dragging } = useSwipeToReply({
    onTrigger: () => onStartReply?.(m),
    enabled: showMenu,
  });

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!onOpenReactionPicker) return;
      e.preventDefault();
      openPickerFromAnchor();
    },
    [onOpenReactionPicker, openPickerFromAnchor],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!onOpenReactionPicker) return;
      longPressCoordsRef.current = { x: e.clientX, y: e.clientY };
      longPressHandlers.onPointerDown(e);
    },
    [longPressHandlers, onOpenReactionPicker],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      longPressHandlers.onPointerUp(e);
      longPressCoordsRef.current = null;
    },
    [longPressHandlers],
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent) => {
      longPressHandlers.onPointerCancel(e);
      longPressCoordsRef.current = null;
    },
    [longPressHandlers],
  );  // Plan 06 · Task 38 — system rows render as a full-width italic banner.
  if (m.kind === "system") {
    return (
      <li className="flex items-center justify-center">
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
          <span>
            {formatSystemMessageBody({
              body: m.body,
              systemEvent: m.systemEvent,
              metadata: m.metadata,
              currentUserId,
            })}
          </span>
        </p>
      </li>
    );
  }

  const isSelf = m.senderId === currentUserId;
  const align = isSelf ? "items-end" : "items-start";
  const bubble = isSelf
    ? "bg-blue-600 text-white"
    : "bg-white text-gray-900 border border-gray-200";
  const showFailedActions = mode !== "readonly" && m.failed;
  const deliveryStatus =
    isSelf && mode !== "readonly" ? deriveMessageDeliveryStatus(m) : "none";
  const bubbleMaxWidth = bubbleMaxWidthForLayout(layout);

  const replyParentId = m.reply_to_id ?? null;
  const replyParent = replyParentId ? lookupMessageById(replyParentId) : null;
  const isDeleted = !!m.deleted_at;
  const aggregatedReactions = aggregateReactions(reactions);
  const reactionEntries = Object.entries(aggregatedReactions).filter(
    ([, users]) => users.length > 0,
  );
  const resolveUserName =
    userNameById ??
    ((userId: string) => (userId === currentUserId ? "You" : "Participant"));

  const bubbleClassName =
    bubbleMaxWidth +
    " message-body whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm shadow-sm " +
    bubble +
    (m.pending ? " opacity-70" : "");

  const messageBubble = (
    <div
      ref={bubbleBodyRef}
      onContextMenu={onOpenReactionPicker ? handleContextMenu : undefined}
      onPointerDown={onOpenReactionPicker ? handlePointerDown : undefined}
      onPointerMove={onOpenReactionPicker ? longPressHandlers.onPointerMove : undefined}
      onPointerUp={onOpenReactionPicker ? handlePointerUp : undefined}
      onPointerCancel={onOpenReactionPicker ? handlePointerCancel : undefined}
      onPointerLeave={onOpenReactionPicker ? handlePointerCancel : undefined}
      className={bubbleClassName}
    >
      {m.pinned_at && !isDeleted ? (
        <p
          className={
            "mb-1 text-[10px] " + (isSelf ? "text-white/70" : "text-gray-400")
          }
          aria-label="Pinned message"
        >
          📌 pinned
        </p>
      ) : null}
      {replyParentId && !isDeleted ? (
        <QuotedParentPreview
          parent={replyParent}
          parentSenderName={
            replyParent ? getSenderDisplayName(replyParent) : "Unknown"
          }
          variant={isSelf ? "self" : "other"}
          onJumpToParent={() =>
            onScrollToMessage?.(replyParentId, { highlight: true })
          }
        />
      ) : null}
      {isDeleted ? (
        <div className="italic text-sm text-gray-400">
          (deleted by {formatDeletedByLabel(m, counterpartyName, currentUserId)})
        </div>
      ) : isEditing && onSaveEdit && onCancelEdit ? (
        <EditableMessageBubble
          initialBody={m.body}
          isSelf={isSelf}
          saving={editSaving}
          onSave={(body) => onSaveEdit(m.id, body)}
          onCancel={onCancelEdit}
        />
      ) : (
        <span className="inline-flex w-full flex-wrap items-end gap-x-1">
          <span className="min-w-0 flex-1">
            {m.kind === "attachment" && m.attachmentUrl ? (
              (() => {
                const signedUrl = signedAttachmentUrl ?? null;
                const sizeLabel = formatBytesShort(m.attachmentByteSize);
                const captionLine =
                  sizeLabel && m.body
                    ? `${m.body} · ${sizeLabel}`
                    : m.body ||
                      (sizeLabel ? `Attachment · ${sizeLabel}` : "Attachment");
                if (isImageMime(m.attachmentMimeType)) {
                  return (
                    <div className="flex flex-col gap-1.5">
                      {signedUrl ? (
                        onOpenLightbox ? (
                          <button
                            type="button"
                            onClick={() => onOpenLightbox(m.id)}
                            className="block overflow-hidden rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                            aria-label={`View ${m.body || "image"}`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element -- direct <img> renders fastest for chat thumbs and dodges next/image's domain config */}
                            <img
                              src={signedUrl}
                              alt={m.body || "Image attachment"}
                              loading="lazy"
                              className="block max-h-60 w-auto max-w-full rounded-lg bg-gray-100 object-contain"
                            />
                          </button>
                        ) : (
                          <a
                            href={signedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block overflow-hidden rounded-lg"
                            aria-label={`Open ${m.body || "image"} in a new tab`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element -- direct <img> renders fastest for chat thumbs and dodges next/image's domain config */}
                            <img
                              src={signedUrl}
                              alt={m.body || "Image attachment"}
                              loading="lazy"
                              className="block max-h-60 w-auto max-w-full rounded-lg bg-gray-100 object-contain"
                            />
                          </a>
                        )
                      ) : (
                        <div
                          className="flex h-32 w-40 items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-500"
                          aria-label="Loading image preview"
                        >
                          {m.pending ? "Uploading…" : "Loading…"}
                        </div>
                      )}
                      <span
                        className={
                          "text-[11px] " +
                          (isSelf ? "text-white/85" : "text-gray-500")
                        }
                      >
                        {captionLine}
                      </span>
                    </div>
                  );
                }
                return signedUrl ? (
                  <a
                    href={signedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={
                      "inline-flex items-center gap-1.5 underline " +
                      (isSelf ? "text-white" : "text-blue-700")
                    }
                  >
                    <span aria-hidden>📎</span>
                    <span>{captionLine}</span>
                  </a>
                ) : (
                  <span
                    className={
                      "inline-flex items-center gap-1.5 " +
                      (isSelf ? "text-white/85" : "text-gray-600")
                    }
                  >
                    <span aria-hidden>📎</span>
                    <span>
                      {m.pending ? "Uploading…" : "Loading…"} {captionLine}
                    </span>
                  </span>
                );
              })()
            ) : (
              renderMarkdownLite(m.body)
            )}
          </span>
          {isSelf ? <MessageStatus status={deliveryStatus} /> : null}
        </span>
      )}
    </div>
  );

  return (
    <li
      role="listitem"
      {...(showMenu ? swipeHandlers : {})}
      style={
        showMenu
          ? {
              transform: dragOffset > 0 ? `translateX(${dragOffset}px)` : undefined,
              transition: dragging ? "none" : "transform 200ms ease-out",
            }
          : undefined
      }
      className={
        "group/message relative flex flex-col " +
        align +
        (m.failed ? " border-l-2 border-red-300 pl-2" : "")
      }
      data-message-id={m.id}
      data-failed={m.failed ? "true" : undefined}
    >
      {showTs ? (
        <p className="mb-0.5 flex items-center gap-1 px-1 text-[11px] text-gray-500">
          <span>{formatTime(m.createdAt)}</span>
          {m.edited_at && !isDeleted ? (
            <span
              className="text-gray-400"
              title={`Original sent at ${formatTime(m.createdAt)}`}
            >
              · edited
            </span>
          ) : null}
        </p>
      ) : null}
      {showMenu ? (
        <div
          className={
            "absolute top-0 z-10 " + (isSelf ? "right-0" : "left-0")
          }
        >
          <MessageBubbleMenu
            message={m}
            isOwn={isSelf}
            mode={mode}
            currentUserRole={_currentUserRole}
            reactionAnchorRef={bubbleBodyRef}
            onStartReply={() => onStartReply?.(m)}
            onAddReaction={(anchor) => onOpenReactionPicker?.(m.id, anchor)}
            onStartEdit={() => onStartEdit?.(m)}
            onSoftDelete={() => onSoftDelete?.(m)}
            onTogglePin={onTogglePin ? () => onTogglePin(m.id) : undefined}
            pinCapReached={pinCapReached}
          />
        </div>
      ) : null}
      {showMenu ? (
        <div className={"relative " + (isSelf ? "self-end" : "self-start")}>
          <div
            className="pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 select-none text-lg text-gray-400"
            style={{ opacity: Math.min(1, dragOffset / 60) }}
            aria-hidden
            data-testid="message-bubble-swipe-reply-icon"
          >
            ↩
          </div>
          {messageBubble}
        </div>
      ) : (
        messageBubble
      )}
      {!isDeleted && reactionEntries.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1 animate-in fade-in duration-200">
          {reactionEntries.map(([emoji, users]) => {
            const mine = users.includes(currentUserId);
            const badge = (
              <>
                {emoji} {users.length}
              </>
            );
            const className =
              "px-1.5 py-0.5 text-xs rounded-full border transition-colors " +
              (mine
                ? "bg-blue-50 border-blue-300"
                : "bg-gray-50 border-gray-200");
            const label = `${emoji}, ${users.length} reaction${users.length === 1 ? "" : "s"}`;
            const title = users.map((u) => resolveUserName(u)).join(", ");
            if (onToggleReaction) {
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onToggleReaction(m.id, emoji as ReactionEmoji)}
                  className={className}
                  aria-label={label}
                  title={title}
                >
                  {badge}
                </button>
              );
            }
            return (
              <span
                key={emoji}
                className={className}
                aria-label={label}
                title={title}
              >
                {badge}
              </span>
            );
          })}
        </div>
      ) : null}
      {showFailedActions ? (
        <div
          className="mt-1 flex items-center gap-2 text-xs text-red-700"
          data-failure-reason={m.failureReason ?? "unknown"}
        >
          <span
            title={
              m.failureReason === "rate-limited"
                ? "You hit the per-minute message cap. Retry once the countdown clears."
                : undefined
            }
          >
            {m.failureReason === "rate-limited"
              ? "Rate limit hit"
              : "Failed to send"}
          </span>
          <button
            type="button"
            onClick={() => onRetryFailed?.(m.id)}
            className="underline hover:text-red-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => onDiscardFailed?.(m.id)}
            className="underline hover:text-red-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
          >
            Discard
          </button>
        </div>
      ) : null}
    </li>
  );
}

/** Group bubble timestamps — show time on first message of a minute-bucket. */
export function shouldShowMessageTimestamp(
  prev: ConsultationMessage | undefined,
  current: ConsultationMessage,
): boolean {
  if (!prev) return true;
  const a = new Date(prev.createdAt).getTime();
  const b = new Date(current.createdAt).getTime();
  return (
    Math.floor(a / 60_000) !== Math.floor(b / 60_000) ||
    prev.senderId !== current.senderId
  );
}
