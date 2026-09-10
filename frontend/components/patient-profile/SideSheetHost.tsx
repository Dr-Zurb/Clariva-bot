"use client";

/**
 * `<SideSheetHost>` — shell-scoped right-edge side sheet (cv2-09 / cce-01).
 *
 * Implements the imperative `SideSheetDefinition` contract from
 * `@/lib/patient-profile/aux-surfaces`. Mount once at
 * `PatientProfilePage` (above both shells) so any pane descendant can call
 * `useSideSheet()`.
 *
 * Semantics (DL-4):
 *   - Single sheet: `open()` replaces the current sheet (no stacking).
 *   - Fixed width: `defaultWidth ?? 480` px, right-edge slide-in (~280ms).
 *   - Dismiss: Esc, backdrop click, header close button.
 *   - z-index 60 — above the dashboard shell navigation (z-50) so the
 *     backdrop makes the whole application inactive while the sheet is open.
 *
 * `canDock` is honored at the type level only in v1.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type {
  SideSheetAnchor,
  SideSheetDefinition,
} from "@/lib/patient-profile/aux-surfaces";
import { cn } from "@/lib/utils";

const DEFAULT_WIDTH_PX = 480;
const Z_INDEX = 60;
const EXIT_DURATION_MS = 280;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface SideSheetContextValue {
  open: (definition: SideSheetDefinition | string) => void;
  close: () => void;
  register: (anchor: SideSheetAnchor) => () => void;
  isOpen: (id: string) => boolean;
}

const SideSheetContext = createContext<SideSheetContextValue | null>(null);

function useSideSheetContext(): SideSheetContextValue {
  const ctx = useContext(SideSheetContext);
  if (!ctx) {
    throw new Error(
      "useSideSheet() must be used within <SideSheetHost> (mounted in PatientProfilePage).",
    );
  }
  return ctx;
}

/** Open / dismiss the shell's active side sheet. */
export function useSideSheet(): SideSheetContextValue {
  return useSideSheetContext();
}

// ---------------------------------------------------------------------------
// Content renderer
// ---------------------------------------------------------------------------

function SideSheetBody({ content }: { content: SideSheetDefinition["content"] }) {
  if (React.isValidElement(content)) {
    return content;
  }
  if (typeof content === "function") {
    const Content = content as React.ComponentType<unknown>;
    return <Content />;
  }
  return <>{content}</>;
}

// ---------------------------------------------------------------------------
// Overlay (portal to document.body)
// ---------------------------------------------------------------------------

