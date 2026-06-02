"use client";

import { useEffect, useState } from "react";
import type { ConsultationMessage } from "@/lib/text/types";

const EDIT_DELETE_WINDOW_MS = 60_000;

function msRemaining(createdAt: string, nowMs: number): number {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return 0;
  return Math.max(0, EDIT_DELETE_WINDOW_MS - (nowMs - created));
}

/**
 * text-B6 — per-bubble 60s edit/delete window ticker.
 * Starts a 1s interval only while the message is still inside the window.
 */
export function useExpiringMenu(message: ConsultationMessage): {
  canEdit: boolean;
  secondsRemaining: number;
} {
  const [nowMs, setNowMs] = useState(() => Date.now());

  const remaining = msRemaining(message.createdAt, nowMs);
  const canEdit = remaining > 0;

  useEffect(() => {
    const initialRemaining = msRemaining(message.createdAt, Date.now());
    if (initialRemaining <= 0) return;

    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1_000);

    return () => {
      window.clearInterval(id);
    };
  }, [message.createdAt]);

  return {
    canEdit,
    secondsRemaining: Math.ceil(remaining / 1_000),
  };
}
