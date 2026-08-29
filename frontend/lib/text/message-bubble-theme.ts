/**
 * Chat bubble palette — single source for MessageBubble, MessageBatch,
 * QuotedParentPreview, EditableMessageBubble and MessageStatus.
 *
 * Own bubbles are a light blue tint rather than solid blue so the read
 * tick (brand blue) reads as a distinct state instead of blue-on-blue.
 */

export const MESSAGE_SELF_BUBBLE =
  "rounded-2xl rounded-tr-md border border-blue-200 bg-blue-50 text-slate-900";

export const MESSAGE_OTHER_BUBBLE =
  "rounded-2xl rounded-tl-md bg-gray-100 text-gray-900";

export function messageBubbleClass(isSelf: boolean): string {
  return isSelf ? MESSAGE_SELF_BUBBLE : MESSAGE_OTHER_BUBBLE;
}

/** Sent / delivered ticks — deliberately quiet next to the read state. */
export const MESSAGE_TICK_CLASS = "text-gray-400";

/** Read receipt. Brand blue, saturated enough to pop off `bg-blue-50`. */
export const MESSAGE_READ_TICK_CLASS = "text-blue-600";

/** Timestamp + "edited" line inside a bubble. */
export const MESSAGE_META_CLASS = "text-gray-500";

/** Captions, counters, "Uploading…" — secondary text inside a bubble. */
export const MESSAGE_BUBBLE_MUTED = "text-gray-500";

/** Pinned marker above the body. */
export const MESSAGE_BUBBLE_FAINT = "text-gray-400";

/** Attachment links inside a bubble. */
export const MESSAGE_BUBBLE_LINK = "text-blue-700";

/** Attachment tile behind a document icon. */
export function messageAttachmentTileClass(isSelf: boolean): string {
  return isSelf ? "bg-white" : "bg-gray-100";
}

/** Quoted parent strip above a reply. */
export function messageQuoteClass(variant: "self" | "other"): string {
  return variant === "self"
    ? "border-blue-400 bg-white/70 text-gray-700"
    : "border-blue-500 bg-blue-50/80 text-gray-700";
}
