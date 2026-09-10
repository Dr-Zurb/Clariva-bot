"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Drawer } from "vaul";
import {
  PATIENT_CHAT_SNAPS,
  applyPatientKeyboardSheetPin,
  isPatientChatExpanded,
  patientChatCoverFraction,
  patientKeyboardViewportBox,
  patientSheetColumnHeightCss,
} from "@/lib/call/patient-mobile-chrome";

export interface PatientChatSheetProps {
  children: ReactNode;
  snap: number | string | null;
  onSnapChange: (snap: number | string | null) => void;
  onClose?: () => void;
  /** Live cover fraction (0–1) while the handle is dragged; null on release. */
  onVisibleFraction?: (fraction: number | null) => void;
  /** @deprecated Controls now sit on the video half; kept for tests. */
  headerControls?: ReactNode;
}

/**
 * Always-open, non-modal bottom sheet. Chat stays mounted at every snap
 * so the companion Realtime channel never tears down. Peek is 0px
 * (off-screen; the dock Chat button opens it). Drag the header:
 * full ← half → closed. Keyboard pins the drawer to the visual
 * viewport with no snap animation so it does not bounce off the keys.
 */
export default function PatientChatSheet({
  children,
  snap,
  onSnapChange,
  onClose,
  onVisibleFraction,
  headerControls,
}: PatientChatSheetProps) {
  const expanded = isPatientChatExpanded(snap);
  const contentRef = useRef<HTMLDivElement>(null);
  const keyboardOpenRef = useRef(false);
  const [dragCover, setDragCover] = useState<number | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const cover = keyboardOpen
    ? 1
    : (dragCover ?? patientChatCoverFraction(snap));
  const columnHeight = keyboardOpen
    ? "100%"
    : patientSheetColumnHeightCss(cover);

  const reportVisibleFraction = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    const vh = window.innerHeight || 1;
    const fraction = Math.min(1, Math.max(0, 1 - top / vh));
    setDragCover(fraction);
    onVisibleFraction?.(fraction);
  }, [onVisibleFraction]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let raf = 0;
    const sync = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        const box = patientKeyboardViewportBox(
          { height: viewport.height, offsetTop: viewport.offsetTop },
          window.innerHeight
        );
        const el = contentRef.current;
        if (el) applyPatientKeyboardSheetPin(el.style, box);
        const open = box != null;
        if (open === keyboardOpenRef.current) return;
        keyboardOpenRef.current = open;
        setKeyboardOpen(open);
        onVisibleFraction?.(open ? 1 : null);
        document.documentElement.style.overflow = open ? "hidden" : "";
        document.body.style.overflow = open ? "hidden" : "";
      });
    };
    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
      if (raf) window.cancelAnimationFrame(raf);
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    };
  }, [onVisibleFraction]);

  return (
    <Drawer.Root
      open
      dismissible={false}
      modal={false}
      snapPoints={PATIENT_CHAT_SNAPS}
      fadeFromIndex={2}
      activeSnapPoint={snap}
      setActiveSnapPoint={onSnapChange}
      onDrag={reportVisibleFraction}
      onRelease={() => {
        setDragCover(null);
        if (!keyboardOpen) onVisibleFraction?.(null);
      }}
    >
      <Drawer.Portal>
        <Drawer.Content
          ref={contentRef}
          data-testid="patient-chat-sheet"
          data-snap={snap == null ? "" : String(snap)}
          data-keyboard={keyboardOpen ? "open" : "closed"}
          className={
            "fixed inset-x-0 bottom-0 flex h-full flex-col bg-white outline-none [box-shadow:0_-8px_30px_rgba(0,0,0,0.12)] " +
            (keyboardOpen
              ? "rounded-none ![transform:none] ![transition:none]"
              : "rounded-t-2xl ") +
            (expanded ? "z-50" : "pointer-events-none z-30")
          }
        >
          <div
            data-testid="patient-chat-sheet-column"
            className={
              "flex h-full min-h-0 flex-col overflow-hidden " +
              (keyboardOpen ? "[&_form[data-host=panel]]:!pb-0" : "")
            }
            style={keyboardOpen ? undefined : { height: columnHeight }}
          >
            <div className="flex shrink-0 items-center border-b border-gray-200 bg-gray-50 px-2 py-1.5">
              <div className="flex w-8 shrink-0 items-center justify-start">
                {headerControls ? (
                  <div
                    data-testid="patient-chat-sheet-controls"
                    className="flex items-center gap-1"
                  >
                    {headerControls}
                  </div>
                ) : null}
              </div>
              <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <Drawer.Handle className="bg-gray-300" />
                <p className="text-xs font-medium text-gray-600">Chat</p>
              </div>
              <div className="flex w-8 shrink-0 items-center justify-end">
                {expanded && onClose ? (
                  <button
                    type="button"
                    data-testid="patient-chat-sheet-close"
                    onClick={onClose}
                    aria-label="Close chat"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                ) : null}
              </div>
            </div>
            <div
              className={
                "flex min-h-0 flex-1 flex-col overflow-hidden " +
                (expanded ? "" : "invisible")
              }
              aria-hidden={expanded ? undefined : true}
            >
              {children}
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
