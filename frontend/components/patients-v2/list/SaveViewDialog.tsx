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
import type { PatientSavedView } from "@/types/patient";

export interface SaveViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string, setAsDefault: boolean) => Promise<void>;
  /** Non-null when the doctor already has 5 list views — eviction copy. */
  nextEvictionTarget: PatientSavedView | null;
}

export function SaveViewDialog({
  open,
  onOpenChange,
  onSave,
  nextEvictionTarget,
}: SaveViewDialogProps) {
  const [name, setName] = useState("");
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setName("");
      setSetAsDefault(false);
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
      await onSave(name.trim(), setAsDefault);
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
          <DialogTitle>Save current view</DialogTitle>
          <DialogDescription>
            Save the current search, segment filter, sort, and visible columns so you can
            recall this list later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="view-name">View name</Label>
            <Input
              id="view-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Smith follow-ups"
              maxLength={60}
              required
              autoFocus
            />
            <p className="text-xs text-muted-foreground">{name.length}/60</p>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="view-default"
              type="checkbox"
              checked={setAsDefault}
              onChange={(e) => setSetAsDefault(e.target.checked)}
              className="h-4 w-4 rounded border border-input"
            />
            <Label htmlFor="view-default" className="cursor-pointer font-normal">
              Set as default for this list
            </Label>
          </div>

          {nextEvictionTarget ? (
            <div className="rounded border border-warning/30 bg-warning/10 p-3 text-sm">
              You already have 5 saved views. Saving will{" "}
              <strong>replace the oldest</strong>:{" "}
              <span className="font-medium">&ldquo;{nextEvictionTarget.name}&rdquo;</span>.
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

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
              {submitting ? "Saving…" : nextEvictionTarget ? "Replace & save" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
