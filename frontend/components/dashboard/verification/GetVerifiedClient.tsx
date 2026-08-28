"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Clock,
  FileWarning,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import {
  VERIFICATION_ALLOWED_MIME,
  getVerificationUploadUrl,
  submitVerification,
  type VerificationDocKind,
} from "@/lib/api";
import { useVerificationStatusQuery } from "@/hooks/queries/useVerificationStatusQuery";

/** Private bucket provisioned in migration 184. */
const VERIFICATION_DOCS_BUCKET = "doctor-verification-docs";
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPT = ".pdf,.jpg,.jpeg,.png";

interface GetVerifiedClientProps {
  token: string;
}

function validateFile(file: File): string | null {
  if (!VERIFICATION_ALLOWED_MIME.includes(file.type as never)) {
    return "Use a PDF, JPG, or PNG file.";
  }
  if (file.size > MAX_FILE_BYTES) {
    return "File is too large (max 10 MB).";
  }
  return null;
}

/**
 * doctor-verification-v1 · ver-03 get-verified surface. Shows live status and,
 * when unverified/rejected, a submit form that uploads docs via signed URLs
 * then posts registration details (→ pending_review).
 */
export function GetVerifiedClient({ token }: GetVerifiedClientProps) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } =
    useVerificationStatusQuery(token);

  const [fullName, setFullName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [councilState, setCouncilState] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [certificate, setCertificate] = useState<File | null>(null);
  const [govId, setGovId] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadDoc(
    kind: VerificationDocKind,
    file: File,
  ): Promise<string> {
    const { data: signed } = await getVerificationUploadUrl(token, {
      kind,
      contentType: file.type,
    });
    const supabase = createClient();
    const { error: uploadErr } = await supabase.storage
      .from(VERIFICATION_DOCS_BUCKET)
      .uploadToSignedUrl(signed.path, signed.token, file);
    if (uploadErr) {
      throw new Error(uploadErr.message || "Upload failed");
    }
    return signed.path;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!fullName.trim() || !registrationNumber.trim() || !councilState.trim()) {
      setError("Please fill in your name, registration number, and council.");
      return;
    }
    if (!certificate) {
      setError("Please upload your registration certificate.");
      return;
    }
    const certErr = validateFile(certificate);
    if (certErr) {
      setError(certErr);
      return;
    }
    if (govId) {
      const idErr = validateFile(govId);
      if (idErr) {
        setError(idErr);
        return;
      }
    }

    setSubmitting(true);
    try {
      const certificatePath = await uploadDoc("certificate", certificate);
      const govIdPath = govId ? await uploadDoc("gov_id", govId) : undefined;

      await submitVerification(token, {
        fullName: fullName.trim(),
        registrationNumber: registrationNumber.trim(),
        councilState: councilState.trim(),
        specialty: specialty.trim() || undefined,
        certificatePath,
        govIdPath,
      });

      await queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.verificationStatus(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div
        className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        role="alert"
      >
        <p>Couldn’t load your verification status.</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => void refetch()}
        >
          Try again
        </Button>
      </div>
    );
  }

  if (data.status === "verified") {
    return (
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-primary" aria-hidden />
        <h2 className="mt-3 text-xl font-semibold text-foreground">
          You’re verified
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your medical registration has been confirmed. You can go patient-facing
          on Halo Aid.
        </p>
      </div>
    );
  }

  if (data.status === "pending_review") {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-center">
        <Clock className="mx-auto h-10 w-10 text-amber-600" aria-hidden />
        <h2 className="mt-3 text-xl font-semibold text-foreground">
          Verification under review
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Thanks — we’ve received your details. Our team reviews new doctors
          within 1–2 business days and you’ll be notified once approved.
        </p>
      </div>
    );
  }

  // unverified | rejected | changes_requested → show the form.
  return (
    <div className="space-y-6">
      {data.status === "changes_requested" && (
        <div
          className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"
          role="status"
        >
          <FileWarning
            className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
            aria-hidden
          />
          <div className="text-sm">
            <p className="font-medium text-foreground">
              A quick update to your documents
            </p>
            {data.rejectReason ? (
              <p className="mt-1 text-muted-foreground">{data.rejectReason}</p>
            ) : null}
            <p className="mt-1 text-muted-foreground">
              Update the details below and re-submit — usually a clearer photo
              or the correct certificate.
            </p>
          </div>
        </div>
      )}

      {data.status === "rejected" && (
        <div
          className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
          role="alert"
        >
          <ShieldAlert
            className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
            aria-hidden
          />
          <div className="text-sm">
            <p className="font-medium text-destructive">
              Your previous submission wasn’t approved
            </p>
            {data.rejectReason ? (
              <p className="mt-1 text-muted-foreground">{data.rejectReason}</p>
            ) : null}
            <p className="mt-1 text-muted-foreground">
              Please correct the details below and re-submit.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="ver-full-name">Full name (as registered)</Label>
          <Input
            id="ver-full-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={submitting}
            autoComplete="name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ver-reg-number">Medical registration number</Label>
          <Input
            id="ver-reg-number"
            value={registrationNumber}
            onChange={(e) => setRegistrationNumber(e.target.value)}
            disabled={submitting}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ver-council">State medical council / NMC</Label>
          <Input
            id="ver-council"
            value={councilState}
            onChange={(e) => setCouncilState(e.target.value)}
            disabled={submitting}
            placeholder="e.g. Maharashtra Medical Council"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ver-specialty">
            Specialty{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="ver-specialty"
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            disabled={submitting}
            placeholder="e.g. Dermatology"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ver-certificate">Registration certificate</Label>
          <Input
            id="ver-certificate"
            type="file"
            accept={ACCEPT}
            disabled={submitting}
            onChange={(e) => setCertificate(e.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted-foreground">
            PDF, JPG, or PNG · up to 10 MB. Stored privately — only Halo Aid’s
            review team can see it.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ver-gov-id">
            Government ID{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="ver-gov-id"
            type="file"
            accept={ACCEPT}
            disabled={submitting}
            onChange={(e) => setGovId(e.target.files?.[0] ?? null)}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive" aria-live="polite">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? (
            "Submitting…"
          ) : (
            <>
              <BadgeCheck />
              Submit for verification
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
