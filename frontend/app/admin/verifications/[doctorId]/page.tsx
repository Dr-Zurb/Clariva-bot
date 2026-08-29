/**
 * Admin verification detail (admin-console-v1 · acon-02).
 *
 * Inline certificate / gov-ID preview via short-lived signed URLs; approve or
 * reject with a required reason.
 */

import { VerificationDetailClient } from "@/components/admin/verifications/VerificationDetailClient";
import { requireAdminAuth } from "@/lib/auth/server-user";

export const metadata = { title: "Review · Admin" };

export default async function AdminVerificationDetailPage({
  params,
}: {
  params: Promise<{ doctorId: string }> | { doctorId: string };
}) {
  const { token } = await requireAdminAuth();
  const { doctorId } = await Promise.resolve(params);

  return <VerificationDetailClient token={token} doctorId={doctorId} />;
}
