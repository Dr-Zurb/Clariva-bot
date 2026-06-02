/**
 * @vitest-environment jsdom
 */

import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useComposerHotkeys,
  type UseComposerHotkeysOptions,
} from "../use-composer-hotkeys";

interface MutableOptions extends UseComposerHotkeysOptions {
  composerEl: HTMLTextAreaElement | null;
}

function makeHandlers() {
  return {
    onClear: vi.fn(),
    onCancelReply: vi.fn(),
    onEditLastOwn: vi.fn(),
    onForceSend: vi.fn(),
    onCloseMenus: vi.fn(),
  };
}

function makeOptions(
  composerEl: HTMLTextAreaElement | null,
  overrides: Partial<UseComposerHotkeysOptions> = {},
): MutableOptions {
  const handlers = makeHandlers();
  return {
    composerEl,
    composerEmpty: true,
    replyToActive: false,
    menuOpen: false,
    ...handlers,
    ...overrides,
  };
}

function fireKey(
  el: HTMLElement,
  key: string,
  opts: Partial<KeyboardEventInit> = {},
): boolean {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...opts,
  });
  el.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("useComposerHotkeys", () => {
  let textarea: HTMLTextAreaElement;

  beforeEach(() => {
    textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
  });

  afterEach(() => {
    textarea.remove();
  });

  it("no-ops when composerEl is null", () => {
    const opts = makeOptions(null);
    renderHook(() => useComposerHotkeys(opts));
    // Just verifies no throw — there's no element to dispatch on.
    expect(opts.onClear).not.toHaveBeenCalled();
  });

  describe("Esc precedence", () => {
    it("closes menus first when menuOpen", () => {
      const opts = makeOptions(textarea, {
        composerEmpty: false,
        replyToActive: true,
        menuOpen: true,
      });
      renderHook(() => useComposerHotkeys(opts));

      const prevented = fireKey(textarea, "Escape");

      expect(opts.onCloseMenus).toHaveBeenCalledTimes(1);
      expect(opts.onClear).not.toHaveBeenCalled();
      expect(opts.onCancelReply).not.toHaveBeenCalled();
      expect(prevented).toBe(true);
    });

    it("clears composer when it has content and no menu open", () => {
      const opts = makeOptions(textarea, {
        composerEmpty: false,
        replyToActive: true,
      });
      renderHook(() => useComposerHotkeys(opts));

      const prevented = fireKey(textarea, "Escape");

      expect(opts.onClear).toHaveBeenCalledTimes(1);
      expect(opts.onCancelReply).not.toHaveBeenCalled();
      expect(opts.onCloseMenus).not.toHaveBeenCalled();
      expect(prevented).toBe(true);
    });

    it("cancels reply when empty + replyToActive", () => {
      const opts = makeOptions(textarea, { replyToActive: true });
      renderHook(() => useComposerHotkeys(opts));

      const prevented = fireKey(textarea, "Escape");

      expect(opts.onCancelReply).toHaveBeenCalledTimes(1);
      expect(opts.onClear).not.toHaveBeenCalled();
      expect(prevented).toBe(true);
    });

    it("lets Esc bubble when empty + no reply + no menu", () => {
      const opts = makeOptions(textarea);
      renderHook(() => useComposerHotkeys(opts));

      const prevented = fireKey(textarea, "Escape");

      expect(opts.onClear).not.toHaveBeenCalled();
      expect(opts.onCancelReply).not.toHaveBeenCalled();
      expect(opts.onCloseMenus).not.toHaveBeenCalled();
      expect(prevented).toBe(false);
    });
  });

  describe("Up arrow", () => {
    it("fires onEditLastOwn when composer is empty", () => {
      const opts = makeOptions(textarea);
      renderHook(() => useComposerHotkeys(opts));

      const prevented = fireKey(textarea, "ArrowUp");

      expect(opts.onEditLastOwn).toHaveBeenCalledTimes(1);
      expect(prevented).toBe(true);
    });

    it("ignores Up when composer has content (preserves cursor movement)", () => {
      const opts = makeOptions(textarea, { composerEmpty: false });
      renderHook(() => useComposerHotkeys(opts));

      const prevented = fireKey(textarea, "ArrowUp");

      expect(opts.onEditLastOwn).not.toHaveBeenCalled();
      expect(prevented).toBe(false);
    });
  });

  describe("Cmd/Ctrl+Enter", () => {
    it("fires onForceSend on Meta+Enter", () => {
      const opts = makeOptions(textarea, { composerEmpty: false });
      renderHook(() => useComposerHotkeys(opts));

      const prevented = fireKey(textarea, "Enter", { metaKey: true });

      expect(opts.onForceSend).toHaveBeenCalledTimes(1);
      expect(prevented).toBe(true);
    });

    it("fires onForceSend on Ctrl+Enter", () => {
      const opts = makeOptions(textarea, { composerEmpty: false });
      renderHook(() => useComposerHotkeys(opts));

      const prevented = fireKey(textarea, "Enter", { ctrlKey: true });

      expect(opts.onForceSend).toHaveBeenCalledTimes(1);
      expect(prevented).toBe(true);
    });

    it("does not force-send on Shift+Cmd+Enter (reserves for future newline)", () => {
      const opts = makeOptions(textarea, { composerEmpty: false });
      renderHook(() => useComposerHotkeys(opts));

      const prevented = fireKey(textarea, "Enter", {
        metaKey: true,
        shiftKey: true,
      });

      expect(opts.onForceSend).not.toHaveBeenCalled();
      expect(prevented).toBe(false);
    });

    it("does not force-send on plain Enter (composer's own onKeyDown handles it)", () => {
      const opts = makeOptions(textarea, { composerEmpty: false });
      renderHook(() => useComposerHotkeys(opts));

      const prevented = fireKey(textarea, "Enter");

      expect(opts.onForceSend).not.toHaveBeenCalled();
      expect(prevented).toBe(false);
    });
  });

  it("removes the listener on unmount", () => {
    const opts = makeOptions(textarea, { composerEmpty: false });
    const { unmount } = renderHook(() => useComposerHotkeys(opts));

    unmount();

    fireKey(textarea, "Escape");
    expect(opts.onClear).not.toHaveBeenCalled();
  });
});
