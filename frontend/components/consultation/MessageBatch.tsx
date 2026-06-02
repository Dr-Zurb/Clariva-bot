"use client";

import { useCallback, useRef } from "react";
import {
  deriveMessageDeliveryStatus,
  MessageStatus,
} from "@/components/consultation/MessageStatus";
import { formatTime } from "@/lib/format-date";
import { useLongPress } from "@/lib/gestures/use-long-press";
import {
  aggregateReactions,
  type ConsultationMessageReaction,
  type ReactionEmoji,
} from "@/lib/text/aggregate-reactions";
import type { ConsultationMessage } from "@/lib/text/types";
import type { ReactionPickerAnchorCoords } from "@/components/consultation/MessageBubble";

export interface MessageBatchProps {
  messages: ConsultationMessage[];
  currentUserId: string;
  layout: "standalone" | "panel" | "canvas";
  mode: "live" | "readonly";
  showTimestamp: boolean;
  signedAttachmentUrls: Record<string, string>;
  onRetryFailed?: (localId: string) => void;
  onDiscardFailed?: (localId: string) => void;
  reactions?: ConsultationMessageReaction[];
  onToggleReaction?: (messageId: string, emoji: ReactionEmoji) => void;
  onOpenReactionPicker?: (
    messageId: string,
    anchor: HTMLElement,
    coords?: ReactionPickerAnchorCoords,
  ) => void;
  userNameById?: (userId: string) => string;
  /** text-C2 — tap image thumbnail to open full-screen lightbox. */
  onOpenLightbox?: (messageId: string) => void;
}

function isImageMime(mime: string | null | undefined): boolean {
  return !!mime && mime.startsWith("image/");
}

function bubbleMaxWidthForLayout(layout: MessageBatchProps["layout"]): string {
  return layout === "panel" ? "max-w-[90%]" : layout === "canvas" ? "max-w-[75%]" : "max-w-[80%]";
}

function gridColsClass(count: number, layout: MessageBatchProps["layout"]): string {
  if (layout === "canvas" && count >= 2) return "grid-cols-1";
  if (count >= 5) return "grid-cols-3";
  return "grid-cols-2";
}

/**
 * Renders a multi-attachment batch (text-B8). Caption lives on the first row;
 * reactions / reply / pin (future B4–B7) target that first message id.
 */
