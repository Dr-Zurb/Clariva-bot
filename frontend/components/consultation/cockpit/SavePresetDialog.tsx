"use client";

import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CockpitLayout, CockpitLayoutPreset } from "./preset-types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SavePresetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentLayout: CockpitLayout;
  onSave: (name: string, layout: CockpitLayout) => Promise<void>;
  /** Non-null when the array is at cap — shows the eviction confirm copy. */
  nextEvictionTarget: CockpitLayoutPreset | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SavePresetDialog({
  open,
  onOpenChange,
  currentLayout,
  onSave,
  nextEvictionTarget,
}: SavePresetDialogProps) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setName("");
      setError(null);
    }
    onOpenChange(next);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSave(name.trim(), currentLayout);
      handleOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Save layout preset</DialogTitle>
          <DialogDescription>
            Save the current cockpit layout so you can recall it later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="preset-name">Preset name</Label>
            <Input
              id="preset-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Morning OPD"
              maxLength={60}
              required
              autoFocus
            />
            <p className="text-xs text-muted-foreground">{name.length}/60</p>
          </div>

          {nextEvictionTarget && (
            <div className="rounded border border-warning/30 bg-warning/10 p-3 text-sm">
              You already have 5 saved presets. Saving will{" "}
              <strong>evict the oldest</strong>:{" "}
              <span className="ml-0.5 font-medium">
                &ldquo;{nextEvictionTarget.name}&rdquo;
              </span>
              .
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting
                ? "Saving…"
                : nextEvictionTarget
                  ? "Evict & save"
                  : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
