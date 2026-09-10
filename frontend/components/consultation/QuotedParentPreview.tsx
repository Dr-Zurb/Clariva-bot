"use client";

import { renderMarkdownLite } from "@/lib/text/markdown-lite";
import { messageQuoteClass } from "@/lib/text/message-bubble-theme";
import type { ConsultationMessage } from "@/lib/text/types";

export interface QuotedParentPreviewProps {
  /** Resolved parent row; `null` when deleted or missing. */
  parent: ConsultationMessage | null;
  parentSenderName: string;
  /** Self bubble uses inverted quote chrome. */
  variant: "self" | "other";
  onJumpToParent: () => void;
}

/**
 * One-level quoted parent above a reply bubble (text-B4).
 */
export function QuotedParentPreview({
  parent,
  parentSenderName,
  variant,
  onJumpToParent,
}: QuotedParentPreviewProps): JSX.Element {
  const chrome = messageQuoteClass(variant);

  if (!parent) {
    return (
      <p className={"mb-1.5 border-l-2 pl-2 text-xs italic opacity-80 " + chrome}>
        Replied to a deleted message
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={onJumpToParent}
      className={
        "mb-1.5 w-full min-w-0 rounded border-l-2 pl-2 pr-1 py-1 text-left text-xs " +
        chrome +
        " hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
      }
      aria-label={`Jump to message from ${parentSenderName}`}
    >
      <div className="truncate font-medium">{parentSenderName}</div>
      <div className="truncate opacity-90">
        {renderMarkdownLite(parent.body, { compact: true })}
      </div>
    </button>
  );
}
