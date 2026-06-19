"use client";

import { LayoutGrid } from "lucide-react";

export default function CockpitEmptyState() {
  return (
    <div
      data-testid="cockpit-v3-empty-state"
      className="flex h-full min-h-0 flex-1 items-center justify-center px-6 py-12"
    >
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60"
          aria-hidden
        >
          <LayoutGrid className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">Your cockpit is empty</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Choose a layout — Consult, Read, Document, or Review — from{" "}
            <span className="font-medium text-foreground">Layouts</span> in the
            palette, or add individual panes to build your own view.
          </p>
        </div>
      </div>
    </div>
  );
}
