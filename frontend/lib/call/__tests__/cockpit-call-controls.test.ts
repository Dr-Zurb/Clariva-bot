import { describe, it, expect } from "vitest";
import {
  COCKPIT_CTRL_LEAVE,
  COCKPIT_LAYOUT_VERTICAL_MAX_PX,
  cockpitHoldClass,
  cockpitLayoutSwitcherVertical,
  cockpitToggleClass,
  legacyToggleClass,
} from "../cockpit-call-controls";

describe("cockpit-call-controls", () => {
  it("uses muted tokens for active toggles (not amber)", () => {
    expect(cockpitToggleClass(true)).toMatch(/bg-muted/);
    expect(cockpitToggleClass(true)).not.toMatch(/amber/);
    expect(cockpitToggleClass(false)).toMatch(/border-border/);
  });

  it("keeps soft leave (outline destructive, not solid red fill)", () => {
    expect(COCKPIT_CTRL_LEAVE).toMatch(/text-destructive/);
    expect(COCKPIT_CTRL_LEAVE).not.toMatch(/bg-red-600/);
  });

  it("uses primary tint for resume, quiet outline for hold idle", () => {
    expect(cockpitHoldClass(true)).toMatch(/bg-primary\/10/);
    expect(cockpitHoldClass(false)).toMatch(/border-border/);
  });

  it("preserves legacy amber active for join-page controls", () => {
    expect(legacyToggleClass(true)).toMatch(/amber/);
  });

  it("stands the layout switcher up when the consult pane is narrow", () => {
    expect(cockpitLayoutSwitcherVertical(0)).toBe(false);
    expect(cockpitLayoutSwitcherVertical(COCKPIT_LAYOUT_VERTICAL_MAX_PX)).toBe(
      false
    );
    expect(cockpitLayoutSwitcherVertical(COCKPIT_LAYOUT_VERTICAL_MAX_PX - 1)).toBe(
      true
    );
  });
});
