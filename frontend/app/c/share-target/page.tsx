"use client";

/**
 * text-C7 — PWA share-target landing page.
 *
 * GET `/c/share-target?keys=...` after the SW 303 redirect. Resolves
 * live text consults and routes shared files into the composer queue.
 */

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatDateTime } from "@/lib/format-date";
import {
  type ActiveTextConsult,
  parseShareTargetKeys,
  persistPendingShareKeys,
  readStagedFilesFromCache,
  registerConsultServiceWorker,
  resolveActiveTextConsults,
} from "@/lib/text/share-target-bridge";

type PagePhase =
  | "loading"
  | "no-consults"
  | "chooser"
  | "no-files"
  | "redirecting";

function formatConsultStart(iso: string | undefined): string {
  if (!iso) return "Active consult";
  return formatDateTime(iso, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ShareTargetPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4">
          <p className="text-sm text-gray-600">Preparing shared file…</p>
        </main>
      }
    >
      <ShareTargetPageInner />
    </Suspense>
  );
}

function ShareTargetPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const keysParam = searchParams?.get("keys") ?? "";

  const [phase, setPhase] = useState<PagePhase>("loading");
  const [activeConsults, setActiveConsults] = useState<ActiveTextConsult[]>([]);
  const [stagedKeys, setStagedKeys] = useState<string[]>([]);

  const goToConsult = useCallback(
    (sessionId: string, keys: string[]) => {
      persistPendingShareKeys(keys);
      setPhase("redirecting");
      router.replace(`/c/text/${sessionId}?prefill_from_share=true`);
    },
    [router],
  );

  useEffect(() => {
    void registerConsultServiceWorker();
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const keys = parseShareTargetKeys(keysParam);
      if (keys.length === 0) {
        if (!cancelled) setPhase("no-files");
        return;
      }

      const files = await readStagedFilesFromCache(keys);
      if (files.length === 0) {
        if (!cancelled) setPhase("no-files");
        return;
      }

      if (!cancelled) setStagedKeys(keys);

      const consults = await resolveActiveTextConsults();
      if (cancelled) return;

      if (consults.length === 0) {
        setPhase("no-consults");
        return;
      }

      if (consults.length === 1) {
        goToConsult(consults[0].sessionId, keys);
        return;
      }

      setActiveConsults(consults);
      setPhase("chooser");
    })();

    return () => {
      cancelled = true;
    };
  }, [keysParam, goToConsult]);

  if (phase === "loading" || phase === "redirecting") {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4">
        <p className="text-sm text-gray-600">
          {phase === "redirecting" ? "Opening your consult…" : "Preparing shared file…"}
        </p>
      </main>
    );
  }

  if (phase === "no-files") {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4">
        <StatusCard
          title="Couldn't read the shared file"
          body="The file may have expired. Open your consult and attach it from the chat composer instead."
        />
      </main>
    );
  }

  if (phase === "no-consults") {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4">
        <StatusCard
          title="No active text consult to share to"
          body="Open a consult first, then share photos or PDFs from your gallery. On Android, install Clariva as an app to see it in the share sheet."
        />
      </main>
    );
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4 py-8">
      <StatusCard
        title="Share to which consult?"
        body="Pick the chat you want to attach this file to."
        className="max-w-md text-left"
      >
        <ul className="mt-4 space-y-2">
          {activeConsults.map((consult) => {
            const label = consult.practiceName?.trim() || "Your doctor";
            return (
              <li key={consult.sessionId}>
                <button
                  type="button"
                  onClick={() => goToConsult(consult.sessionId, stagedKeys)}
                  className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-left transition hover:border-teal-300 hover:bg-teal-50"
                >
                  <span>
                    <span className="block text-sm font-medium text-gray-900">{label}</span>
                    <span className="mt-0.5 block text-xs text-gray-500">
                      {formatConsultStart(consult.scheduledStartAt)}
                    </span>
                  </span>
                  <span className="text-sm font-medium text-teal-700">Share here</span>
                </button>
              </li>
            );
          })}
        </ul>
      </StatusCard>
    </main>
  );
}

function StatusCard({
  title,
  body,
  className = "max-w-sm",
  children,
}: {
  title: string;
  body: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border border-gray-200 bg-white p-6 shadow-sm ${className ?? ""}`}
    >
      <h1 className="text-base font-semibold text-gray-900">{title}</h1>
      <p className="mt-2 text-sm text-gray-600">{body}</p>
      {children}
    </div>
  );
}