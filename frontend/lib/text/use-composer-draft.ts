"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** text-D1 — persisted composer draft (metadata only; no file blobs). */
export interface ComposerDraftReplyTo {
  id: string;
  sender_name: string;
  body: string;
  /** Round-trip for reply banner role label (optional on legacy reads). */
  sender_role?: "doctor" | "patient";
}

export interface ComposerDraft {
  body: string;
  replyTo: ComposerDraftReplyTo | null;
  attachmentMeta: { localId: string; name: string; mime: string; sizeBytes: number }[];
  savedAt: string;
}

const DEBOUNCE_MS = 300;

export function consultDraftStorageKey(sessionId: string): string {
  return `consult-draft-${sessionId}`;
}

export function isComposerDraftEmpty(
  draft: Pick<ComposerDraft, "body" | "replyTo" | "attachmentMeta">,
): boolean {
  return (
    !draft.body.trim() &&
    draft.replyTo === null &&
    draft.attachmentMeta.length === 0
  );
}

function readDraftFromStorage(sessionId: string): ComposerDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(consultDraftStorageKey(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ComposerDraft;
    if (!parsed || typeof parsed.body !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDraftToStorage(sessionId: string, draft: ComposerDraft | null): void {
  if (typeof window === "undefined") return;
  const key = consultDraftStorageKey(sessionId);
  if (!draft || isComposerDraftEmpty(draft)) {
    sessionStorage.removeItem(key);
    return;
  }
  sessionStorage.setItem(key, JSON.stringify(draft));
}

/**
 * text-D1 — debounced sessionStorage persistence for the text consult composer.
 * Per-tab scope: drafts survive refresh / crash but not tab close (clinical privacy).
 *
 * Multi-tab (text-D2): if another tab wins the presence claim and this tab is
 * kicked, the draft remains in this tab's sessionStorage and is recoverable
 * when the user reopens the same consult in this tab.
 */
export function useComposerDraft(
  sessionId: string,
  readonly = false,
): {
  hydratedDraft: ComposerDraft | null;
  saveDraft: (draft: ComposerDraft) => void;
  clearDraft: () => void;
} {
  const [hydratedDraft] = useState<ComposerDraft | null>(() =>
    readonly ? null : readDraftFromStorage(sessionId),
  );

  const pendingDraftRef = useRef<ComposerDraft | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushDraft = useCallback(() => {
    if (readonly || typeof window === "undefined") return;
    timerRef.current = null;
    writeDraftToStorage(sessionId, pendingDraftRef.current);
  }, [readonly, sessionId]);

  const saveDraft = useCallback(
    (draft: ComposerDraft) => {
      if (readonly || typeof window === "undefined") return;
      pendingDraftRef.current = draft;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(flushDraft, DEBOUNCE_MS);
    },
    [flushDraft, readonly],
  );

  const clearDraft = useCallback(() => {
    if (readonly || typeof window === "undefined") return;
    pendingDraftRef.current = null;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    sessionStorage.removeItem(consultDraftStorageKey(sessionId));
  }, [readonly, sessionId]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      flushDraft();
    };
  }, [flushDraft]);

  return { hydratedDraft, saveDraft, clearDraft };
}
