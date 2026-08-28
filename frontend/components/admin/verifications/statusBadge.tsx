import { Badge } from "@/components/ui/badge";
import type { VerificationStatus } from "@/lib/api";

const LABELS: Record<VerificationStatus, string> = {
  unverified: "Unverified",
  pending_review: "Pending review",
  verified: "Verified",
  rejected: "Rejected",
  changes_requested: "Changes requested",
};

export function VerificationStatusBadge({
  status,
}: {
  status: VerificationStatus;
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
