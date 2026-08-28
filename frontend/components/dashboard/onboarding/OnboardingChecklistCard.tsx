"use client";

import Link from "next/link";
import { ArrowRight, ListChecks } from "lucide-react";

import {
  isGoLiveComplete,
  remainingGoLiveSteps,
} from "@/components/dashboard/onboarding/onboarding-steps";
import { Button } from "@/components/ui/button";
import { useOnboardingStatusQuery } from "@/hooks/queries/useOnboardingStatusQuery";
import { useVerificationStatusQuery } from "@/hooks/queries/useVerificationStatusQuery";

interface OnboardingChecklistCardProps {
  token: string;
}

/**
 * Compact "Finish setup" card for the Today cockpit (onb-03 + GS-D*).
 * Auto-hides when go-live complete (setup + verified) or while loading.
 */
export function OnboardingChecklistCard({ token }: OnboardingChecklistCardProps) {
  const onboarding = useOnboardingStatusQuery(token);
  const verification = useVerificationStatusQuery(token);

  if (
    onboarding.isLoading ||
    verification.isLoading ||
    onboarding.isError ||
    !onboarding.data
  ) {
    return null;
  }

  const verificationStatus = verification.data?.status;
  if (isGoLiveComplete(onboarding.data, verificationStatus)) {
    return null;
  }

  const remaining = remainingGoLiveSteps(onboarding.data, verificationStatus);
  const preview = remaining.slice(0, 2);

  return (
    <section
      aria-labelledby="onboarding-checklist-heading"
      className="rounded-xl border border-primary/20 bg-primary/5 p-4"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
        >
          <ListChecks className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id="onboarding-checklist-heading"
            className="text-sm font-semibold text-foreground"
          >
            Finish setup · {remaining.length} remaining
          </h2>
          <ul className="mt-2 space-y-1.5">
            {preview.map((step) => (
              <li key={step.id}>
                <Link
                  href={step.href}
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  {step.title}
                </Link>
              </li>
            ))}
          </ul>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link href="/dashboard/getting-started">
              See all
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
