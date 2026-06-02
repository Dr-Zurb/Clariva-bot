"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  isDirty: boolean;
  isSaving: boolean;
  /** Same as Save button: when set, Save & leave is disabled */
  saveBlockedReason: string | null;
  onSave: () => Promise<boolean>;
};

const GUARD_KEY = "__unsavedCatalog" as const;

function isGuardState(state: unknown): boolean {
  return typeof state === "object" && state !== null && GUARD_KEY in state;
}

type PendingLeave = { kind: "href"; href: string } | { kind: "history" };

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
 * When the user has unsaved edits:
 * - Same-origin link clicks open a modal (Save & leave / Stay / Leave without saving).
 * - Browser Back/Forward is intercepted by pushing a guard history entry while dirty;
 *   the first Back pops that entry and opens the same modal.
 * - Tab close / refresh: native beforeunload only (browser cannot offer Save).
 */
export function UnsavedLeaveGuard({ isDirty, isSaving, saveBlockedReason, onSave }: Props) {
  const router = useRouter();
  const [pendingLeave, setPendingLeave] = useState<PendingLeave | null>(null);

  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  const ignoreNextPopRef = useRef(false);

  const saveBlocked = Boolean(saveBlockedReason);
  const modalOpen = Boolean(isDirty && pendingLeave);

  useEffect(() => {
    if (!isDirty) {
      setPendingLeave(null);
    }
  }, [isDirty]);

  /** While dirty, add a duplicate history entry so the first Back/Forward step is recoverable. */
  useEffect(() => {
    if (!isDirty) return;
    if (isGuardState(window.history.state)) return;
    window.history.pushState({ [GUARD_KEY]: 1 }, "", window.location.href);
  }, [isDirty]);

  /** After save (dirty → clean), drop only our guard entry if it is still on top. */
  useEffect(() => {
    if (isDirty) return;
    if (!isGuardState(window.history.state)) return;
    ignoreNextPopRef.current = true;
    window.history.go(-1);
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
    const onPop = () => {
      if (ignoreNextPopRef.current) {
        ignoreNextPopRef.current = false;
        return;
      }
      if (!isDirtyRef.current) return;
      setPendingLeave({ kind: "history" });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
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
      setPendingLeave({ kind: "href", href: nextPath });
    };
    document.addEventListener("click", onClickCapture, true);
    return () => document.removeEventListener("click", onClickCapture, true);
  }, [isDirty]);

  function closeModalInternal() {
    setPendingLeave((prev) => {
      if (prev?.kind === "history") {
        if (!isGuardState(window.history.state)) {
          window.history.pushState({ [GUARD_KEY]: 1 }, "", window.location.href);
        }
      }
      return null;
    });
  }

  const leaveWithoutSaving = () => {
    const p = pendingLeave;
    setPendingLeave(null);
    if (p?.kind === "href") {
      if (isGuardState(window.history.state)) {
        ignoreNextPopRef.current = true;
        window.history.go(-1);
      }
      setTimeout(() => navigateClient(router, p.href), 0);
    }
    if (p?.kind === "history") {
      ignoreNextPopRef.current = true;
      window.history.back();
    }
  };

  const saveAndLeave = async () => {
    if (saveBlocked || isSaving) return;
    const p = pendingLeave;
    if (!p) return;
    const ok = await onSave();
    if (!ok) return;
    setPendingLeave(null);
    if (p.kind === "href") {
      setTimeout(() => navigateClient(router, p.href), 0);
    }
    if (p.kind === "history") {
      ignoreNextPopRef.current = true;
      window.history.back();
    }
  };

  return (
    <Dialog open={modalOpen} onOpenChange={(open) => !open && closeModalInternal()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Unsaved changes</DialogTitle>
          <DialogDescription>
            Save your catalog first, stay here to keep editing, or leave and discard changes on
            this page.
          </DialogDescription>
        </DialogHeader>
        {saveBlocked && saveBlockedReason ? (
          <p className="rounded-md border border-warning/30 bg-warning/10 p-2 text-xs text-warning-foreground">
            {saveBlockedReason}
          </p>
        ) : null}
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button variant="destructive" size="sm" onClick={leaveWithoutSaving} disabled={isSaving}>
            Leave without saving
          </Button>
          <Button variant="outline" size="sm" onClick={closeModalInternal} disabled={isSaving}>
            Stay
          </Button>
          <Button
            size="sm"
            onClick={() => void saveAndLeave()}
            disabled={isSaving || saveBlocked}
          >
            {isSaving ? "Saving…" : "Save & leave"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
