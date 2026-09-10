/**
 * Cockpit Consult call chrome — light stage + dock + icon-first clusters
 * (Meet/Zoom density). Matches SOAP / Assessment panes (card + border
 * tokens) so the Consult column doesn't invert to a black stage.
 */

import { cn } from "@/lib/utils";

/** Outer call-stage column (header + tiles + dock). */
export const COCKPIT_STAGE_SHELL = "bg-card text-foreground";

/** CallStageHeader strip above the tiles. */
export const COCKPIT_STAGE_HEADER =
  "flex shrink-0 items-center gap-2 border-b border-border bg-card px-2.5 py-1.5 text-foreground";

/** Quiet ghost control on the light stage header. */
export const COCKPIT_STAGE_HEADER_BTN =
  "inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Shared footprint for icon-only cockpit controls on the light dock. */
const ICON_BTN =
  "inline-flex h-9 w-9 items-center justify-center rounded-full shadow-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Idle / default toggle — ghost on light. */
export const COCKPIT_CTRL = cn(
  ICON_BTN,
  "bg-transparent text-foreground hover:bg-accent",
);

/** Pressed / off-default (mute, camera off) — solid attention fill. */
export const COCKPIT_CTRL_ACTIVE = cn(
  ICON_BTN,
  "bg-red-500 text-white hover:bg-red-500/90",
);

/** Non-destructive selected state (e.g. in-call chat open). */
export const COCKPIT_CTRL_SELECTED = cn(
  ICON_BTN,
  "bg-accent text-foreground hover:bg-accent/80",
);

/** Positive resume CTA while on hold. */
export const COCKPIT_CTRL_RESUME = cn(
  ICON_BTN,
  "bg-emerald-500 text-white hover:bg-emerald-500/90",
);

/** Network / utility pill beside toggles (widens when caption is shown). */
export const COCKPIT_CTRL_PILL =
  "flex h-9 items-center justify-center rounded-full bg-transparent px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground";

/** Destructive Leave — solid red hang-up. */
export const COCKPIT_CTRL_LEAVE = cn(
  ICON_BTN,
  "bg-red-600 text-white hover:bg-red-600/90",
);

/** Overflow "More" trigger. */
export const COCKPIT_CTRL_MORE = cn(
  ICON_BTN,
  "bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
);

/** Full-width light dock under the video stage — 3 columns keep media centered. */
export const COCKPIT_CTRL_DOCK =
  "relative z-10 grid w-full shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-t border-border bg-card px-3 py-2.5 text-foreground";

/** Cluster wrappers inside the dock. */
export const COCKPIT_CTRL_CLUSTER = "flex items-center gap-1";
export const COCKPIT_CTRL_CLUSTER_START = "flex items-center justify-self-start gap-1";
export const COCKPIT_CTRL_CLUSTER_CENTER = "flex items-center justify-self-center gap-1.5";
export const COCKPIT_CTRL_CLUSTER_END = "flex items-center justify-self-end gap-1";

export function cockpitToggleClass(active: boolean): string {
  return active ? COCKPIT_CTRL_ACTIVE : COCKPIT_CTRL;
}

export function cockpitHoldClass(onHold: boolean): string {
  return onHold ? COCKPIT_CTRL_RESUME : COCKPIT_CTRL;
}

/**
 * Consult-pane width below this → layout switcher becomes a vertical
 * rail on the stage so the dock does not cramp.
 */
export const COCKPIT_LAYOUT_VERTICAL_MAX_PX = 460;

export function cockpitLayoutSwitcherVertical(width: number): boolean {
  return width > 0 && width < COCKPIT_LAYOUT_VERTICAL_MAX_PX;
}

/** Legacy join-page classes (unchanged telephony look). */
export function legacyToggleClass(active: boolean): string {
  return cn(
    "rounded-md px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2",
    active
      ? "bg-amber-100 text-amber-900 ring-1 ring-amber-300 focus:ring-amber-400"
      : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:ring-gray-300",
  );
}

export function legacyHoldClass(onHold: boolean): string {
  return cn(
    "rounded-md px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2",
    onHold
      ? "bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500"
      : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:ring-gray-300",
  );
}

export const LEGACY_CTRL_LEAVE =
  "rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2";
