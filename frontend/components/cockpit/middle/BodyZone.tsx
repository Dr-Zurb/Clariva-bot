"use client";

/**
 * BodyZone — template-aware wrapper around <ConsultationBodyPane>.
 * Owns OUTER container concerns (min-height, overflow, role attributes)
 * so the underlying ConsultationBodyPane's modality inference stays
 * focused on rendering the correct modality content (video tile, voice
 * controls, chat thread).
 *
 * Source plan DL-4: the Body refactor doesn't touch ConsultationBodyPane's
 * existing modality inference. This wrapper supplies the container
 * affordances each modality needs at the smaller size budgets defined by
 * the modality templates (Voice 15%, Text 40%, Video 50%).
 *
 * @see frontend/components/patient-profile/panes/ConsultationBodyPane.tsx
 * @see frontend/lib/patient-profile/templates.tsx — variants reference
 *      `bodyVariant: 'video' | 'voice' | 'text' | 'review'` from tmr-01.
 */

import type { ComponentProps } from "react";
import { useEffect } from "react";
import ConsultationBodyPane from "@/components/patient-profile/panes/ConsultationBodyPane";
import { trackCockpitV2RMiddleBodyRefactored } from "@/lib/patient-profile/telemetry";

type ConsultationBodyPaneProps = ComponentProps<typeof ConsultationBodyPane>;

export interface BodyZoneProps extends ConsultationBodyPaneProps {
  /**
   * Template variant supplied by `templates.tsx`. Used to pick the
   * appropriate min-height / overflow class. Drives ARIA labeling.
   */
  variant: "video" | "voice" | "text";
}

const VARIANT_CLASS: Record<BodyZoneProps["variant"], string> = {
  video: "min-h-[280px] overflow-hidden",
  voice: "min-h-[60px] overflow-hidden",
  text: "min-h-[200px] overflow-y-auto",
};

const VARIANT_LABEL: Record<BodyZoneProps["variant"], string> = {
  video: "Video consultation surface",
  voice: "Voice consultation controls",
  text: "Text consultation thread",
};

export function BodyZone({ variant, ...passthrough }: BodyZoneProps) {
  useEffect(() => {
    trackCockpitV2RMiddleBodyRefactored({
      appointmentId: passthrough.appointment?.id ?? "unknown",
      variant,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  return (
    <div
      role="region"
      aria-label={VARIANT_LABEL[variant]}
      className={`flex h-full w-full flex-col ${VARIANT_CLASS[variant]}`}
    >
      <ConsultationBodyPane {...passthrough} />
    </div>
  );
}
