"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Consistent save UX: confirmation message, disabled when not dirty.
 * Use across settings pages for a uniform save experience.
 */
export function SaveButton({
  isDirty,
  saving,
  saveSuccess,
  /** When set and form is dirty, Save stays disabled and this explains why */
  disableReason,
}: {
  isDirty: boolean;
  saving: boolean;
  saveSuccess: boolean;
  disableReason?: string | null;
}) {
  const blocked = Boolean(disableReason);
  const disabled = saving || !isDirty || (isDirty && blocked);
  const showSuccess = saveSuccess && !saving;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={disabled} size="sm">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {saving ? "Saving…" : "Save"}
        </Button>
        {showSuccess && (
          <span
            className="text-sm font-medium text-success"
            role="status"
            aria-live="polite"
          >
            Saved
          </span>
        )}
      </div>
      {isDirty && disableReason ? (
        <p className="max-w-xl text-sm text-warning-foreground" role="status">
          {disableReason}
        </p>
      ) : null}
    </div>
  );
}
