import type { VideoLayout } from "@/components/consultation/VideoLayoutSwitcher";

/**
 * Any patient surface (phone or laptop). Gates the compact icon
 * dock and hides doctor-only kitchen-sink controls.
 */
export function isPatientChrome(opts: {
  role?: "doctor" | "patient";
}): boolean {
  return opts.role === "patient";
}

export function isPatientMobileChrome(opts: {
  role?: "doctor" | "patient";
  isDesktop: boolean;
}): boolean {
  return isPatientChrome(opts) && !opts.isDesktop;
}

export function isPatientDesktopChrome(opts: {
  role?: "doctor" | "patient";
  isDesktop: boolean;
}): boolean {
  return isPatientChrome(opts) && opts.isDesktop;
}

/**
 * Dock unread badge: count only inbound the user cannot already see.
 * Open side panel / expanded phone sheet / Chat tab = already read.
 */
export function shouldCountChatUnread(opts: {
  role?: "doctor" | "patient";
  isDesktop: boolean;
  isCockpit: boolean;
  patientChatExpanded: boolean;
  patientDesktopChatOpen: boolean;
  cockpitChatOpen: boolean;
  activeTab: "video" | "chat";
}): boolean {
  if (isPatientMobileChrome(opts)) return !opts.patientChatExpanded;
  if (isPatientDesktopChrome(opts)) return !opts.patientDesktopChatOpen;
  if (opts.isCockpit) return !opts.cockpitChatOpen;
  return opts.activeTab !== "chat";
}

export interface ChatUnreadRow {
  id: string;
  kind: string;
  senderId: string;
  createdAt: string;
  pending?: boolean;
}

