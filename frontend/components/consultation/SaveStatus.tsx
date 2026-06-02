"use client";

/**
 * SaveStatus pill (EHR Sub-batch B1 / T2.13)
 *
 * Tiny inline indicator that consumes the state surface returned by
 * `useAutoSave`. Shows one of:
 *   - Saving…              (state='saving')
 *   - Unsaved changes…     (state in {idle,saved} && isPending)
 *   - Saved Xs ago         (state='saved' && !isPending)
 *   - Save failed — Retry  (state='error', clickable)
 *
 * The "Xs ago" counter ticks every 10 seconds (flips between seconds
 * → minutes → "just now"), to avoid second-by-second renders.
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { AutoSaveState } from "@/hooks/useAutoSave";

interface SaveStatusProps {
  state: AutoSaveState;
  savedAt: Date | null;
  isPending: boolean;
  onRetry: () => void;
  /** Optional className passthrough for layout integration. */
  className?: string;
}

function formatAgo(savedAt: Date | null, now: number): string {
  if (!savedAt) return "";
  const seconds = Math.max(0, Math.floor((now - savedAt.getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export default function SaveStatus({
  state,
  savedAt,
  isPending,
  onRetry,
  className,
}: SaveStatusProps) {
  // Re-render every 10s while there's a savedAt to refresh the "ago" label.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!savedAt || state !== "saved") return;
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, [savedAt, state]);

  let label: string;
  let tone: "neutral" | "info" | "success" | "warn" | "error" = "neutral";
  let role: "status" | "alert" = "status";
  let interactive = false;

  if (state === "saving") {
    label = "Saving…";
    tone = "info";
  } else if (state === "error") {
    label = "Save failed — Retry";
    tone = "error";
    role = "alert";
    interactive = true;
  } else if (isPending) {
    label = "Unsaved changes…";
    tone = "warn";
  } else if (state === "saved" && savedAt) {
    label = `Saved ${formatAgo(savedAt, now)}`;
    tone = "success";
  } else {
    // idle, no prior save → don't draw anything (avoids "Saved" before
    // the doctor has typed anything).
    return null;
  }

  const toneClass =
    tone === "error"
      ? "bg-red-50 text-red-700 ring-red-200"
      : tone === "warn"
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : tone === "success"
          ? "bg-green-50 text-green-700 ring-green-200"
          : tone === "info"
            ? "bg-blue-50 text-blue-700 ring-blue-200"
            : "bg-gray-50 text-gray-600 ring-gray-200";

  const base =
    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset";

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onRetry}
        role={role}
        aria-live="polite"
        className={`${base} ${toneClass} hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-400 ${className ?? ""}`}
      >
        {state === "saving" && <Spinner />}
        {label}
      </button>
    );
  }

  return (
    <span
      role={role}
      aria-live="polite"
      className={`${base} ${toneClass} ${className ?? ""}`}
    >
      {state === "saving" && <Spinner />}
      {label}
    </span>
  );
}

function Spinner() {
  return <Loader2 className="h-3 w-3 animate-spin text-current" aria-hidden="true" />;
}
