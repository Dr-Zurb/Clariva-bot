/**
 * @vitest-environment jsdom
 */

import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consultDraftStorageKey,
  useComposerDraft,
  type ComposerDraft,
} from "../use-composer-draft";

const SESSION_ID = "sess-abc-123";

function sampleDraft(overrides: Partial<ComposerDraft> = {}): ComposerDraft {
  return {
    body: "Hello draft",
    replyTo: null,
    attachmentMeta: [],
    savedAt: "2026-04-28T10:00:00.000Z",
    ...overrides,
  };
}

describe("useComposerDraft", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it("hydrates from prior sessionStorage value", () => {
    const draft = sampleDraft({ body: "Recovered text" });
    sessionStorage.setItem(consultDraftStorageKey(SESSION_ID), JSON.stringify(draft));

    const { result } = renderHook(() => useComposerDraft(SESSION_ID));

    expect(result.current.hydratedDraft).toEqual(draft);
  });

  it("debounces saveDraft to a single setItem after 300ms", () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(() => useComposerDraft(SESSION_ID));

    act(() => {
      for (let i = 0; i < 5; i += 1) {
        result.current.saveDraft(sampleDraft({ body: `change-${i}` }));
      }
    });

    expect(setItemSpy).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(setItemSpy).toHaveBeenCalledTimes(1);
    expect(setItemSpy).toHaveBeenCalledWith(
      consultDraftStorageKey(SESSION_ID),
      JSON.stringify(sampleDraft({ body: "change-4" })),
    );

    setItemSpy.mockRestore();
  });

  it("clears draft from sessionStorage", () => {
    const draft = sampleDraft();
    sessionStorage.setItem(consultDraftStorageKey(SESSION_ID), JSON.stringify(draft));

    const { result } = renderHook(() => useComposerDraft(SESSION_ID));

    act(() => {
      result.current.clearDraft();
    });

    expect(sessionStorage.getItem(consultDraftStorageKey(SESSION_ID))).toBeNull();
  });

  it("never persists an empty draft", () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    const removeItemSpy = vi.spyOn(Storage.prototype, "removeItem");
    const { result } = renderHook(() => useComposerDraft(SESSION_ID));

    act(() => {
      result.current.saveDraft(sampleDraft({ body: "   ", replyTo: null, attachmentMeta: [] }));
      vi.advanceTimersByTime(300);
    });

    expect(setItemSpy).not.toHaveBeenCalled();
    expect(removeItemSpy).toHaveBeenCalledWith(consultDraftStorageKey(SESSION_ID));

    setItemSpy.mockRestore();
    removeItemSpy.mockRestore();
  });

  it("is SSR-safe and readonly-safe (no sessionStorage access)", () => {
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem");
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    const { result: readonlyResult } = renderHook(() => useComposerDraft(SESSION_ID, true));

    expect(readonlyResult.current.hydratedDraft).toBeNull();

    act(() => {
      readonlyResult.current.saveDraft(sampleDraft());
      readonlyResult.current.clearDraft();
      vi.advanceTimersByTime(300);
    });

    expect(setItemSpy).not.toHaveBeenCalled();
    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
  });

  it("flushes pending draft on unmount", () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    const { result, unmount } = renderHook(() => useComposerDraft(SESSION_ID));

    act(() => {
      result.current.saveDraft(sampleDraft({ body: "flush on exit" }));
    });

    unmount();

    expect(setItemSpy).toHaveBeenCalledWith(
      consultDraftStorageKey(SESSION_ID),
      JSON.stringify(sampleDraft({ body: "flush on exit" })),
    );

    setItemSpy.mockRestore();
  });
});
