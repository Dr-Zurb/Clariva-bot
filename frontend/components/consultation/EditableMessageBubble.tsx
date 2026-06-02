"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** T1.6 / text-B6 — same hard cap as the composer. */
export const EDIT_BODY_HARD_CAP = 4000;
const EDIT_COUNTER_DISPLAY_THRESHOLD = 500;

export interface EditableMessageBubbleProps {
  initialBody: string;
  isSelf: boolean;
  saving?: boolean;
  onSave: (body: string) => void;
  onCancel: () => void;
}

/**
 * text-B6 — inline edit textarea with save / cancel and char counter.
 */
export function EditableMessageBubble({
  initialBody,
  isSelf,
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
        className={
          "w-full resize-none rounded-lg border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 " +
          (isSelf
            ? "border-white/40 bg-blue-700 text-white placeholder:text-white/60"
            : "border-gray-300 bg-white text-gray-900")
        }
        aria-label="Edit message"
      />
      {showCounter ? (
        <p
          className={
            "text-[11px] " +
            (overCap ? "text-red-300" : isSelf ? "text-white/80" : "text-gray-500")
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
          className={
            "rounded px-2 py-1 text-xs font-medium disabled:opacity-50 " +
            (isSelf ? "bg-white text-blue-700" : "bg-blue-600 text-white")
          }
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className={
            "rounded px-2 py-1 text-xs underline disabled:opacity-50 " +
            (isSelf ? "text-white/90" : "text-gray-600")
          }
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
