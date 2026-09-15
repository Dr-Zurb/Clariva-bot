/**
 * When in-call chat opens inside Consult, we borrow the cockpit Focus
 * session (wide → full escalate) and raise Consult's splitter `minSizePx`
 * so neighbours cannot crush video + chat.
 *
 * Thumbnail width sits beside the stage floor so a live Consult column can
 * dock ~220px without remounting the portaled room.
 */

import type { PaneTreeNode } from "@/lib/patient-profile/v3/foundation";

/** Video stage floor inside Consult while chat is open. */
export const MIN_VIDEO_STAGE_WITH_CHAT_PX = 280;

/** Docked Consult column when the doctor is writing in a clinical pane. */
export const CONSULT_THUMBNAIL_WIDTH_PX = 220;

/** Consult preset / restored stage column share (root %). */
export const CONSULT_STAGE_SIZE_PCT = 26;

/** Thumbnail column share (root %) — ~220px on a ~1200px canvas. */
export const CONSULT_THUMBNAIL_SIZE_PCT = 18;

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
  return withConsultBodyMinSize(panes, { chatOpen, thumbnail: false });
}

/**
 * Consult splitter floor: chat (544) wins over thumbnail (220) over the
 * pane's declared stage min.
 */
export function withConsultBodyMinSize<
  T extends { id: string; minSizePx?: number },
>(
  panes: readonly T[],
  options: { chatOpen: boolean; thumbnail: boolean },
): T[] {
  return panes.map((pane) => {
    if (pane.id !== "body") return pane;
    if (options.chatOpen) {
      return {
        ...pane,
        minSizePx: Math.max(
          pane.minSizePx ?? 0,
          MIN_CONSULT_WIDTH_FOR_SIDE_CHAT_PX,
        ),
      };
    }
    if (options.thumbnail) {
      return { ...pane, minSizePx: CONSULT_THUMBNAIL_WIDTH_PX };
    }
    return pane;
  });
}

/**
 * Rebalance root columns so `body` takes `bodySizePct` and Plan absorbs the
 * delta. Returns null when Consult is not a root column beside Plan (doctor
 * rearranged, or walk-in) — callers must not invent a layout.
 */
export function resizeConsultBodyColumn(
  root: PaneTreeNode,
  bodySizePct: number,
): Record<string, number> | null {
  const children = root.children;
  if (root.id !== "__root__" || !children?.length) return null;
  const bodyIndex = children.findIndex(
    (child) =>
      !child.hidden &&
      (child.id === "body" || Boolean(child.paneIds?.includes("body"))),
  );
  const planIndex = children.findIndex(
    (child) =>
      !child.hidden &&
      (child.id === "plan" || Boolean(child.paneIds?.includes("plan"))),
  );
  if (bodyIndex < 0 || planIndex < 0 || bodyIndex === planIndex) return null;
  const next = children.map((child) => child.sizePct);
  const delta = next[bodyIndex]! - bodySizePct;
  next[bodyIndex] = bodySizePct;
  next[planIndex] = next[planIndex]! + delta;
  const sizes: Record<string, number> = {};
  children.forEach((child, index) => {
    sizes[child.id] = next[index]!;
  });
  return sizes;
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
