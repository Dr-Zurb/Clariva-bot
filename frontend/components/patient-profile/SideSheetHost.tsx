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
 *   - Fixed width: `defaultWidth ?? 480` px, right-edge slide-in (~250ms).
 *   - Dismiss: Esc, backdrop click, header close button.
 *   - z-index 40 — above pane chrome, below modals (z-50).
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
const Z_INDEX = 40;

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

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!sheet) {
      setVisible(false);
      return;
    }
    setVisible(false);
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [sheet]);

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

  if (!mounted || !sheet || typeof document === "undefined") {
    return null;
  }

  const widthPx = sheet.defaultWidth ?? DEFAULT_WIDTH_PX;

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
          "absolute inset-0 bg-black/40 transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="side-sheet-title"
        data-side-sheet-id={sheet.id}
        className={cn(
          "absolute inset-y-0 right-0 flex flex-col border-l bg-background shadow-xl",
          "transition-transform duration-200 ease-out",
          visible ? "translate-x-0" : "translate-x-full",
        )}
        style={{ width: widthPx }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
          <h2 id="side-sheet-title" className="truncate text-base font-semibold">
            {sheet.title}
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
          <SideSheetBody content={sheet.content} />
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
