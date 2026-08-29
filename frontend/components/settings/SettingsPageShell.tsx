"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface SettingsPageShellProps {
  title: string;
  description: string;
  isLoading?: boolean;
  loadError?: string | null;
  onRetry?: () => void;
  /** Inline save/validation error while settings are loaded. */
  saveError?: string | null;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Shared chrome for Settings leaf pages (settings-refresh · SR-D1/D2).
 */
export function SettingsPageShell({
  title,
  description,
  isLoading = false,
  loadError = null,
  onRetry,
  saveError = null,
  children,
  className,
}: SettingsPageShellProps) {
  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="mt-4 h-64 w-full" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive"
        role="alert"
      >
        <p className="font-medium">Error</p>
        <p className="mt-1 text-sm">{loadError}</p>
        {onRetry ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => onRetry()}
          >
            Try again
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn(className)}>
      <h1 className="shrink-0 text-2xl font-semibold text-foreground">{title}</h1>
      <p className="mt-1 shrink-0 text-muted-foreground">{description}</p>
      {saveError ? (
        <div
          className="mt-4 shrink-0 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-900 dark:text-amber-200"
          role="status"
        >
          {saveError}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/** Shared field control classes for native select / textarea (SR-D2). */
export const settingsFieldClassName =
  "mt-1 flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
