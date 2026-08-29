"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { acceptRecordingAttestation } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { useRecordingAttestationQuery } from "@/hooks/queries/useRecordingAttestationQuery";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface RecordingAttestationClientProps {
  token: string;
}

export function RecordingAttestationClient({
  token,
}: RecordingAttestationClientProps) {
  const query = useRecordingAttestationQuery(token);
  const queryClient = useQueryClient();
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (query.isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Couldn’t load the recording attestation.
      </p>
    );
  }

  const { accepted, policyVersion, acceptedAt, clauses } = query.data;

  const handleAccept = async () => {
    setError(null);
    setAccepting(true);
    try {
      await acceptRecordingAttestation(token);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.recordingAttestation(),
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not record acceptance",
      );
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="space-y-6">
      <ol className="list-decimal space-y-3 pl-5 text-sm text-foreground">
        {clauses.map((clause) => (
          <li key={clause}>{clause}</li>
        ))}
      </ol>

      {accepted && acceptedAt ? (
        <p className="text-sm text-muted-foreground">
          Accepted version {policyVersion} on{" "}
          {new Date(acceptedAt).toLocaleString()}.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            One acceptance covers all six clauses. Version {policyVersion}{" "}
            (draft — pending REC-D2).
          </p>
          <Button
            type="button"
            onClick={() => void handleAccept()}
            disabled={accepting}
          >
            {accepting ? "Saving…" : "I accept these terms"}
          </Button>
        </div>
      )}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
