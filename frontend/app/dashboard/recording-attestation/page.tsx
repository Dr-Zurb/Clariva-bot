/**
 * Recording attestation — six-clause accept surface (rec-11 / REC-D4).
 */

import { RecordingAttestationClient } from "@/components/dashboard/recording-attestation/RecordingAttestationClient";
import { requireDashboardAuth } from "@/lib/auth/server-user";

export const metadata = { title: "Recording attestation" };

export default async function RecordingAttestationPage() {
  const { token } = await requireDashboardAuth();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Recording attestation
        </h1>
        <p className="mt-1 text-muted-foreground">
          Audio recording is a disclosed mandate. Accept the six clauses
          before starting a voice or video consult.
        </p>
      </div>
      <RecordingAttestationClient token={token} />
    </div>
  );
}
