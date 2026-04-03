"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

type Props = {
  isDirty: boolean;
  isSaving: boolean;
  /** Same as Save button: when set, Save & leave is disabled */
  saveBlockedReason: string | null;
  onSave: () => Promise<boolean>;
};

function navigateClient(router: ReturnType<typeof useRouter>, pathWithQueryAndHash: string) {
  try {
    const url = new URL(pathWithQueryAndHash, window.location.origin);
    const dest = url.pathname + url.search + url.hash;
    router.push(dest || "/");
  } catch {
    router.push("/");
  }
}

/**
 * When the user has unsaved edits and clicks an in-app link, show a three-way choice:
 * Save & leave, Stay, or Leave without saving.
 * Tab close / refresh uses the native beforeunload prompt only (browser cannot offer Save).
 */
export function UnsavedLeaveGuard({ isDirty, isSaving, saveBlockedReason, onSave }: Props) {
  const router = useRouter();
  const titleId = useId();
  const descId = useId();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const saveBlocked = Boolean(saveBlockedReason);
  const modalOpen = Boolean(isDirty && pendingHref);

  useEffect(() => {
    if (!isDirty) {
      setPendingHref(null);
    }
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) return;
    const onClickCapture = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!anchor || !anchor.href) return;
      if (anchor.target === "_blank" || anchor.download) return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      const nextPath = url.pathname + url.search + url.hash;
      const currentPath =
        window.location.pathname + window.location.search + window.location.hash;
      if (nextPath === currentPath) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(nextPath);
    };
    document.addEventListener("click", onClickCapture, true);
    return () => document.removeEventListener("click", onClickCapture, true);
  }, [isDirty]);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        setPendingHref(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [modalOpen]);

  const closeModal = () => setPendingHref(null);

  const leaveWithoutSaving = () => {
    const href = pendingHref;
    closeModal();
    if (href) navigateClient(router, href);
  };

  const saveAndLeave = async () => {
    if (saveBlocked || isSaving) return;
    const href = pendingHref;
    const ok = await onSave();
    if (ok && href) {
      closeModal();
      navigateClient(router, href);
    }
  };

  if (!modalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div className="absolute inset-0 bg-black/50" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative z-[201] w-full max-w-md rounded-lg border border-gray-200 bg-white p-5 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-gray-900">
          Unsaved changes
        </h2>
        <p id={descId} className="mt-2 text-sm text-gray-600">
          Save your catalog first, stay here to keep editing, or leave and discard changes on this page.
        </p>
        {saveBlocked && saveBlockedReason ? (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-950">{saveBlockedReason}</p>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <button
            type="button"
            onClick={leaveWithoutSaving}
            disabled={isSaving}
            className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
          >
            Leave without saving
          </button>
          <button
            type="button"
            onClick={closeModal}
            disabled={isSaving}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            Stay
          </button>
          <button
            type="button"
            onClick={() => void saveAndLeave()}
            disabled={isSaving || saveBlocked}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Save & leave"}
          </button>
        </div>
      </div>
    </div>
  );
}
