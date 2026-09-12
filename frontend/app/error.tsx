"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Nearest boundary for dashboard layout + page crashes.
 * Next's default "Application error" hides the real exception.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error.name, error.message, error.digest ?? "");
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col justify-center gap-3 p-6">
      <h1 className="text-xl font-semibold text-foreground">
        This screen hit an error
      </h1>
      <p className="text-sm text-muted-foreground">
        {error.message || "A client-side exception occurred."}
      </p>
      <div>
        <Button type="button" onClick={() => reset()}>
          Try again
        </Button>
      </div>
    </div>
  );
}
