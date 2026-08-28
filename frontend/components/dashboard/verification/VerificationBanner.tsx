"use client";

import Link from "next/link";
import { ArrowRight, Clock, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useVerificationStatusQuery } from "@/hooks/queries/useVerificationStatusQuery";

interface VerificationBannerProps {
  token: string;
}

/**
 * doctor-verification-v1 · ver-03 §2.2 — surfaces verification status where it
 * blocks go-live (onboarding). Auto-hides when verified or while loading.
 */
export function VerificationBanner({ token }: VerificationBannerProps) {
  const { data, isLoading, isError } = useVerificationStatusQuery(token);

  if (isLoading || isError || !data || data.status === "verified") {
    return null;
  }

  if (data.status === "pending_review") {
    return (
      <section
        aria-labelledby="verification-banner-heading"
        className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"
      >
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600"
        >
          <Clock className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id="verification-banner-heading"
            className="text-sm font-semibold text-foreground"
          >
            Verification under review
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            We’re reviewing your medical registration — usually within 1–2
            business days.
          </p>
        </div>
      </section>
    );
  }

  if (data.status === "changes_requested") {
    return (
      <section
        aria-labelledby="verification-banner-heading"
        className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"
      >
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600"
        >
          <Clock className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id="verification-banner-heading"
            className="text-sm font-semibold text-foreground"
          >
            Quick update needed on your documents
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Our team left a short note — update your submission to continue
            verification.
          </p>
          <Button asChild size="sm" className="mt-3">
            <Link href="/dashboard/get-verified">
              Update documents
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>
    );
  }

  // unverified or rejected → prompt to get verified.
  return (
    <section
      aria-labelledby="verification-banner-heading"
      className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4"
    >
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
      >
        <ShieldCheck className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2
          id="verification-banner-heading"
          className="text-sm font-semibold text-foreground"
        >
          {data.status === "rejected"
            ? "Verification needs attention"
            : "Verify you’re a licensed doctor"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Halo Aid is for licensed doctors only. Confirm your registration to go
          patient-facing.
        </p>
        <Button asChild size="sm" className="mt-3">
          <Link href="/dashboard/get-verified">
            Get verified
            <ArrowRight />
          </Link>
        </Button>
      </div>
    </section>
  );
}