function SideSheetOverlay({
  sheet,
  onClose,
}: {
  sheet: SideSheetDefinition | null;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  // Keep the last sheet mounted briefly after close so both the backdrop and
  // drawer can finish their exit transition instead of disappearing at once.
  const [renderedSheet, setRenderedSheet] = useState<SideSheetDefinition | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }

    if (sheet) {
      setRenderedSheet(sheet);
      setVisible(false);
      // Two frames guarantee the initial offset is painted before moving to
      // the resting position. A single rAF is often coalesced with mounting,
      // which makes the drawer appear to snap open on fast machines.
      let secondRaf: number | null = null;
      const firstRaf = requestAnimationFrame(() => {
        secondRaf = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(firstRaf);
        if (secondRaf != null) cancelAnimationFrame(secondRaf);
      };
    }

    setVisible(false);
    exitTimerRef.current = setTimeout(() => {
      setRenderedSheet(null);
      exitTimerRef.current = null;
    }, EXIT_DURATION_MS);

    return () => {
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
    };
  }, [sheet]);

  useEffect(
    () => () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!sheet) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sheet, onClose]);

  useEffect(() => {
    if (!sheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheet]);

  if (!mounted || !renderedSheet || typeof document === "undefined") {
    return null;
  }

  const widthPx = renderedSheet.defaultWidth ?? DEFAULT_WIDTH_PX;

  return createPortal(
    <div
      data-testid="side-sheet-host"
      className="fixed inset-0"
      style={{ zIndex: Z_INDEX }}
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close side sheet"
        className={cn(
          "absolute inset-0 bg-slate-950/50 backdrop-blur-[1px] transition-opacity duration-[220ms] ease-out motion-reduce:transition-none",
          visible ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="side-sheet-title"
        data-side-sheet-id={renderedSheet.id}
        className={cn(
          "absolute inset-y-0 right-0 flex flex-col border-l bg-background shadow-2xl",
          "transition-[transform,opacity] duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          visible ? "translate-x-0 opacity-100" : "translate-x-12 opacity-0",
        )}
        style={{ width: `min(100vw, ${widthPx}px)` }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
          <h2 id="side-sheet-title" className="truncate text-base font-semibold">
            {renderedSheet.title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SideSheetBody content={renderedSheet.content} />
        </div>
      </aside>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Host (provider + overlay)
// ---------------------------------------------------------------------------

export interface SideSheetHostProps {
  children: React.ReactNode;
}

export default function SideSheetHost({ children }: SideSheetHostProps) {
  const [currentSheet, setCurrentSheet] = useState<SideSheetDefinition | null>(null);
  // Anchors registry lives in a ref because callers register/unregister inside
  // `useEffect` chains and the loop must not be driven by React state changes.
  // Using state here used to cause:
  //   1. anchor mounts → register() → setAnchors → anchors state changes
  //   2. context `value` rebuilt (open depended on `anchors`)
  //   3. consumer effect `[sideSheet]` re-fires → cleanup calls unregister()
  //   4. setAnchors again → goto 2 → "Maximum update depth exceeded"
  // The ref makes register/unregister side-effect-only — no re-render churn,
  // and `open()` (which reads anchors on demand) stays referentially stable.
  const anchorsRef = useRef<Map<string, SideSheetAnchor>>(new Map());
  // Mirror of `currentSheet?.id` so `isOpen()` can stay referentially stable
  // (consumers needing reactivity should subscribe to state separately; no
  // production consumer currently does).
  const currentSheetIdRef = useRef<string | null>(currentSheet?.id ?? null);
  currentSheetIdRef.current = currentSheet?.id ?? null;

  const register = useCallback((anchor: SideSheetAnchor) => {
    anchorsRef.current.set(anchor.id, anchor);
    return () => {
      anchorsRef.current.delete(anchor.id);
      setCurrentSheet((prev) => (prev?.id === anchor.id ? null : prev));
    };
  }, []);

  const open = useCallback((definitionOrId: SideSheetDefinition | string) => {
    if (typeof definitionOrId === "string") {
      const anchor = anchorsRef.current.get(definitionOrId);
      if (!anchor) return;
      const pct = Math.min(60, Math.max(20, anchor.widthPct ?? 35));
      const widthPx =
        typeof window !== "undefined"
          ? Math.round(window.innerWidth * (pct / 100))
          : DEFAULT_WIDTH_PX;
      setCurrentSheet({
        id: anchor.id,
        title: anchor.title,
        content: anchor.render(),
        defaultWidth: widthPx,
      });
      return;
    }
    setCurrentSheet(definitionOrId);
  }, []);

  const close = useCallback(() => {
    setCurrentSheet(null);
  }, []);

  const isOpen = useCallback(
    (id: string) => currentSheetIdRef.current === id,
    [],
  );

  // `value` identity is now stable across re-renders — every method is wrapped
  // in `useCallback([])` and reads its dynamic inputs through refs. Consumers
  // that depend on the whole context value in effect deps (e.g.
  // `useEffect(..., [sideSheet, token])`) no longer churn when anchors mutate.
  const value = useMemo<SideSheetContextValue>(
    () => ({ open, close, register, isOpen }),
    [open, close, register, isOpen],
  );

  return (
    <SideSheetContext.Provider value={value}>
      {children}
      <SideSheetOverlay sheet={currentSheet} onClose={close} />
    </SideSheetContext.Provider>
  );
}
