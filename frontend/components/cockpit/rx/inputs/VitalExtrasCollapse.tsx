"use client";

import { useCallback, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Session chrome only — extras stay in form state whether this is open or not. */
export function useVitalExtrasOpen(hasData: boolean): {
  open: boolean;
  toggle: () => void;
  expand: () => void;
} {
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? hasData;
  const toggle = useCallback(() => {
    setManual((prev) => !(prev ?? hasData));
  }, [hasData]);
  const expand = useCallback(() => setManual(true), []);
  return { open, toggle, expand };
}

export function VitalExtrasToggle({
  open,
  onToggle,
  label,
  testId,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  testId: string;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={
        open ? `Hide extra ${label} fields` : `Add more ${label} info`
      }
      onClick={onToggle}
      data-testid={testId}
      className="inline-flex h-6 shrink-0 items-center gap-0.5 rounded px-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {open ? "Less" : "More"}
      <ChevronDown
        className={cn(
          "size-3.5 shrink-0 transition-transform",
          open && "rotate-180"
        )}
        aria-hidden
      />
    </button>
  );
}

export function VitalExtrasPanel({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}): JSX.Element | null {
  if (!open) return null;
  return <div className="min-w-0 space-y-1.5">{children}</div>;
}
