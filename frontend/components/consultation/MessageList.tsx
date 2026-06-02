"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type MutableRefObject,
} from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import {
  MessageBubble,
  type ReactionPickerAnchorCoords,
} from "@/components/consultation/MessageBubble";
import { MessageBatch } from "@/components/consultation/MessageBatch";
import {
  findMessageRowIndex,
  shouldVirtualizeMessageList,
  type MessageRow,
} from "@/lib/text/build-message-rows";
import type { ConsultationMessageReaction, ReactionEmoji } from "@/lib/text/aggregate-reactions";
import type { ConsultationMessage } from "@/lib/text/types";

function isAtBottom(el: HTMLElement | null, slack = 80): boolean {
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < slack;
}

function applyMessageHighlight(container: HTMLElement | null, messageId: string): void {
  const el = container?.querySelector(`[data-message-id="${messageId}"]`);
  if (!el || !(el instanceof HTMLElement)) return;
  el.classList.add("ring-2", "ring-blue-400", "rounded-lg");
  window.setTimeout(() => {
    el.classList.remove("ring-2", "ring-blue-400", "rounded-lg");
  }, 200);
}

export interface MessageListProps {
  rows: MessageRow[];
  layout: "standalone" | "panel" | "canvas";
  mode: "live" | "readonly";
  currentUserId: string;
  currentUserRole: "doctor" | "patient";
  signedAttachmentUrls: Record<string, string>;
  reactionsByMessageId: Record<string, ConsultationMessageReaction[]>;
  userNameById: (userId: string) => string;
  counterpartyName?: string;
  editingMessageId: string | null;
  editSaving: boolean;
  pinCapReached: boolean;
  lookupMessageById: (id: string) => ConsultationMessage | null;
  getSenderDisplayName: (message: ConsultationMessage) => string;
  onScrollChange: (atBottom: boolean) => void;
  scrollToMessageRef: MutableRefObject<
    ((id: string, opts?: { highlight?: boolean }) => void) | null
  >;
  scrollToBottomRef: MutableRefObject<((behavior?: ScrollBehavior) => void) | null>;
  onStartReply?: (message: ConsultationMessage) => void;
  onRetryFailed?: (localId: string) => void;
  onDiscardFailed?: (localId: string) => void;
  onStartEdit?: (message: ConsultationMessage) => void;
  onSaveEdit?: (messageId: string, body: string) => void;
  onCancelEdit?: () => void;
  onSoftDelete?: (message: ConsultationMessage) => void;
  onTogglePin?: (messageId: string) => void;
  onToggleReaction?: (messageId: string, emoji: ReactionEmoji) => void;
  onOpenReactionPicker?: (
    messageId: string,
    anchor: HTMLElement,
    coords?: ReactionPickerAnchorCoords,
  ) => void;
  onOpenLightbox?: (messageId: string) => void;
}

function DaySeparator({
  label,
  asListItem = false,
}: {
  label: string;
  asListItem?: boolean;
}): JSX.Element {
  const className = "text-center text-xs text-gray-500 my-3 select-none";
  if (asListItem) {
    return (
      <li className={`list-none ${className}`} role="separator" aria-label={label}>
        {label}
      </li>
    );
  }
  return (
    <div className={className} role="separator" aria-label={label}>
      {label}
    </div>
  );
}

