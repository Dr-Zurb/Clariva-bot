/**
 * useShellHotkeys — unit tests (Vitest + renderHook).
 *
 * Covers the acceptance criteria from ppr-10 and ppr-15d:
 *
 * ppr-10 (carried over):
 *   - `[`/`]` are no-ops when any modifier key is held.
 *   - Cmd+Shift+1 calls applyPreset("built-in:triage") and preventDefaults.
 *   - Ctrl+Shift+1 also fires (cross-platform).
 *   - Cmd+Shift+2 calls applyPreset("built-in:consult").
 *   - Cmd+Shift+3 calls applyPreset("built-in:document").
 *   - Cmd+Enter calls onSendRx; Ctrl+Enter same.
 *   - Cmd+Shift+Enter calls onOpenWrapUp.
 *   - Modifier-less keypresses other than `[`/`]` don't trigger anything.
 *   - Skips when an input / textarea has focus (editable-focus guard).
 *   - Skips all shortcuts when enabled === false.
 *
 * ppr-15d (new):
 *   - `[` hides the leftmost VISIBLE pane (not toggles paneOrder[0]).
 *   - `]` hides the rightmost VISIBLE pane.
 *   - `[` when leftmost is hidden skips it and hides the next visible.
 *   - `[`/`]` are no-ops when no panes are visible.
 *   - Cmd+1 toggles paneOrder[0]'s hidden bit (show when hidden).
 *   - Cmd+1 toggles paneOrder[0]'s hidden bit (hide when visible).
 *   - Cmd+2 toggles paneOrder[1]'s hidden bit.
 *   - Cmd+3 toggles paneOrder[2]'s hidden bit.
 *   - Cmd+1 does NOT call applyPreset (separate concern from Cmd+Shift+1).
 *   - Cmd+1/2/3 are no-ops when paneOrder has fewer entries.
 *
 * Run: `pnpm --filter frontend vitest run hooks/__tests__/useShellHotkeys`
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  useShellHotkeys,
  type UseShellHotkeysOptions,
} from "@/hooks/useShellHotkeys";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOpts(
  overrides: Partial<UseShellHotkeysOptions> = {},
): UseShellHotkeysOptions {
  return {
    paneOrder: ["chart", "body", "rx"],
    paneState: {
      chart: { sizePct: 25, hidden: false },
      body: { sizePct: 50, hidden: false },
      rx: { sizePct: 25, hidden: false },
    },
    setPaneHidden: vi.fn(),
    applyPreset: vi.fn().mockReturnValue(true),
    onSendRx: vi.fn(),
    onOpenWrapUp: vi.fn(),
    onToggleCustomize: vi.fn(),
    ...overrides,
  };
}

function fireKey(
  key: string,
  opts: {
    metaKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    target?: HTMLElement;
  } = {},
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    metaKey: opts.metaKey ?? false,
    ctrlKey: opts.ctrlKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    altKey: opts.altKey ?? false,
    bubbles: true,
    cancelable: true,
  });
  const dispatchTarget = opts.target ?? document.body;
  dispatchTarget.dispatchEvent(event);
  return event;
}

// ---------------------------------------------------------------------------
// Bracket hotkeys — ppr-15d: hide leftmost/rightmost VISIBLE (3-pane)
// ---------------------------------------------------------------------------

describe("useShellHotkeys — [ bracket hotkey (ppr-15d: hide leftmost visible)", () => {
  afterEach(() => vi.clearAllMocks());

  it("[ hides paneOrder[0] when it is the leftmost visible pane", () => {
    const opts = makeOpts();
    renderHook(() => useShellHotkeys(opts));

    const evt = fireKey("[");

    expect(opts.setPaneHidden).toHaveBeenCalledTimes(1);
    expect(opts.setPaneHidden).toHaveBeenCalledWith("chart", true);
    expect(evt.defaultPrevented).toBe(true);
  });

  it("[ hides the next visible pane when paneOrder[0] is already hidden", () => {
    const opts = makeOpts({
      paneState: {
        chart: { sizePct: 0, hidden: true },
        body: { sizePct: 75, hidden: false },
        rx: { sizePct: 25, hidden: false },
      },
    });
    renderHook(() => useShellHotkeys(opts));

    fireKey("[");

    // chart is hidden → leftmost visible is body
    expect(opts.setPaneHidden).toHaveBeenCalledWith("body", true);
  });

  it("[ is a no-op when no panes are visible", () => {
    const opts = makeOpts({
      paneState: {
        chart: { sizePct: 0, hidden: true },
        body: { sizePct: 0, hidden: true },
        rx: { sizePct: 0, hidden: true },
      },
    });
    renderHook(() => useShellHotkeys(opts));

    const evt = fireKey("[");

    // preventDefault is still called (event was matched by the bracket branch)
    expect(opts.setPaneHidden).not.toHaveBeenCalled();
    expect(evt.defaultPrevented).toBe(true);
  });
});

describe("useShellHotkeys — ] bracket hotkey (ppr-15d: hide rightmost visible)", () => {
  afterEach(() => vi.clearAllMocks());

  it("] hides the rightmost visible pane (rx when all visible)", () => {
    const opts = makeOpts();
    renderHook(() => useShellHotkeys(opts));

    const evt = fireKey("]");

    expect(opts.setPaneHidden).toHaveBeenCalledTimes(1);
    expect(opts.setPaneHidden).toHaveBeenCalledWith("rx", true);
    expect(evt.defaultPrevented).toBe(true);
  });

  it("] hides the next-rightmost visible when rightmost is already hidden", () => {
    const opts = makeOpts({
      paneState: {
        chart: { sizePct: 60, hidden: false },
        body: { sizePct: 40, hidden: false },
        rx: { sizePct: 0, hidden: true },
      },
    });
    renderHook(() => useShellHotkeys(opts));

    fireKey("]");

    // rx is hidden → rightmost visible is body
    expect(opts.setPaneHidden).toHaveBeenCalledWith("body", true);
  });

  it("] is a no-op when no panes are visible", () => {
    const opts = makeOpts({
      paneState: {
        chart: { sizePct: 0, hidden: true },
        body: { sizePct: 0, hidden: true },
        rx: { sizePct: 0, hidden: true },
      },
    });
    renderHook(() => useShellHotkeys(opts));

    fireKey("]");

    expect(opts.setPaneHidden).not.toHaveBeenCalled();
  });

  it("[ and ] do NOT fire when any modifier key is held (Ctrl+[ is browser back)", () => {
    const opts = makeOpts();
    renderHook(() => useShellHotkeys(opts));

    fireKey("[", { ctrlKey: true });
    fireKey("[", { metaKey: true });
    fireKey("]", { ctrlKey: true });
    fireKey("]", { altKey: true });

    expect(opts.setPaneHidden).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Walk-in mode — 2-pane order
// ---------------------------------------------------------------------------

describe("useShellHotkeys — walk-in mode (2-pane order)", () => {
  afterEach(() => vi.clearAllMocks());

  it("[ hides slot 0 (body) when paneOrder has 2 entries and both visible", () => {
    const opts = makeOpts({
      paneOrder: ["body", "rx"],
      paneState: {
        body: { sizePct: 50, hidden: false },
        rx: { sizePct: 50, hidden: false },
      },
    });
    renderHook(() => useShellHotkeys(opts));

    fireKey("[");

    expect(opts.setPaneHidden).toHaveBeenCalledWith("body", true);
  });

  it("] hides slot 1 (rx) when paneOrder has 2 entries and both visible", () => {
    const opts = makeOpts({
      paneOrder: ["body", "rx"],
      paneState: {
        body: { sizePct: 50, hidden: false },
        rx: { sizePct: 50, hidden: false },
      },
    });
    renderHook(() => useShellHotkeys(opts));

    fireKey("]");

    expect(opts.setPaneHidden).toHaveBeenCalledWith("rx", true);
  });
});

// ---------------------------------------------------------------------------
// Pane toggle hotkeys — Cmd/Ctrl+1/2/3 (ppr-15d)
// ---------------------------------------------------------------------------

describe("useShellHotkeys — Cmd+1/2/3 pane toggle hotkeys (ppr-15d)", () => {
  afterEach(() => vi.clearAllMocks());

  it("Cmd+1 toggles paneOrder[0] from visible → hidden", () => {
    const opts = makeOpts();
    renderHook(() => useShellHotkeys(opts));

    const evt = fireKey("1", { metaKey: true });

    expect(opts.setPaneHidden).toHaveBeenCalledTimes(1);
    expect(opts.setPaneHidden).toHaveBeenCalledWith("chart", true);
    expect(evt.defaultPrevented).toBe(true);
  });

  it("Cmd+1 toggles paneOrder[0] from hidden → visible", () => {
    const opts = makeOpts({
      paneState: {
        chart: { sizePct: 0, hidden: true },
        body: { sizePct: 75, hidden: false },
        rx: { sizePct: 25, hidden: false },
      },
    });
    renderHook(() => useShellHotkeys(opts));

    fireKey("1", { metaKey: true });

    expect(opts.setPaneHidden).toHaveBeenCalledWith("chart", false);
  });

  it("Ctrl+1 also toggles pane (cross-platform)", () => {
    const opts = makeOpts();
    renderHook(() => useShellHotkeys(opts));

    fireKey("1", { ctrlKey: true });

    expect(opts.setPaneHidden).toHaveBeenCalledWith("chart", true);
  });

  it("Cmd+2 toggles paneOrder[1] (body)", () => {
    const opts = makeOpts();
    renderHook(() => useShellHotkeys(opts));

    const evt = fireKey("2", { metaKey: true });

    expect(opts.setPaneHidden).toHaveBeenCalledWith("body", true);
    expect(evt.defaultPrevented).toBe(true);
  });

  it("Cmd+3 toggles paneOrder[2] (rx)", () => {
    const opts = makeOpts();
    renderHook(() => useShellHotkeys(opts));

    const evt = fireKey("3", { metaKey: true });

    expect(opts.setPaneHidden).toHaveBeenCalledWith("rx", true);
    expect(evt.defaultPrevented).toBe(true);
  });

  it("Cmd+1 does NOT call applyPreset (separate from Cmd+Shift+1)", () => {
    const opts = makeOpts();
    renderHook(() => useShellHotkeys(opts));

    fireKey("1", { metaKey: true });

    expect(opts.applyPreset).not.toHaveBeenCalled();
    expect(opts.setPaneHidden).toHaveBeenCalledWith("chart", true);
  });

  it("Cmd+3 is a no-op when paneOrder has only 2 entries", () => {
    const opts = makeOpts({
      paneOrder: ["body", "rx"],
      paneState: {
        body: { sizePct: 50, hidden: false },
        rx: { sizePct: 50, hidden: false },
      },
    });
    renderHook(() => useShellHotkeys(opts));

    const evt = fireKey("3", { metaKey: true });

    expect(opts.setPaneHidden).not.toHaveBeenCalled();
    expect(evt.defaultPrevented).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Preset hotkeys — Cmd/Ctrl+Shift+1/2/3
// ---------------------------------------------------------------------------

describe("useShellHotkeys — preset hotkeys (Cmd+Shift+1/2/3)", () => {
  afterEach(() => vi.clearAllMocks());

  it("Cmd+Shift+1 calls applyPreset('built-in:triage') and preventDefaults", () => {
    const opts = makeOpts();
    renderHook(() => useShellHotkeys(opts));

    const evt = fireKey("1", { metaKey: true, shiftKey: true });

    expect(opts.applyPreset).toHaveBeenCalledWith("built-in:triage");
    expect(opts.applyPreset).toHaveBeenCalledTimes(1);
    expect(evt.defaultPrevented).toBe(true);
  });

  it("Ctrl+Shift+1 also calls applyPreset (cross-platform)", () => {
    const opts = makeOpts();
    renderHook(() => useShellHotkeys(opts));

    fireKey("1", { ctrlKey: true, shiftKey: true });

    expect(opts.applyPreset).toHaveBeenCalledWith("built-in:triage");
  });

  it("Cmd+Shift+2 calls applyPreset('built-in:consult')", () => {
    const opts = makeOpts();
    renderHook(() => useShellHotkeys(opts));

    const evt = fireKey("2", { metaKey: true, shiftKey: true });

    expect(opts.applyPreset).toHaveBeenCalledWith("built-in:consult");
    expect(evt.defaultPrevented).toBe(true);
  });

  it("Cmd+Shift+3 calls applyPreset('built-in:document')", () => {
    const opts = makeOpts();
    renderHook(() => useShellHotkeys(opts));

    const evt = fireKey("3", { metaKey: true, shiftKey: true });

    expect(opts.applyPreset).toHaveBeenCalledWith("built-in:document");
    expect(evt.defaultPrevented).toBe(true);
  });

  it("Cmd+Shift+1 does NOT call setPaneHidden (preset apply, not pane toggle)", () => {
    const opts = makeOpts();
    renderHook(() => useShellHotkeys(opts));

    fireKey("1", { metaKey: true, shiftKey: true });

    expect(opts.setPaneHidden).not.toHaveBeenCalled();
    expect(opts.applyPreset).toHaveBeenCalledWith("built-in:triage");
  });

  it("Cmd+Shift+1 with 2-pane order still calls applyPreset (walk-in fallback is caller's concern)", () => {
    const opts = makeOpts({
      paneOrder: ["body", "rx"],
      paneState: {
        body: { sizePct: 50, hidden: false },
        rx: { sizePct: 50, hidden: false },
      },
    });
    renderHook(() => useShellHotkeys(opts));

    fireKey("1", { metaKey: true, shiftKey: true });

    expect(opts.applyPreset).toHaveBeenCalledWith("built-in:triage");
  });
});

// ---------------------------------------------------------------------------
// Customize mode — Cmd/Ctrl+Shift+L (cpfc-01)
// ---------------------------------------------------------------------------

describe("useShellHotkeys — customize mode toggle (Cmd+Shift+L, cpfc-01)", () => {
  afterEach(() => vi.clearAllMocks());

  it("Cmd+Shift+L calls onToggleCustomize and preventDefaults", () => {
    const opts = makeOpts();
    renderHook(() => useShellHotkeys(opts));

    const evt = fireKey("L", { metaKey: true, shiftKey: true });

    expect(opts.onToggleCustomize).toHaveBeenCalledTimes(1);
    expect(evt.defaultPrevented).toBe(true);
  });

  it("Ctrl+Shift+L also calls onToggleCustomize (cross-platform)", () => {
    const opts = makeOpts();
    renderHook(() => useShellHotkeys(opts));

    fireKey("l", { ctrlKey: true, shiftKey: true });

    expect(opts.onToggleCustomize).toHaveBeenCalledTimes(1);
  });

  it("Cmd+Shift+L does NOT fire while an input is focused", () => {
    const opts = makeOpts();
    renderHook(() => useShellHotkeys(opts));

    const input = document.createElement("input");
    document.body.appendChild(input);

    fireKey("L", { metaKey: true, shiftKey: true, target: input });

    expect(opts.onToggleCustomize).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it("Cmd+Shift+L does NOT collide with Cmd+Shift+1 (preset apply)", () => {
    const opts = makeOpts();
    renderHook(() => useShellHotkeys(opts));

    fireKey("1", { metaKey: true, shiftKey: true });

    expect(opts.applyPreset).toHaveBeenCalledWith("built-in:triage");
    expect(opts.onToggleCustomize).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Send Rx and wrap-up — Cmd/Ctrl+Enter
// ---------------------------------------------------------------------------

describe("useShellHotkeys — send Rx and wrap-up", () => {
  afterEach(() => vi.clearAllMocks());

  it("Cmd+Enter calls onSendRx and preventDefaults", () => {
    const opts = makeOpts();
    renderHook(() => useShellHotkeys(opts));

    const evt = fireKey("Enter", { metaKey: true });

    expect(opts.onSendRx).toHaveBeenCalledTimes(1);
    expect(opts.onOpenWrapUp).not.toHaveBeenCalled();
    expect(evt.defaultPrevented).toBe(true);
  });

  it("Ctrl+Enter also calls onSendRx (cross-platform)", () => {
    const opts = makeOpts();
    renderHook(() => useShellHotkeys(opts));

    fireKey("Enter", { ctrlKey: true });

    expect(opts.onSendRx).toHaveBeenCalledTimes(1);
  });

  it("Cmd+Shift+Enter calls onOpenWrapUp", () => {
    const opts = makeOpts();
    renderHook(() => useShellHotkeys(opts));

    const evt = fireKey("Enter", { metaKey: true, shiftKey: true });

    expect(opts.onOpenWrapUp).toHaveBeenCalledTimes(1);
    expect(opts.onSendRx).not.toHaveBeenCalled();
    expect(evt.defaultPrevented).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

describe("useShellHotkeys — guards", () => {
  afterEach(() => vi.clearAllMocks());

  it("skips all shortcuts when an <input> has focus", () => {
    const opts = makeOpts();
    renderHook(() => useShellHotkeys(opts));

    const input = document.createElement("input");
    document.body.appendChild(input);

    fireKey("[", { target: input });
    fireKey("]", { target: input });
    fireKey("1", { metaKey: true, shiftKey: true, target: input });
    fireKey("1", { metaKey: true, target: input });
    fireKey("Enter", { metaKey: true, target: input });

    expect(opts.setPaneHidden).not.toHaveBeenCalled();
    expect(opts.applyPreset).not.toHaveBeenCalled();
    expect(opts.onSendRx).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it("skips all shortcuts when a <textarea> has focus", () => {
    const opts = makeOpts();
    renderHook(() => useShellHotkeys(opts));

    const ta = document.createElement("textarea");
    document.body.appendChild(ta);

    fireKey("[", { target: ta });
    fireKey("1", { metaKey: true, shiftKey: true, target: ta });
    fireKey("1", { metaKey: true, target: ta });
    fireKey("Enter", { metaKey: true, target: ta });

    expect(opts.setPaneHidden).not.toHaveBeenCalled();
    expect(opts.applyPreset).not.toHaveBeenCalled();
    expect(opts.onSendRx).not.toHaveBeenCalled();

    document.body.removeChild(ta);
  });

  it("skips all shortcuts when enabled === false", () => {
    const opts = makeOpts({ enabled: false });
    renderHook(() => useShellHotkeys(opts));

    fireKey("[");
    fireKey("]");
    fireKey("1", { metaKey: true, shiftKey: true });
    fireKey("2", { metaKey: true, shiftKey: true });
    fireKey("1", { metaKey: true });
    fireKey("2", { metaKey: true });
    fireKey("Enter", { metaKey: true });

    expect(opts.setPaneHidden).not.toHaveBeenCalled();
    expect(opts.applyPreset).not.toHaveBeenCalled();
    expect(opts.onSendRx).not.toHaveBeenCalled();
  });

  it("modifier-less letters and digits do not trigger anything", () => {
    const opts = makeOpts();
    renderHook(() => useShellHotkeys(opts));

    fireKey("a");
    fireKey("1");
    fireKey("Enter");
    fireKey("2");
    fireKey("3");

    expect(opts.setPaneHidden).not.toHaveBeenCalled();
    expect(opts.applyPreset).not.toHaveBeenCalled();
    expect(opts.onSendRx).not.toHaveBeenCalled();
    expect(opts.onOpenWrapUp).not.toHaveBeenCalled();
  });

  it("cleans up the window listener on unmount", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => useShellHotkeys(makeOpts()));

    expect(addSpy).toHaveBeenCalledWith("keydown", expect.any(Function));

    unmount();

    expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