function isoMs(value: string): number {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Compare message timestamps by millisecond, not ISO string.
 * Optimistic rows use `...Z`; DB rows often come back as `...+00:00`.
 * Lexicographic `<=` treats those as different instants.
 */
export function isAtOrBeforeCursor(createdAt: string, cursor: string): boolean {
  return isoMs(createdAt) <= isoMs(cursor);
}

/** Presence went from empty to "someone else is here" — replay our cursor. */
export function peerJustJoined(
  wasPresent: boolean,
  isPresent: boolean
): boolean {
  return isPresent && !wasPresent;
}

/**
 * Dock badge from the merged thread — not from Realtime delivery
 * events. Duplicate INSERTs and catch-up SELECTs of the same id
 * stay +1. History at or before `readAt` does not count.
 */
export function countUnreadInbound(
  messages: ReadonlyArray<ChatUnreadRow>,
  opts: { selfId: string; readAt: string }
): number {
  const seen = new Set<string>();
  let n = 0;
  const readMs = isoMs(opts.readAt);
  for (const msg of messages) {
    if (!msg.id || seen.has(msg.id)) continue;
    if (msg.pending || msg.kind === "system") continue;
    if (!opts.selfId || msg.senderId === opts.selfId) continue;
    if (isoMs(msg.createdAt) <= readMs) continue;
    seen.add(msg.id);
    n += 1;
  }
  return n;
}

/** Oldest inbound row the user has not seen — open the thread here. */
export function firstUnreadInboundId(
  messages: ReadonlyArray<ChatUnreadRow>,
  opts: { selfId: string; readAt: string }
): string | null {
  const readMs = isoMs(opts.readAt);
  for (const msg of messages) {
    if (!msg.id || msg.pending || msg.kind === "system") continue;
    if (!opts.selfId || msg.senderId === opts.selfId) continue;
    if (isoMs(msg.createdAt) <= readMs) continue;
    return msg.id;
  }
  return null;
}

/** Scroll before paint, then once more after the next frame. */
export function runOpenChatScroll(run: () => void): () => void {
  run();
  if (typeof requestAnimationFrame !== "function") {
    return () => undefined;
  }
  const raf = requestAnimationFrame(run);
  return () => cancelAnimationFrame(raf);
}

/**
 * Move the read cursor forward through every acked row.
 *
 * Deliberately never consults the local clock, and skips pending rows
 * (their `createdAt` is the local clock until the server ack swaps in
 * the real timestamp). A device clock running seconds ahead of the
 * server put the watermark in the future, so the next inbound message
 * was born "already read" — no badge, no unread divider.
 */
export function advanceChatReadWatermark(
  messages: ReadonlyArray<Pick<ChatUnreadRow, "createdAt" | "pending">>,
  prev: string
): string {
  let watermark = prev;
  let watermarkMs = isoMs(prev);
  for (const msg of messages) {
    if (msg.pending) continue;
    const ms = isoMs(msg.createdAt);
    if (ms > watermarkMs) {
      watermark = msg.createdAt;
      watermarkMs = ms;
    }
  }
  return watermark;
}

/**
 * Patient phones get Speaker (one big tile) and Gallery (stacked top /
 * bottom), switched from the stage chip. Sidebar's 70/30 split is
 * unusable at phone width, so it always degrades to Speaker. Other
 * surfaces keep the original rule: Sidebar only degrades in portrait.
 */
export function effectiveCallLayout(
  layout: VideoLayout,
  opts: {
    role?: "doctor" | "patient";
    isDesktop: boolean;
    orient: "portrait" | "landscape";
  }
): VideoLayout {
  if (isPatientMobileChrome(opts)) {
    return layout === "sidebar" ? "speaker" : layout;
  }
  if (layout === "sidebar" && !opts.isDesktop && opts.orient === "portrait") {
    return "speaker";
  }
  return layout;
}

/** The two layouts the patient stage chip toggles between. */
export function nextPatientStageLayout(layout: VideoLayout): VideoLayout {
  return layout === "speaker" ? "gallery" : "speaker";
}

/**
 * A phone in portrait against a laptop's 16:9 feed letterboxes roughly
 * 40% of the stage. Crop-fill by default and let the stage chip switch
 * back to Fit — cropping can hide something the doctor is holding up at
 * the edge of frame, so the escape hatch has to stay reachable.
 */
export function defaultTileObjectFit(opts: {
  role?: "doctor" | "patient";
  isDesktop: boolean;
}): "cover" | "contain" {
  return isPatientMobileChrome(opts) ? "cover" : "contain";
}

/**
 * Patient chat sheet snaps (vaul). Drag: full ← half → closed.
 * The dock Chat button is binary: closed (`0px`) ↔ half (`0.5`).
 * Full (`1`) covers the stage. Keyboard uses visualViewport height
 * so the composer sits on the keys, not at 100dvh behind them.
 */
export const PATIENT_CHAT_SNAP_PEEK = "0px";
export const PATIENT_CHAT_SNAP_HALF = 0.5;
export const PATIENT_CHAT_SNAP_FULL = 1;
export const PATIENT_CHAT_SNAPS: (number | string)[] = [
  PATIENT_CHAT_SNAP_PEEK,
  PATIENT_CHAT_SNAP_HALF,
  PATIENT_CHAT_SNAP_FULL,
];

export function isPatientChatExpanded(
  snap: number | string | null | undefined
): boolean {
  if (snap == null || snap === PATIENT_CHAT_SNAP_PEEK) return false;
  if (typeof snap === "number") {
    return snap >= PATIENT_CHAT_SNAP_HALF - 0.01;
  }
  // Remaining strings are px pins ("0px" peek already returned above).
  return false;
}

/** Dock Chat button: open to half, or collapse an open sheet to peek. */
export function togglePatientChatSnap(
  snap: number | string | null | undefined
): number | string {
  return isPatientChatExpanded(snap)
    ? PATIENT_CHAT_SNAP_PEEK
    : PATIENT_CHAT_SNAP_HALF;
}

/**
 * CSS `bottom` for the overlay dock. Empty string hides it — when
 * chat is open, mute/camera/leave sit on the video half instead.
 */
export function patientDockBottom(
  snap: number | string | null | undefined
): string {
  if (isPatientChatExpanded(snap)) return "";
  return "calc(0.5rem + env(safe-area-inset-bottom, 0px))";
}

/**
 * How much of the viewport the chat sheet covers (0 = closed).
 * Pixel snaps other than peek are treated as closed.
 */
export function patientChatCoverFraction(
  snap: number | string | null | undefined
): number {
  if (snap == null || snap === PATIENT_CHAT_SNAP_PEEK) return 0;
  if (typeof snap === "number") {
    return Math.min(1, Math.max(0, snap));
  }
  return 0;
}

/**
 * Explicit height for the video stage so it shrinks instead of
 * sitting full-bleed under the sheet. Empty string = flex-1 fill.
 */
export function patientStageHeightCss(coverFraction: number): string {
  if (coverFraction <= 0.01) return "";
  const pct = Math.max(0, Math.round((1 - coverFraction) * 1000) / 10);
  return `calc(${pct}dvh)`;
}

/**
 * Visible column inside the vaul sheet. The drawer itself is `h-full`
 * and only the top slice is on screen — the composer must live in
 * that slice, not at the bottom of the 100dvh box.
 */
export function patientSheetColumnHeightCss(coverFraction: number): string {
  if (coverFraction <= 0.01) return "0px";
  const pct = Math.max(0, Math.round(coverFraction * 1000) / 10);
  return `${pct}%`;
}

/**
 * Stacked tiles follow the stage's long axis: tall box → rows,
 * roughly square / wide → columns. 0.7 catches a 50/50 phone split
 * (~390×420) without flipping a closed portrait stage (~390×844).
 */
export const PATIENT_SPLIT_WIDE_RATIO = 0.7;

export function patientSplitAxis(
  width: number,
  height: number
): "rows" | "cols" {
  if (width <= 0 || height <= 0) return "rows";
  return width / height >= PATIENT_SPLIT_WIDE_RATIO ? "cols" : "rows";
}

/**
 * Where the Fit / Fill / Zoom / Rotate pill sits so it misses the
 * caller card (top-left), stage chips (right rail), and the dock.
 *
 *   Speaker          → vertical on the left (self PiP lives bottom-right)
 *   Stacked rows     → on the splitter (top tile bottom, bottom tile top)
 *   Side-by-side     → vertical on the inner seam; hide zoom (tiles are
 *                      too short for a 7-icon column — pinch still works)
 */
export type PatientInspectPlacement =
  | "top-center"
  | "bottom-center"
  | "start"
  | "end";

export interface PatientInspectChrome {
  placement: PatientInspectPlacement;
  clearDock: boolean;
  hideZoom: boolean;
}

export function patientInspectChrome(opts: {
  layout: VideoLayout;
  split: "rows" | "cols";
  tile: "remote" | "self";
  selfOnStart: boolean;
}): PatientInspectChrome {
  if (opts.layout === "speaker") {
    return { placement: "start", clearDock: false, hideZoom: false };
  }
  const tileOnStart =
    opts.tile === "self" ? opts.selfOnStart : !opts.selfOnStart;
  if (opts.split === "rows") {
    return {
      placement: tileOnStart ? "bottom-center" : "top-center",
      clearDock: false,
      hideZoom: false,
    };
  }
  return {
    placement: tileOnStart ? "end" : "start",
    clearDock: false,
    hideZoom: true,
  };
}

/**
 * Short, clinically-safe canned replies for the patient phone
 * composer. Kept here so VideoRoom and tests share one list.
 */
export const PATIENT_CHAT_QUICK_REPLIES = [
  "Yes",
  "No",
  "OK",
  "One moment",
  "Thank you",
  "I can hear you",
  "I cannot hear you",
  "Please repeat",
  "Just a second",
] as const;

/** visualViewport shrink vs window height — soft keyboard heuristic. */
export function isSoftKeyboardOpen(
  viewportHeight: number,
  windowHeight: number,
  thresholdPx = 120,
  offsetTop = 0
): boolean {
  return (
    windowHeight - viewportHeight - offsetTop > thresholdPx || offsetTop > 40
  );
}

export interface PatientKeyboardViewportBox {
  top: number;
  height: number;
}

/**
 * Where the sheet must sit while the keyboard is open: the visual
 * viewport box, including offsetTop after the browser pans to the
 * focused field. Using height alone and leaving the column at y=0
 * leaves a white gap above the keys.
 */
export function patientKeyboardViewportBox(
  viewport: { height: number; offsetTop: number },
  windowHeight: number
): PatientKeyboardViewportBox | null {
  if (
    !isSoftKeyboardOpen(viewport.height, windowHeight, 120, viewport.offsetTop)
  ) {
    return null;
  }
  return {
    top: Math.max(0, Math.round(viewport.offsetTop)),
    height: Math.max(0, Math.round(viewport.height)),
  };
}

/**
 * Patient-phone fullscreen. Targets `documentElement` so portaled
 * UI (chat sheet) still paints. Chrome's origin toast cannot be
 * suppressed — fire this from a Join tap so it lands during connect.
 * Rejected gestures (iOS Safari, consumed click) stay windowed.
 */
export function requestDocumentFullscreen(): void {
  if (typeof document === "undefined") return;
  if (document.fullscreenElement) return;
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  const req =
    el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
  if (!req) return;
  try {
    void Promise.resolve(req({ navigationUI: "hide" })).catch(() => {
      void Promise.resolve(req()).catch(() => undefined);
    });
  } catch {
    try {
      void Promise.resolve(req()).catch(() => undefined);
    } catch {
      // Safari can throw synchronously when the gesture is gone.
    }
  }
}

export function exitDocumentFullscreen(): void {
  if (typeof document === "undefined") return;
  if (!document.fullscreenElement) return;
  const doc = document as Document & {
    webkitExitFullscreen?: () => Promise<void> | void;
  };
  const exit =
    doc.exitFullscreen?.bind(doc) ?? doc.webkitExitFullscreen?.bind(doc);
  if (!exit) return;
  try {
    void Promise.resolve(exit()).catch(() => undefined);
  } catch {
    // ignore
  }
}

export function toggleDocumentFullscreen(): void {
  if (typeof document === "undefined") return;
  if (document.fullscreenElement) {
    exitDocumentFullscreen();
    return;
  }
  requestDocumentFullscreen();
}

/** Join-page gesture — skip tablets / desktop so the URL bar stays. */
export function requestPatientPhoneFullscreen(): void {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return;
  }
  if (window.matchMedia("(min-width: 768px)").matches) return;
  requestDocumentFullscreen();
}

/** Pin a fixed sheet to the visual viewport. No transitions — follow the keys. */
export function applyPatientKeyboardSheetPin(
  style: Pick<CSSStyleDeclaration, "setProperty" | "removeProperty">,
  box: PatientKeyboardViewportBox | null
): void {
  if (!box) {
    for (const prop of [
      "top",
      "height",
      "bottom",
      "left",
      "right",
      "width",
      "transform",
      "transition",
    ]) {
      style.removeProperty(prop);
    }
    return;
  }
  style.setProperty("transition", "none", "important");
  style.setProperty("transform", "none", "important");
  style.setProperty("top", `${box.top}px`);
  style.setProperty("height", `${box.height}px`);
  style.setProperty("bottom", "auto");
  style.setProperty("left", "0px");
  style.setProperty("right", "0px");
  style.setProperty("width", "100%");
}