export function MessageList({
  rows,
    layout,
    mode,
    currentUserId,
    currentUserRole,
    signedAttachmentUrls,
    reactionsByMessageId,
    userNameById,
    counterpartyName,
    editingMessageId,
    editSaving,
    pinCapReached,
    lookupMessageById,
    getSenderDisplayName,
    onScrollChange,
    scrollToMessageRef,
    scrollToBottomRef,
    onStartReply,
    onRetryFailed,
    onDiscardFailed,
    onStartEdit,
    onSaveEdit,
    onCancelEdit,
    onSoftDelete,
    onTogglePin,
    onToggleReaction,
    onOpenReactionPicker,
    onOpenLightbox,
}: MessageListProps): JSX.Element {
  const listRef = useRef<HTMLDivElement | null>(null);
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const virtualize = shouldVirtualizeMessageList(rows);

  const scrollToMessage = useCallback(
    (id: string, opts?: { highlight?: boolean }) => {
      const index = findMessageRowIndex(rows, id);
      if (index < 0) return;

      if (virtualize) {
        virtuosoRef.current?.scrollToIndex({
          index,
          align: opts?.highlight ? "center" : "start",
          behavior: "smooth",
        });
        if (opts?.highlight) {
          window.setTimeout(() => {
            applyMessageHighlight(listRef.current, id);
          }, 300);
        }
        return;
      }

      const el = listRef.current?.querySelector(`[data-message-id="${id}"]`);
      if (!el || !(el instanceof HTMLElement)) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      if (opts?.highlight) {
        applyMessageHighlight(listRef.current, id);
      }
    },
    [rows, virtualize],
  );

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = "auto") => {
      if (virtualize) {
        if (rows.length === 0) return;
        virtuosoRef.current?.scrollToIndex({
          index: rows.length - 1,
          align: "end",
          behavior: behavior === "smooth" ? "smooth" : "auto",
        });
        return;
      }
      const el = listRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior });
    },
    [rows.length, virtualize],
  );

  useEffect(() => {
    scrollToMessageRef.current = scrollToMessage;
    return () => {
      scrollToMessageRef.current = null;
    };
  }, [scrollToMessage, scrollToMessageRef]);

  useEffect(() => {
    scrollToBottomRef.current = scrollToBottom;
    return () => {
      scrollToBottomRef.current = null;
    };
  }, [scrollToBottom, scrollToBottomRef]);

  useEffect(() => {
    if (virtualize) return;
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      onScrollChange(isAtBottom(el));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScrollChange(isAtBottom(el));
    return () => el.removeEventListener("scroll", onScroll);
  }, [onScrollChange, virtualize]);

  const renderRow = useCallback(
    (row: MessageRow, opts?: { asListItemSeparator?: boolean }) => {
      if (row.__type === "separator") {
        return (
          <DaySeparator key={row.key} label={row.label} asListItem={opts?.asListItemSeparator} />
        );
      }

      if (row.__type === "batch") {
        return (
          <MessageBatch
            key={row.key}
            messages={row.messages}
            currentUserId={currentUserId}
            layout={layout}
            mode={mode}
            showTimestamp={row.showTimestamp}
            signedAttachmentUrls={signedAttachmentUrls}
            onRetryFailed={onRetryFailed}
            onDiscardFailed={onDiscardFailed}
            reactions={reactionsByMessageId[row.messages[0].id] ?? []}
            userNameById={userNameById}
            onToggleReaction={onToggleReaction}
            onOpenReactionPicker={onOpenReactionPicker}
            onOpenLightbox={onOpenLightbox}
          />
        );
      }

      const message = row.message;
      return (
        <MessageBubble
          key={row.key}
          message={message}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          layout={layout}
          mode={mode}
          showTimestamp={row.showTimestamp}
          signedAttachmentUrl={signedAttachmentUrls[message.id] ?? null}
          lookupMessageById={lookupMessageById}
          getSenderDisplayName={getSenderDisplayName}
          onScrollToMessage={scrollToMessage}
          onStartReply={onStartReply}
          onRetryFailed={onRetryFailed}
          onDiscardFailed={onDiscardFailed}
          reactions={reactionsByMessageId[message.id] ?? []}
          userNameById={userNameById}
          counterpartyName={counterpartyName}
          isEditing={editingMessageId === message.id}
          editSaving={editSaving}
          onStartEdit={onStartEdit}
          onSaveEdit={onSaveEdit}
          onCancelEdit={onCancelEdit}
          onSoftDelete={onSoftDelete}
          onTogglePin={onTogglePin}
          pinCapReached={pinCapReached}
          onToggleReaction={onToggleReaction}
          onOpenReactionPicker={onOpenReactionPicker}
          onOpenLightbox={onOpenLightbox}
        />
      );
    },
    [
      counterpartyName,
      currentUserId,
      currentUserRole,
      editSaving,
      editingMessageId,
      getSenderDisplayName,
      layout,
      lookupMessageById,
      mode,
      onCancelEdit,
      onDiscardFailed,
      onOpenLightbox,
      onOpenReactionPicker,
      onRetryFailed,
      onSaveEdit,
      onSoftDelete,
      onStartEdit,
      onStartReply,
      onTogglePin,
      onToggleReaction,
      pinCapReached,
      reactionsByMessageId,
      scrollToMessage,
      signedAttachmentUrls,
      userNameById,
    ],
  );

  const listClassName = "min-h-0 flex-1 overflow-y-auto bg-gray-50 px-3 py-3";

  if (rows.length === 0) {
    return (
      <div ref={listRef} className={listClassName} role="log" aria-live="polite" aria-relevant="additions">
        <div className="flex h-full items-center justify-center text-center text-sm text-gray-500">
          Say hello to start the consult.
        </div>
      </div>
    );
  }

  if (virtualize) {
    return (
      <div ref={listRef} className="min-h-0 flex-1 bg-gray-50" role="log" aria-live="polite" aria-relevant="additions">
        <Virtuoso
          ref={virtuosoRef}
          data={rows}
          className={listClassName}
          style={{ height: "100%" }}
          initialTopMostItemIndex={rows.length - 1}
          followOutput="smooth"
          atBottomStateChange={onScrollChange}
          // T4 future: wire archive "load more" to startReached here.
          itemContent={(_index, row) => (
            <div className="pb-2">{renderRow(row)}</div>
          )}
          components={{
            Footer: () => <div style={{ height: 8 }} />,
          }}
        />
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className={listClassName}
      role="log"
      aria-live="polite"
      aria-relevant="additions"
    >
      <ul className="space-y-2">
        {rows.map((row) => renderRow(row, { asListItemSeparator: true }))}
      </ul>
    </div>
  );
}
