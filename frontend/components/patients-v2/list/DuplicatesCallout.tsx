"use client";

import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export interface DuplicatesCalloutProps {
  groupCount: number;
  onReview: () => void;
}

/**
 * Inline banner above the patients table when possible duplicates exist (PLP-D6).
 * Count only — no patient names (PHI-safe).
 */
export function DuplicatesCallout({ groupCount, onReview }: DuplicatesCalloutProps) {
  if (groupCount <= 0) return null;

  const label =
    groupCount === 1
      ? "1 possible duplicate group"
      : `${groupCount} possible duplicate groups`;

  return (
    <Alert className="border-amber-200 bg-amber-50/50 text-foreground dark:border-amber-800 dark:bg-amber-950/30">
      <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400" aria-hidden />
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span>
          {label} — review before they confuse charts.
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-amber-300 text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-100 dark:hover:bg-amber-900/40"
          onClick={onReview}
        >
          Review
        </Button>
      </AlertDescription>
    </Alert>
  );
}
