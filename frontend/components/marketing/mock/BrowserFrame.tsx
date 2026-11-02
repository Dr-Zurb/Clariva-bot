import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type BrowserFrameProps = {
  /** One sentence a screen reader uses for the whole picture. */
  label: string;
  children: ReactNode;
  className?: string;
};

/**
 * Chrome around a drawn product picture. The label is the accessible name;
 * everything inside is part of the picture.
 */
export function BrowserFrame({
  label,
  children,
  className,
}: BrowserFrameProps) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-[hsl(var(--halo-navy))]/10 bg-white shadow-[0_30px_70px_-28px_hsl(var(--halo-navy)_/_0.45)]",
        className
      )}
    >
      <div className="relative flex h-9 shrink-0 items-center border-b border-[hsl(var(--halo-navy))]/10 bg-[hsl(var(--halo-mist))] px-3">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--halo-navy))]/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--halo-navy))]/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--halo-navy))]/15" />
        </span>
        <span
          aria-hidden
          className="absolute left-1/2 h-5 w-40 -translate-x-1/2 rounded-full bg-white"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden p-4 sm:p-5">
        {children}
      </div>
    </div>
  );
}
