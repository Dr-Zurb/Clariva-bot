"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { duplicateMedicationNoticeText } from "@/lib/chart/chart-medication";
import { nudgeChartMedCard } from "@/lib/chart/chart-medication-scroll";

const NOTICE_MS = 4000;

function ChartMedDuplicateNoticeToast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const handle = window.setTimeout(onDismiss, NOTICE_MS);
    return () => window.clearTimeout(handle);
  }, [message, onDismiss]);

  return createPortal(
    <p
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-1/2 z-[100] max-w-[min(100vw-2rem,22rem)] -translate-x-1/2 rounded-md border border-amber-500/35 bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-950 shadow-md dark:border-amber-400/30 dark:bg-amber-950/95 dark:text-amber-50"
    >
      {message}
    </p>,
    document.body,
  );
}

/** Brief toast + scroll/highlight when a duplicate med add is blocked. */
export function useChartMedDuplicateNotice(): {
  notifyDuplicate: (med: { id: string; drug_name: string }) => void;
  noticePortal: ReactNode;
} {
  const [message, setMessage] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const dismiss = useCallback(() => setMessage(null), []);

  const notifyDuplicate = useCallback((med: { id: string; drug_name: string }) => {
    nudgeChartMedCard(med.id);
    setMessage(duplicateMedicationNoticeText(med.drug_name));
  }, []);

  const noticePortal =
    mounted && message ? (
      <ChartMedDuplicateNoticeToast message={message} onDismiss={dismiss} />
    ) : null;

  return { notifyDuplicate, noticePortal };
}
