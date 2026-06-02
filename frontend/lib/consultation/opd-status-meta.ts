/**
 * Canonical OPD queue status → display meta map.
 *
 * Single source of truth consumed by:
 *   - frontend/components/dashboard/cockpit/OpdQueueStrip.tsx
 *   - frontend/components/dashboard/cockpit/CockpitQueueRail.tsx (pf-08 follow-up)
 *   - Any future cockpit pane that renders queue status (pf-13+)
 *
 * Status values mirror the DB enum in backend/migrations/028_opd_modes.sql.
 *
 * @see docs/Work/Daily-plans/May 2026/07-05-2026/Tasks/task-pf-12-opd-strip-extension.md
 */

import type { LucideIcon } from "lucide-react";
import {
  BellRing,
  Check,
  Clock,
  Mic,
  MinusCircle,
  X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OpdStatus =
  | "waiting"
  | "called"
  | "in_consultation"
  | "completed"
  | "missed"
  | "skipped"
  | "cancelled";

export interface OpdStatusMeta {
  /** Short human label: "Waiting", "Done", "No show", … */
  label: string;
  /**
   * Badge variant to pass to <Badge variant={…} />.
   * "success-outline" is rendered as variant="outline" + green className
   * (the Badge component does not yet have a first-class success-outline variant).
   */
  badgeVariant:
    | "default"
    | "outline"
    | "destructive"
    | "secondary"
    | "success-outline";
  /** Extra className applied to <Badge> for colour overrides. */
  badgeClassName: string;
  /** Lucide icon that represents this status. */
  icon: LucideIcon;
  /**
   * Rendering group for list sorting:
   *   1 = active (waiting / called / in_consultation)
   *   2 = done (completed)
   *   3 = missed (missed / skipped / cancelled)
   */
  sortGroup: 1 | 2 | 3;
}

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------

export const OPD_STATUS_META: Record<OpdStatus, OpdStatusMeta> = {
  waiting: {
    label: "Waiting",
    badgeVariant: "outline",
    badgeClassName: "border-transparent bg-muted text-muted-foreground",
    icon: Clock,
    sortGroup: 1,
  },
  called: {
    label: "Called",
    badgeVariant: "outline",
    badgeClassName:
      "border-transparent bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    icon: BellRing,
    sortGroup: 1,
  },
  in_consultation: {
    label: "In consult",
    badgeVariant: "outline",
    badgeClassName:
      "border-transparent bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    icon: Mic,
    sortGroup: 1,
  },
  completed: {
    label: "Done",
    badgeVariant: "success-outline",
    badgeClassName:
      "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300",
    icon: Check,
    sortGroup: 2,
  },
  missed: {
    label: "No show",
    badgeVariant: "destructive",
    badgeClassName:
      "border-transparent bg-destructive/10 text-destructive",
    icon: X,
    sortGroup: 3,
  },
  skipped: {
    label: "Skipped",
    badgeVariant: "outline",
    badgeClassName:
      "border-transparent bg-muted/60 text-muted-foreground line-through",
    icon: MinusCircle,
    sortGroup: 3,
  },
  cancelled: {
    label: "Cancelled",
    badgeVariant: "outline",
    badgeClassName:
      "border-transparent bg-destructive/10 text-destructive",
    icon: X,
    sortGroup: 3,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the meta for any status string, falling back to a muted default. */
export function getOpdStatusMeta(status: string): OpdStatusMeta {
  return (
    OPD_STATUS_META[status as OpdStatus] ?? {
      label: status,
      badgeVariant: "outline" as const,
      badgeClassName: "border-transparent bg-muted text-muted-foreground",
      icon: Clock,
      sortGroup: 1 as const,
    }
  );
}
