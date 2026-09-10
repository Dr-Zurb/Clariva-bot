"use client";

/**
 * Lets SOAP section chrome render in the leaf tab strip (ckd-12).
 * Isolated section tests have no host — children stay in-flow.
 */

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type SoapPaneChromeValue = {
  slot: HTMLElement | null;
  setSlot: (el: HTMLElement | null) => void;
};

const SoapPaneChromeContext = createContext<SoapPaneChromeValue | null>(null);

export function SoapPaneChromeProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const value = useMemo(() => ({ slot, setSlot }), [slot]);
  return (
    <SoapPaneChromeContext.Provider value={value}>
      {children}
    </SoapPaneChromeContext.Provider>
  );
}

export function SoapPaneChromeSlot({
  className,
}: {
  className?: string;
}): JSX.Element {
  const ctx = useContext(SoapPaneChromeContext);
  return (
    <div
      ref={ctx?.setSlot ?? undefined}
      data-testid="soap-pane-chrome-slot"
      className={cn("flex min-w-0 items-center gap-0.5", className)}
    />
  );
}

export function SoapPaneChromePortal({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const ctx = useContext(SoapPaneChromeContext);
  if (ctx?.slot) {
    return createPortal(children, ctx.slot);
  }
  return children;
}
