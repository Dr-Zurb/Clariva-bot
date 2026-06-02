/**
 * Status → Badge variant helpers.
 *
 * Single source of truth for mapping domain status enums to Badge variants.
 * Import these helpers instead of inlining status colors per-component.
 *
 * Usage:
 *   import { getAppointmentBadge } from "@/lib/ui/status";
 *   const { variant, label } = getAppointmentBadge(apt.status);
 *   <Badge variant={variant}>{label}</Badge>
 *
 * To extend: add new entries to the record below and ensure the variant
 * exists in components/ui/badge.tsx. DO NOT add per-page chip styles.
 */

import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

export type AppointmentStatus = "confirmed" | "pending" | "cancelled" | "completed";

export const APPOINTMENT_STATUS_BADGE: Record<
  AppointmentStatus,
  { variant: BadgeVariant; label: string }
> = {
  confirmed: { variant: "success", label: "Confirmed" },
  pending: { variant: "warning", label: "Pending" },
  cancelled: { variant: "secondary", label: "Cancelled" },
  completed: { variant: "info", label: "Completed" },
};

export function getAppointmentBadge(status: string): { variant: BadgeVariant; label: string } {
  return (
    APPOINTMENT_STATUS_BADGE[status as AppointmentStatus] ?? {
      variant: "secondary",
      label: status,
    }
  );
}
