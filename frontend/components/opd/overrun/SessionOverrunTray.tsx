"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle } from "lucide-react";
import type { OverrunRow } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SessionOverrunBulkResolveDialog } from "./SessionOverrunBulkResolveDialog";

export interface SessionOverrunTrayProps {
  token: string;
  date: string;
  rows: OverrunRow[];
  onResolved: () => void;
}

export function SessionOverrunTray({
  token,
  date,
  rows,
  onResolved,
}: SessionOverrunTrayProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [justResolved, setJustResolved] = useState(false);

  useEffect(() => {
    if (rows.length === 0 && justResolved) {
      const timer = window.setTimeout(() => setJustResolved(false), 3000);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [rows.length, justResolved]);

  if (rows.length === 0) {
    if (justResolved) {
      return (
        <Card className="mb-3 border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30">
          <CardContent className="flex items-center gap-2 py-3">
            <CheckCircle
              className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
              aria-hidden
            />
            <span className="text-sm font-medium">
              All caught up — no patients past session end.
            </span>
          </CardContent>
        </Card>
      );
    }
    return null;
  }

  return (
    <>
      <Card className="mb-3 border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30">
        <CardContent className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle
              className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden
            />
            <div>
              <p className="text-sm font-semibold">
                {rows.length} patient{rows.length === 1 ? "" : "s"} weren&apos;t
                seen
              </p>
              <p className="text-xs text-muted-foreground">
                Past session end + 30 min. Resolve to keep the schedule clean.
              </p>
            </div>
          </div>
          <Button
            className="shrink-0 self-start sm:self-center"
            onClick={() => setDialogOpen(true)}
          >
            Resolve all
          </Button>
        </CardContent>
      </Card>
      <SessionOverrunBulkResolveDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        token={token}
        date={date}
        rows={rows}
        onResolved={() => {
          setDialogOpen(false);
          setJustResolved(true);
          onResolved();
        }}
      />
    </>
  );
}
