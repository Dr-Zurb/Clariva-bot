import { Badge } from "@/components/ui/badge";
import type { AdminDoctorFunnelStatus } from "@/lib/api";

const LABELS: Record<AdminDoctorFunnelStatus, string> = {
  onboarding: "Onboarding",
  pending_review: "Pending review",
  verified: "Verified",
  rejected: "Rejected",
  changes_requested: "Changes requested",
};

export function DoctorFunnelBadge({
  status,
}: {
  status: AdminDoctorFunnelStatus;
}) {
  const variant =
    status === "verified"
      ? "success"
      : status === "rejected"
        ? "destructive"
        : status === "pending_review" || status === "changes_requested"
          ? "warning"
          : "secondary";

  return <Badge variant={variant}>{LABELS[status]}</Badge>;
}
