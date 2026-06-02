"use client";

import { useState } from "react";
import { RotateCcw, Save, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LayoutCrampedNudge({
  onDismiss,
}: {
  onDismiss: () => void;
}): React.JSX.Element {
  return (
    <div
      role="status"
      className="flex items-center gap-2 text-xs text-warning-foreground"
    >
      <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
      <span>This row is getting cramped — consider stacking some panes as tabs.</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

export interface CustomizeBarProps {
  /** Number of saved custom presets (for the "N/5" hint). */
  presetCount: number;
  /** True when the 5-preset cap is hit — disables Save. */
  atPresetCap: boolean;
  /** Reuses PatientProfilePage.handleSaveLayoutTreePreset. */
  onSaveCurrentLayout: (name: string) => void | Promise<void>;
  /** Applies the active template's built-in tree (P3-DL-5). Always enabled. */
  onResetToDefault: () => void;
  /** cpfc-04 mounts the cramped-layout nudge here; null until then. */
  warningSlot?: React.ReactNode;
}

export default function CustomizeBar({
  presetCount,
  atPresetCap,
  onSaveCurrentLayout,
  onResetToDefault,
  warningSlot,
}: CustomizeBarProps): React.JSX.Element {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy || atPresetCap) return;
    setBusy(true);
    try {
      await onSaveCurrentLayout(trimmed);
      setName("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="toolbar"
      aria-label="Customize layout"
      className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-4 py-2 lg:px-6"
    >
      <span className="text-xs font-medium text-muted-foreground">
        Customize layout
      </span>

      <div className="flex items-center gap-1.5">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={
            atPresetCap ? "Preset limit reached (5/5)" : "Name this layout…"
          }
          maxLength={60}
          disabled={atPresetCap}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSave();
          }}
          className="h-8 w-48"
        />
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          disabled={!name.trim() || busy || atPresetCap}
          onClick={() => void handleSave()}
        >
          <Save className="h-3.5 w-3.5" aria-hidden />
          Save preset
        </Button>
        <span className="text-xs tabular-nums text-muted-foreground">
          {presetCount}/5
        </span>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="gap-1.5"
        onClick={onResetToDefault}
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        Reset to default
      </Button>

      {warningSlot ? <div className="ml-auto">{warningSlot}</div> : null}
    </div>
  );
}
