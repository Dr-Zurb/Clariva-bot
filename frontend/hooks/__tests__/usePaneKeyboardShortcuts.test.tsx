/**
 * usePaneKeyboardShortcuts — unit tests (Vitest + RTL).
 *
 * Run: `pnpm --filter frontend test hooks/__tests__/usePaneKeyboardShortcuts.test.tsx`
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  usePaneKeyboardShortcuts,
  type PaneShortcut,
} from "@/hooks/usePaneKeyboardShortcuts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fireDocumentKey(
  key: string,
  opts: {
    metaKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
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
  document.dispatchEvent(event);
  return event;
}

function modKey(opts: { shiftKey?: boolean } = {}): {
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
} {
  const isMac = /Mac|iPhone|iPad/i.test(navigator.platform);
  return isMac
    ? { metaKey: true, shiftKey: opts.shiftKey }
    : { ctrlKey: true, shiftKey: opts.shiftKey };
}

function mountPaneWithInput(paneId = "plan"): {
  pane: HTMLDivElement;
  input: HTMLInputElement;
} {
  const pane = document.createElement("div");
  pane.setAttribute("data-cockpit-pane-id", paneId);
  const input = document.createElement("input");
  pane.appendChild(input);
  document.body.appendChild(pane);
  input.focus();
  return { pane, input };
}

function cleanupDom(...nodes: HTMLElement[]): void {
  for (const node of nodes) {
    if (node.parentNode) node.parentNode.removeChild(node);
  }
}

async function loadHookWithPlatform(platform: string) {
  vi.stubGlobal("navigator", {
    ...navigator,
    platform,
  });
  vi.resetModules();
  return import("@/hooks/usePaneKeyboardShortcuts");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("usePaneKeyboardShortcuts", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("fires on combo + pane-focused", async () => {
    const mod = await loadHookWithPlatform("MacIntel");
    const action = vi.fn();
    const shortcuts: PaneShortcut[] = [{ combo: "mod+m", action }];

    const { pane, input } = mountPaneWithInput("plan");
    renderHook(() =>
      mod.usePaneKeyboardShortcuts({ paneId: "plan", shortcuts }),
    );

    const evt = fireDocumentKey("m", { metaKey: true });

    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith(evt);
    expect(evt.defaultPrevented).toBe(true);

    cleanupDom(pane);
    void input;
  });

  it("ignores combo when focus outside pane", () => {
    const action = vi.fn();
    const shortcuts: PaneShortcut[] = [{ combo: "mod+m", action }];

    const pane = document.createElement("div");
    pane.setAttribute("data-cockpit-pane-id", "plan");
    const input = document.createElement("input");
    pane.appendChild(input);
    document.body.appendChild(pane);

    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();

    renderHook(() =>
      usePaneKeyboardShortcuts({ paneId: "plan", shortcuts }),
    );

    fireDocumentKey("m", modKey());

    expect(action).not.toHaveBeenCalled();

    cleanupDom(pane, outside);
  });

  it("safe scope: fires when no text input focused", () => {
    const action = vi.fn();
    const shortcuts: PaneShortcut[] = [
      { combo: "mod+enter", action, when: "safe" },
    ];

    const pane = document.createElement("div");
    pane.setAttribute("data-cockpit-pane-id", "plan");
    const button = document.createElement("button");
    pane.appendChild(button);
    document.body.appendChild(pane);
    button.focus();

    renderHook(() =>
      usePaneKeyboardShortcuts({ paneId: "plan", shortcuts }),
    );

    const evt = fireDocumentKey("Enter", modKey());

    expect(action).toHaveBeenCalledTimes(1);
    expect(evt.defaultPrevented).toBe(true);

    cleanupDom(pane);
  });

  it("safe scope: ignored when textarea focused without shift", () => {
    const action = vi.fn();
    const shortcuts: PaneShortcut[] = [
      { combo: "mod+enter", action, when: "safe" },
    ];

    const pane = document.createElement("div");
    pane.setAttribute("data-cockpit-pane-id", "plan");
    const textarea = document.createElement("textarea");
    pane.appendChild(textarea);
    document.body.appendChild(pane);
    textarea.focus();

    renderHook(() =>
      usePaneKeyboardShortcuts({ paneId: "plan", shortcuts }),
    );

    fireDocumentKey("Enter", modKey());

    expect(action).not.toHaveBeenCalled();

    cleanupDom(pane);
  });

  it("safe scope: fires when shift added inside textarea", () => {
    const action = vi.fn();
    const shortcuts: PaneShortcut[] = [
      { combo: "mod+shift+enter", action, when: "safe" },
    ];

    const pane = document.createElement("div");
    pane.setAttribute("data-cockpit-pane-id", "plan");
    const textarea = document.createElement("textarea");
    pane.appendChild(textarea);
    document.body.appendChild(pane);
    textarea.focus();

    renderHook(() =>
      usePaneKeyboardShortcuts({ paneId: "plan", shortcuts }),
    );

    const evt = fireDocumentKey("Enter", modKey({ shiftKey: true }));

    expect(action).toHaveBeenCalledTimes(1);
    expect(evt.defaultPrevented).toBe(true);

    cleanupDom(pane);
  });

  it("platform detection — Windows uses Ctrl, not Meta", async () => {
    const mod = await loadHookWithPlatform("Win32");
    const action = vi.fn();
    const shortcuts: PaneShortcut[] = [{ combo: "mod+m", action }];

    const { pane } = mountPaneWithInput("plan");
    renderHook(() =>
      mod.usePaneKeyboardShortcuts({ paneId: "plan", shortcuts }),
    );

    fireDocumentKey("m", { ctrlKey: true });
    expect(action).toHaveBeenCalledTimes(1);

    action.mockClear();
    fireDocumentKey("m", { metaKey: true });
    expect(action).not.toHaveBeenCalled();

    cleanupDom(pane);
  });

  it("disabled — no listeners registered", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const action = vi.fn();

    renderHook(() =>
      usePaneKeyboardShortcuts({
        paneId: "plan",
        shortcuts: [{ combo: "mod+m", action }],
        enabled: false,
      }),
    );

    expect(addSpy).not.toHaveBeenCalledWith("keydown", expect.any(Function));

    fireDocumentKey("m", modKey());
    expect(action).not.toHaveBeenCalled();

    addSpy.mockRestore();
  });

  it("cleanup on unmount — combo no longer fires", () => {
    const action = vi.fn();
    const shortcuts: PaneShortcut[] = [{ combo: "mod+m", action }];

    const { pane } = mountPaneWithInput("plan");
    const { unmount } = renderHook(() =>
      usePaneKeyboardShortcuts({ paneId: "plan", shortcuts }),
    );

    unmount();
    fireDocumentKey("m", modKey());

    expect(action).not.toHaveBeenCalled();

    cleanupDom(pane);
  });
});
