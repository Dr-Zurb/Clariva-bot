"use client";

/**
 * text-A1 — Floating "↓ N new messages" pill when the user has scrolled up
 * and new messages arrive via Realtime INSERT.
 *
 * @see docs/Work/Daily-plans/April 2026/28-04-2026/Tasks/text/task-text-A1-jump-to-latest-pill.md
 */

export interface TextChatJumpToLatestProps {
  /** Count of new messages received while wasAtBottom = false. */
  unreadCount: number;
  /** Smooth-scroll to bottom + reset unread. */
  onJump: () => void;
}

function formatUnreadLabel(count: number): string {
  if (count >= 100) return "↓ 99+ new messages";
  if (count === 1) return "↓ 1 new message";
  return `↓ ${count} new messages`;
}

export default function TextChatJumpToLatest({
  unreadCount,
  onJump,
}: TextChatJumpToLatestProps): JSX.Element | null {
  if (unreadCount <= 0) return null;

  const label = formatUnreadLabel(unreadCount);

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-3"
      data-testid="text-chat-jump-to-latest"
    >
      <button
        type="button"
        onClick={onJump}
        aria-label={label}
        className="pointer-events-auto animate-fade-in rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 shadow-md ring-1 ring-black/5 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
        style={{ animationDuration: "200ms" }}
      >
        {label}
      </button>
    </div>
  );
}