export function MessageBatch({
  messages,
  currentUserId,
  layout,
  mode,
  showTimestamp: showTs,
  signedAttachmentUrls,
  onRetryFailed,
  onDiscardFailed,
  reactions = [],
  onToggleReaction,
  onOpenReactionPicker,
  userNameById,
  onOpenLightbox,
}: MessageBatchProps): JSX.Element {
  const head = messages[0];
  const bubbleBodyRef = useRef<HTMLDivElement | null>(null);
  const longPressCoordsRef = useRef<ReactionPickerAnchorCoords | null>(null);

  const openPickerFromAnchor = useCallback(
    (coords?: ReactionPickerAnchorCoords) => {
      if (!onOpenReactionPicker || !bubbleBodyRef.current) return;
      onOpenReactionPicker(head.id, bubbleBodyRef.current, coords);
    },
    [head.id, onOpenReactionPicker],
  );

  const longPressHandlers = useLongPress({
    onLongPress: () => {
      openPickerFromAnchor(longPressCoordsRef.current ?? undefined);
      longPressCoordsRef.current = null;
    },
  });

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
  );  const isSelf = head.senderId === currentUserId;
  const align = isSelf ? "items-end" : "items-start";
  const bubble = isSelf
    ? "bg-blue-600 text-white"
    : "bg-white text-gray-900 border border-gray-200";
  const caption = head.body?.trim() ?? "";
  const anyFailed = messages.some((m) => m.failed);
  const anyPending = messages.some((m) => m.pending);
  const showFailedActions = mode !== "readonly" && anyFailed;
  const deliveryStatus =
    isSelf && mode !== "readonly" ? deriveMessageDeliveryStatus(head) : "none";
  const bubbleMaxWidth = bubbleMaxWidthForLayout(layout);
  const gridClass = gridColsClass(messages.length, layout);
  const aggregatedReactions = aggregateReactions(reactions);
  const reactionEntries = Object.entries(aggregatedReactions).filter(
    ([, users]) => users.length > 0,
  );
  const resolveUserName =
    userNameById ??
    ((userId: string) => (userId === currentUserId ? "You" : "Participant"));

  return (
    <li
      role="listitem"
      className={
        "flex flex-col " +
        align +
        (anyFailed ? " border-l-2 border-red-300 pl-2" : "")
      }
      data-batch="true"
      data-message-id={head.id}
      data-failed={anyFailed ? "true" : undefined}
    >
      {showTs ? (
        <p className="mb-0.5 px-1 text-[11px] text-gray-500">{formatTime(head.createdAt)}</p>
      ) : null}
      <div
        ref={bubbleBodyRef}
        onContextMenu={
          onOpenReactionPicker
            ? (e) => {
                e.preventDefault();
                openPickerFromAnchor();
              }
            : undefined
        }
        onPointerDown={onOpenReactionPicker ? handlePointerDown : undefined}
        onPointerMove={onOpenReactionPicker ? longPressHandlers.onPointerMove : undefined}
        onPointerUp={onOpenReactionPicker ? handlePointerUp : undefined}
        onPointerCancel={onOpenReactionPicker ? handlePointerCancel : undefined}
        onPointerLeave={onOpenReactionPicker ? handlePointerCancel : undefined}        className={
          bubbleMaxWidth +
          " message-body rounded-2xl px-3 py-2 text-sm shadow-sm " +
          bubble +
          (anyPending ? " opacity-70" : "")
        }
      >
        <div className="flex flex-col gap-2">
          {caption ? (
            <p className="whitespace-pre-wrap break-words text-sm">{caption}</p>
          ) : null}
          <div className={"grid gap-1.5 " + gridClass}>
            {messages.map((m) => {
              const signedUrl = signedAttachmentUrls[m.id] ?? null;
              const path = m.attachmentUrl;
              const isImage = isImageMime(m.attachmentMimeType);
              const label = m.body || (isImage ? "Image" : "Attachment");
              return (
                <div key={m.id} className="min-w-0">
                  {isImage && path ? (
                    signedUrl ? (
                      onOpenLightbox ? (
                        <button
                          type="button"
                          onClick={() => onOpenLightbox(m.id)}
                          className="block w-full overflow-hidden rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                          aria-label={`View ${label}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={signedUrl}
                            alt={label}
                            loading="lazy"
                            className="block h-24 w-full rounded-lg bg-gray-100 object-cover"
                          />
                        </button>
                      ) : (
                        <a
                          href={signedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block overflow-hidden rounded-lg"
                          aria-label={`Open ${label} in a new tab`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={signedUrl}
                            alt={label}
                            loading="lazy"
                            className="block h-24 w-full object-cover rounded-lg bg-gray-100"
                          />
                        </a>
                      )
                    ) : (
                      <div
                        className="flex h-24 w-full items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-500"
                        aria-label="Loading image preview"
                      >
                        {m.pending ? "Uploading…" : "Loading…"}
                      </div>
                    )
                  ) : path ? (
                    signedUrl ? (
                      <a
                        href={signedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={
                          "flex h-24 w-full flex-col items-center justify-center rounded-lg text-xs underline " +
                          (isSelf ? "bg-white/10 text-white" : "bg-gray-100 text-blue-700")
                        }
                      >
                        <span aria-hidden className="text-lg">
                          📄
                        </span>
                        <span className="mt-1 truncate px-1">{label}</span>
                      </a>
                    ) : (
                      <div
                        className={
                          "flex h-24 w-full items-center justify-center rounded-lg text-xs " +
                          (isSelf ? "bg-white/10 text-white/85" : "bg-gray-100 text-gray-600")
                        }
                      >
                        {m.pending ? "Uploading…" : "Loading…"}
                      </div>
                    )
                  ) : null}
                </div>
              );
            })}
          </div>
          {isSelf ? (
            <div className="flex justify-end">
              <MessageStatus status={deliveryStatus} />
            </div>
          ) : null}
        </div>
      </div>
      {reactionEntries.length > 0 ? (
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
                  onClick={() => onToggleReaction(head.id, emoji as ReactionEmoji)}
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
        <div className="mt-1 flex items-center gap-2 text-xs text-red-700">
          <span>Failed to send</span>
          <button
            type="button"
            onClick={() => onRetryFailed?.(head.id)}
            className="underline hover:text-red-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => onDiscardFailed?.(head.id)}
            className="underline hover:text-red-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
          >
            Discard
          </button>
        </div>
      ) : null}
    </li>
  );
}
