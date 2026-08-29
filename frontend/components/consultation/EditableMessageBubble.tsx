"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** T1.6 / text-B6 — same hard cap as the composer. */
export const EDIT_BODY_HARD_CAP = 4000;
const EDIT_COUNTER_DISPLAY_THRESHOLD = 500;

export interface EditableMessageBubbleProps {
  initialBody: string;
  saving?: boolean;
  onSave: (body: string) => void;
  onCancel: () => void;
}

/**
 * text-B6 — inline edit textarea with save / cancel and char counter.
 */
export function EditableMessageBubble({
  initialBody,
  saving = false,
  onSave,
  onCancel,
}: EditableMessageBubbleProps): JSX.Element {
  const [draft, setDraft] = useState(initialBody);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const overCap = draft.length > EDIT_BODY_HARD_CAP;
  const showCounter = draft.length >= EDIT_COUNTER_DISPLAY_THRESHOLD;

  const handleSave = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed || overCap || saving) return;
    onSave(trimmed);
  }, [draft, onSave, overCap, saving]);

  return (
    <div className="flex w-full flex-col gap-2">
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        disabled={saving}
        className="w-full resize-none rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label="Edit message"
      />
      {showCounter ? (
        <p
          className={
            "text-[11px] " + (overCap ? "text-red-500" : "text-gray-500")
          }
        >
          {draft.length} / {EDIT_BODY_HARD_CAP}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || overCap || !draft.trim()}
          className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded px-2 py-1 text-xs text-gray-600 underline disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
