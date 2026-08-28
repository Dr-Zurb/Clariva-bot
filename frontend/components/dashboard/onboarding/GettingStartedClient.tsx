"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { OnboardingSteps } from "@/components/dashboard/onboarding/OnboardingSteps";
import {
  buildGoLiveChecklist,
  isGoLiveComplete,
} from "@/components/dashboard/onboarding/onboarding-steps";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOnboardingStatusQuery } from "@/hooks/queries/useOnboardingStatusQuery";
import { useVerificationStatusQuery } from "@/hooks/queries/useVerificationStatusQuery";

interface GettingStartedClientProps {
  token: string;
}

/**
 * Getting-started body — setup status (onb-01) + verification as step 1 (GS-D*).
 */
export function GettingStartedClient({ token }: GettingStartedClientProps) {
  const onboarding = useOnboardingStatusQuery(token);
  const verification = useVerificationStatusQuery(token);

  if (onboarding.isLoading || verification.isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (onboarding.isError || !onboarding.data) {
    return (
      <div
        className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        role="alert"
      >
        <p>Couldn’t load your setup progress.</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => void onboarding.refetch()}
        >
          Try again
        </Button>
      </div>
    );
  }

  const verificationStatus = verification.data?.status;
  const steps = buildGoLiveChecklist(onboarding.data, verificationStatus);

  if (isGoLiveComplete(onboarding.data, verificationStatus)) {
    return (
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 text-center">
        <CheckCircle2
          className="mx-auto h-10 w-10 text-primary"
          aria-hidden
        />
        <h2 className="mt-3 text-xl font-semibold text-foreground">
          You’re set up
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You’re verified, Instagram is connected, and practice basics are in
          place. Patients can book through Halo Aid.
        </p>
        <Button asChild className="mt-5">
          <Link href="/dashboard">
            Go to Today
            <ArrowRight />
          </Link>
        </Button>
      </div>
    );
  }

  return <OnboardingSteps steps={steps} />;
}
