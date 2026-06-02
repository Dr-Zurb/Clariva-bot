"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ActionToastItem {
  id: string;
  text: string;
  undo?: () => void;
  durationMs?: number;
  variant?: "default" | "error";
}

export interface ActionToastApi {
  show: (item: ActionToastItem) => void;
  dismiss: (id: string) => void;
  error: (text: string) => void;
}

function ActionToastCard({
  item,
  onDismiss,
}: {
  item: ActionToastItem;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const ms = item.durationMs ?? 5000;
    const handle = window.setTimeout(onDismiss, ms);
    return () => window.clearTimeout(handle);
  }, [item.id, item.durationMs, onDismiss]);

  const isError = item.variant === "error";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex animate-slide-in-from-right items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm shadow-md",
        isError
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-border bg-background text-foreground ring-1 ring-border/80"
      )}
    >
      <span className="font-medium">{item.text}</span>
      {item.undo ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={() => {
            item.undo?.();
            onDismiss();
          }}
        >
          Undo
        </Button>
      ) : null}
    </div>
  );
}

function ActionToastPortal({
  queue,
  onDismiss,
}: {
  queue: ActionToastItem[];
  onDismiss: (id: string) => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(100vw-2rem,24rem)] flex-col gap-2"
      aria-label="Action notifications"
    >
      {queue.map((item) => (
        <div key={item.id} className="pointer-events-auto">
          <ActionToastCard item={item} onDismiss={() => onDismiss(item.id)} />
        </div>
      ))}
    </div>,
    document.body
  );
}

/** Inbox-scoped toast queue with optional Undo; promotable to a shared host later. */
export function useActionToasts(): ActionToastApi & { portal: ReactNode } {
  const [queue, setQueue] = useState<ActionToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setQueue((items) => items.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((item: ActionToastItem) => {
    setQueue((items) => [...items.filter((t) => t.id !== item.id), item]);
  }, []);

  const error = useCallback(
    (text: string) => {
      show({
        id: `err-${Date.now()}`,
        text,
        variant: "error",
        durationMs: 5000,
      });
    },
    [show]
  );

  const portal = <ActionToastPortal queue={queue} onDismiss={dismiss} />;

  return { show, dismiss, error, portal };
}
