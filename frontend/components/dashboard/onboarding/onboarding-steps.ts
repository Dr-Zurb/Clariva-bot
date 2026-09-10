/**
 * Shared go-live step definitions (doctor-onboarding-v1 + getting-started-verify-step).
 * Deep-link into existing setup / verification pages — no form rebuild (ONB-D3, GS-D2).
 *
 * Verification is checklist step 1 in the UI only (GS-D6) — not part of the
 * onboarding status API payload.
 */

import type { OnboardingStatus, VerificationStatus } from "@/lib/api";

export type OnboardingStepId =
  | "instagram"
  | "practice"
  | "pricing"
  | "availability";

export type ChecklistStepId = "verify" | "recording_attestation" | OnboardingStepId;

export interface OnboardingStepDef {
  id: OnboardingStepId;
  title: string;
  description: string;
  href: string;
  cta: string;
  doneKey: keyof Pick<
    OnboardingStatus,
    | "instagramConnected"
    | "practiceInfoSet"
    | "pricingSet"
    | "availabilitySet"
  >;
}

/** Render-ready row for Getting started + cockpit preview (GS-D4). */
export interface ChecklistStepView {
  id: ChecklistStepId;
  title: string;
  description: string;
  href: string;
  cta: string;
  done: boolean;
  /** When set, show status text instead of a CTA (e.g. pending review). */
  statusLabel?: string;
}

export const ONBOARDING_STEPS: readonly OnboardingStepDef[] = [
  {
    id: "instagram",
    title: "Connect socials",
    description:
      "Link Instagram or Facebook so patient DMs and comments can become bookings.",
    href: "/dashboard/settings/integrations",
    cta: "Connect socials",
    doneKey: "instagramConnected",
  },
  {
    id: "practice",
    title: "Add practice info",
    description: "Practice name, timezone, and specialty so booking messages are correct.",
    href: "/dashboard/settings/practice-setup/practice-info",
    cta: "Add practice info",
    doneKey: "practiceInfoSet",
  },
  {
    id: "pricing",
    title: "Set pricing",
    description: "Choose a fee or services catalog so patients can book a paid consult.",
    href: "/dashboard/settings/practice-setup/services-catalog",
    cta: "Set pricing",
    doneKey: "pricingSet",
  },
  {
    id: "availability",
    title: "Set availability",
    description: "Add your weekly hours so there are slots patients can book into.",
    href: "/dashboard/settings/practice-setup/availability",
    cta: "Set availability",
    doneKey: "availabilitySet",
  },
] as const;

function verifyStepView(
  status: VerificationStatus | undefined,
): ChecklistStepView {
  const base = {
    id: "verify" as const,
    title: "Get verified",
    href: "/dashboard/get-verified",
  };

  if (status === "verified") {
    return {
      ...base,
      description:
        "Medical registration confirmed — you can connect socials and go patient-facing.",
      cta: "Get verified",
      done: true,
    };
  }

  if (status === "pending_review") {
    return {
      ...base,
      description:
        "We’re reviewing your medical registration — usually within 1–2 business days.",
      cta: "Get verified",
      done: false,
      statusLabel: "Under review",
    };
  }

  if (status === "changes_requested") {
    return {
      ...base,
      description:
        "Our team left a short note — update your submission to continue verification.",
      cta: "Update documents",
      done: false,
    };
  }

  if (status === "rejected") {
    return {
      ...base,
      description:
        "Verification needs attention — fix the issue and resubmit your documents.",
      cta: "Fix & resubmit",
      done: false,
    };
  }

  // unverified or unknown (query still settling / error) → prompt to start.
  return {
    ...base,
    description:
      "Halo Aid is for licensed doctors only. Confirm your registration to go patient-facing.",
    cta: "Get verified",
    done: false,
  };
}

function recordingAttestationStepView(accepted: boolean | undefined): ChecklistStepView {
  return {
    id: "recording_attestation",
    title: "Accept recording terms",
    description:
      "Audio is recorded on every voice and video consult. Review the six clauses before you start seeing patients.",
    href: "/dashboard/recording-attestation",
    cta: accepted ? "View attestation" : "Review & accept",
    done: accepted === true,
  };
}

/** Full go-live checklist: verify first, then attestation (skippable), then setup. */
export function buildGoLiveChecklist(
  onboarding: OnboardingStatus,
  verificationStatus: VerificationStatus | undefined,
  recordingAttested?: boolean,
): ChecklistStepView[] {
  const verify = verifyStepView(verificationStatus);
  const attestation = recordingAttestationStepView(recordingAttested);
  const setup = ONBOARDING_STEPS.map((step) => ({
    id: step.id,
    title: step.title,
    description: step.description,
    href: step.href,
    cta: step.cta,
    done: onboarding[step.doneKey],
  }));
  return [verify, attestation, ...setup];
}

export function remainingGoLiveSteps(
  onboarding: OnboardingStatus,
  verificationStatus: VerificationStatus | undefined,
  recordingAttested?: boolean,
): ChecklistStepView[] {
  return buildGoLiveChecklist(onboarding, verificationStatus, recordingAttested).filter(
    (step) => !step.done,
  );
}

/** True when setup booleans are done and license is verified (GS-D5). */
export function isGoLiveComplete(
  onboarding: OnboardingStatus,
  verificationStatus: VerificationStatus | undefined,
): boolean {
  return onboarding.complete && verificationStatus === "verified";
}
