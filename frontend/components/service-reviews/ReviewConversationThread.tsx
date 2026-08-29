"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  getInteractionMessages,
  type InteractionMessage,
} from "@/lib/api";
import {
  formatInboxAbsoluteTime,
  formatInboxDaySeparator,
  formatInboxMessageClock,
  formatInboxRelativeTime,
  isSameCalendarDay,
} from "@/lib/inbox/format-relative";
import { cn } from "@/lib/utils";

export interface ReviewConversationThreadProps {
  token: string;
  conversationId: string;
}

const THREAD_PAGE_SIZE = 50;

type ThreadCacheEntry = {
  messages: InteractionMessage[];
  hasMoreOlder: boolean;
};

/** Session cache so switching chats back is instant. */
const threadCache = new Map<string, ThreadCacheEntry>();

/** @internal Vitest only — clear between tests. */
export function clearReviewThreadCacheForTests(): void {
  threadCache.clear();
}

function senderLabel(sender: InteractionMessage["sender_type"]): string {
  switch (sender) {
    case "patient":
      return "Patient";
    case "doctor":
      return "Doctor";
    default:
      return "Bot";
  }
}

/**
 * Read-only receptionist DM thread (ibi-04).
 * Loads newest page first; "Load older" prepends prior messages.
 */
export function ReviewConversationThread({
  token,
  conversationId,
}: ReviewConversationThreadProps) {
  const cached = threadCache.get(conversationId);
  const [messages, setMessages] = useState<InteractionMessage[] | null>(
    cached?.messages ?? null
  );
  const [hasMoreOlder, setHasMoreOlder] = useState(cached?.hasMoreOlder ?? false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!cached);
  const [loadingOlder, setLoadingOlder] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const hit = threadCache.get(conversationId);
    if (hit) {
      setMessages(hit.messages);
      setHasMoreOlder(hit.hasMoreOlder);
      setLoading(false);
      setError(null);
    } else {
      setLoading(true);
      setError(null);
      setMessages(null);
      setHasMoreOlder(false);
    }

    void getInteractionMessages(token, conversationId, { limit: THREAD_PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        const entry = {
          messages: res.data.messages,
          hasMoreOlder: Boolean(res.data.hasMoreOlder),
        };
        threadCache.set(conversationId, entry);
        setMessages(entry.messages);
        setHasMoreOlder(entry.hasMoreOlder);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        if (!threadCache.has(conversationId)) {
          setError("Couldn’t load conversation.");
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, conversationId]);

  const loadOlder = useCallback(async () => {
    if (!messages?.length || loadingOlder || !hasMoreOlder) return;
    const oldest = messages[0];
    setLoadingOlder(true);
    try {
      const res = await getInteractionMessages(token, conversationId, {
        limit: THREAD_PAGE_SIZE,
        before: oldest.created_at,
      });
      setMessages((prev) => {
        const next = [...res.data.messages, ...(prev ?? [])];
        threadCache.set(conversationId, {
          messages: next,
          hasMoreOlder: Boolean(res.data.hasMoreOlder),
        });
        return next;
      });
      setHasMoreOlder(Boolean(res.data.hasMoreOlder));
    } catch {
      setError("Couldn’t load older messages.");
    } finally {
      setLoadingOlder(false);
    }
  }, [messages, loadingOlder, hasMoreOlder, token, conversationId]);

  if (loading && !messages?.length) {
    return (
      <p className="mt-3 text-sm text-muted-foreground" data-testid="review-thread-loading">
        Loading conversation…
      </p>
    );
  }

  if (error && !messages?.length) {
    return (
      <p className="mt-3 text-sm text-destructive" data-testid="review-thread-error" role="alert">
        {error}
      </p>
    );
  }

  if (!messages?.length) {
    return (
      <p className="mt-3 text-sm text-muted-foreground" data-testid="review-thread-empty">
        No messages yet.
      </p>
    );
  }

  const last = messages[messages.length - 1];
  const patientWaiting = last?.sender_type === "patient";

  return (
    <div className="mt-3 space-y-3">
      {patientWaiting && last && (
        <p
          className="rounded-xl bg-amber-500/10 px-3 py-2 text-[12px] font-medium text-amber-800 dark:text-amber-200"
          data-testid="review-thread-waiting"
          role="status"
        >
          Patient waiting · {formatInboxRelativeTime(last.created_at)}
        </p>
      )}
      {hasMoreOlder && (
        <button
          type="button"
          onClick={() => void loadOlder()}
          disabled={loadingOlder}
          className="mx-auto flex rounded-full bg-background/80 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm ring-1 ring-border/60 backdrop-blur hover:text-foreground disabled:opacity-50"
          data-testid="review-thread-load-older"
        >
          {loadingOlder ? "Loading older…" : "Load older messages"}
        </button>
      )}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <ul
        className="space-y-2.5"
        data-testid="review-thread-list"
        aria-label="Conversation messages"
      >
        {messages.map((m, index) => {
          const isPatient = m.sender_type === "patient";
          const isDoctor = m.sender_type === "doctor";
          const prev = index > 0 ? messages[index - 1] : null;
          const showDay =
            !prev || !isSameCalendarDay(prev.created_at, m.created_at);
          return (
            <Fragment key={m.id}>
              {showDay && (
                <li
                  className="flex justify-center py-1"
                  data-testid="review-thread-day"
                >
                  <span className="rounded-full bg-background/90 px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm ring-1 ring-border/50">
                    {formatInboxDaySeparator(m.created_at)}
                  </span>
                </li>
              )}
              <li
                className={cn(
                  "flex flex-col gap-0.5",
                  isPatient ? "items-start" : "items-end"
                )}
                data-sender={m.sender_type}
              >
                <span className="px-1 text-[10px] font-medium text-muted-foreground/80">
                  {senderLabel(m.sender_type)}
                </span>
                <div
                  className={cn(
                    "max-w-[85%] px-3.5 py-2 text-[13px] leading-relaxed shadow-sm",
                    isPatient &&
                      "rounded-2xl rounded-bl-md bg-background text-foreground ring-1 ring-border/50",
                    !isPatient &&
                      !isDoctor &&
                      "rounded-2xl rounded-br-md bg-primary text-primary-foreground",
                    isDoctor &&
                      "rounded-2xl rounded-br-md bg-foreground/90 text-background"
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  <p
                    className={cn(
                      "mt-1 text-[10px] tabular-nums",
                      isPatient
                        ? "text-muted-foreground"
                        : isDoctor
                          ? "text-background/70"
                          : "text-primary-foreground/75"
                    )}
                    title={formatInboxAbsoluteTime(m.created_at)}
                  >
                    {formatInboxMessageClock(m.created_at)}
                  </p>
                </div>
              </li>
            </Fragment>
          );
        })}
      </ul>
    </div>
  );
}
