"use client";

export default function CockpitEmptyState() {
  return (
    <div
      data-testid="cockpit-v3-empty-state"
      className="flex h-full min-h-0 flex-1 items-center justify-center text-muted-foreground"
    >
      <div className="text-center">
        <p className="text-sm font-medium">Your cockpit is empty</p>
        <p className="text-xs">Add a pane from the palette above to begin.</p>
      </div>
    </div>
  );
}
