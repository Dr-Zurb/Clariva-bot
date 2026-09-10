"use client";

/**
 * Stable consult surface — keeps the live ConsultationLauncher / Twilio Room
 * mounted outside the reparentable cockpit tree so moving / retargeting the
 * Consult (`body`) pane never remounts the call (no reconnect, no re-notify).
 *
 * Pattern:
 *   - `<ConsultSurfaceProvider>` wraps the page (shell + host).
 *   - The `body` tab renders `<ConsultSurfaceSlot />` (a portal target).
 *   - `<ConsultSurfaceHost>` mounts the real BodyZone once and portals it
 *     into the active slot. When no slot is mounted (Consult hidden / mid-move),
 *     the host parks into a stable offscreen fallback — React identity is
 *     preserved across both targets via `createPortal`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

interface ConsultSurfaceContextValue {
  slotEl: HTMLElement | null;
  setSlotEl: (el: HTMLElement | null) => void;
}

const ConsultSurfaceContext = createContext<ConsultSurfaceContextValue | null>(
  null,
);

export function ConsultSurfaceProvider({ children }: { children: ReactNode }) {
  const [slotEl, setSlotElState] = useState<HTMLElement | null>(null);
  /** Bumps when a live slot mounts so a deferred clear from an unmount can no-op. */
  const slotGenerationRef = useRef(0);
  const setSlotEl = useCallback((el: HTMLElement | null) => {
    if (el) {
      slotGenerationRef.current += 1;
      setSlotElState((prev) => (prev === el ? prev : el));
      return;
    }
    // Show-here / leaf content swap unmounts the old slot and mounts the new
    // one in the same commit. Defer clear so we don't park the host offscreen
    // for a frame (visible Consult flicker).
    const gen = slotGenerationRef.current;
    queueMicrotask(() => {
      if (slotGenerationRef.current !== gen) return;
      setSlotElState((prev) => (prev === null ? prev : null));
    });
  }, []);
  const value = useMemo(
    () => ({ slotEl, setSlotEl }),
    [slotEl, setSlotEl],
  );
  return (
    <ConsultSurfaceContext.Provider value={value}>
      {children}
    </ConsultSurfaceContext.Provider>
  );
}

function useConsultSurface(): ConsultSurfaceContextValue {
  const ctx = useContext(ConsultSurfaceContext);
  if (!ctx) {
    // Shell-only tests / stray mounts: slot is inert, host parks locally.
    return { slotEl: null, setSlotEl: () => {} };
  }
  return ctx;
}

/** Portal target rendered by the Consult (`body`) pane. */
export function ConsultSurfaceSlot() {
  const { setSlotEl } = useConsultSurface();
  return (
    <div
      ref={setSlotEl}
      data-testid="consult-surface-slot"
      className="flex h-full min-h-0 w-full flex-col"
    />
  );
}

/**
 * Mounts `children` once and portals them into the active slot (or a stable
 * offscreen fallback when the Consult pane is not currently painted).
 */
export function ConsultSurfaceHost({ children }: { children: ReactNode }) {
  const { slotEl } = useConsultSurface();
  const [fallbackEl, setFallbackEl] = useState<HTMLElement | null>(null);
  const target = slotEl ?? fallbackEl;

  return (
    <>
      <div
        ref={setFallbackEl}
        data-testid="consult-surface-fallback"
        className="pointer-events-none fixed left-0 top-0 h-px w-px overflow-hidden opacity-0"
        aria-hidden
      />
      {target
        ? createPortal(
            <div
              data-testid="consult-surface-host"
              className="flex h-full min-h-0 w-full flex-col"
            >
              {children}
            </div>,
            target,
          )
        : null}
    </>
  );
}
