/**
 * When in-call chat opens inside Consult, we borrow the cockpit Focus
 * session (wide → full escalate) and raise Consult's splitter `minSizePx`
 * so Subjective (or any neighbour) cannot crush video + chat.
 */

/** Video stage floor inside Consult while chat is open. */
export const MIN_VIDEO_STAGE_WITH_CHAT_PX = 280;

/** In-call chat column floor while open. */
export const MIN_CHAT_COLUMN_PX = 240;

/**
 * Consult pane splitter floor while chat is open (video + chat + gutter).
 * Applied as `body.minSizePx` so react-resizable-panels cannot drag below it.
 */
export const MIN_CONSULT_WIDTH_FOR_SIDE_CHAT_PX =
  MIN_VIDEO_STAGE_WITH_CHAT_PX + MIN_CHAT_COLUMN_PX + 24;

/** Apply chat-open floor to the Consult (`body`) pane definition. */
export function withConsultChatMinSize<
  T extends { id: string; minSizePx?: number },
>(panes: readonly T[], chatOpen: boolean): T[] {
  if (!chatOpen) return panes as T[];
  return panes.map((pane) => {
    if (pane.id !== "body") return pane;
    return {
      ...pane,
      minSizePx: Math.max(pane.minSizePx ?? 0, MIN_CONSULT_WIDTH_FOR_SIDE_CHAT_PX),
    };
  });
}

/** Prefer Consult at ⅔ when chat opens. */
export const CHAT_OPEN_FOCUS_RATIO = "wide" as const;

/**
 * True when Consult is already giving chat enough room (full or wide
 * focus on body) — we should not take Focus ownership just to restore later.
 */
export function consultAlreadyRoomyForChat(options: {
  isFocused: boolean;
  focusedLeafId: string | null | undefined;
  ratio: string | null | undefined;
}): boolean {
  if (!options.isFocused) return false;
  const onBody =
    options.focusedLeafId === "body" ||
    Boolean(options.focusedLeafId?.includes("body"));
  if (!onBody) return false;
  return options.ratio === "full" || options.ratio === "wide";
}

/** Escalate to Full when side-by-side is still too tight after Wide. */
export function shouldEscalateConsultToFull(widthPx: number): boolean {
  if (!Number.isFinite(widthPx) || widthPx <= 0) return false;
  return widthPx < MIN_CONSULT_WIDTH_FOR_SIDE_CHAT_PX;
}
