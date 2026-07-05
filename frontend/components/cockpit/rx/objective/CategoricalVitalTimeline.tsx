"use client";

/**
 * Categorical vital value-timeline (vitals-section · vit-12).
 *
 * Labelled chips by visit — oldest → newest. Never a line chart over categories.
 */

import type { CategoricalVitalTimeline } from "@/lib/cockpit/categorical-vitals-timeline";

export interface CategoricalVitalTimelineProps {
  timeline: CategoricalVitalTimeline;
}

export function CategoricalVitalTimeline({
  timeline,
}: CategoricalVitalTimelineProps): JSX.Element {
  const visitCount = timeline.points.length;
  const ariaDescription =
    visitCount === 1
      ? `${timeline.label} value timeline across 1 visit.`
      : `${timeline.label} value timeline across ${visitCount} visits.`;

  return (
    <figure aria-label={ariaDescription}>
      <figcaption className="sr-only">{ariaDescription}</figcaption>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{timeline.label}</p>
      <ol
        className="flex flex-wrap gap-2"
        aria-label={`${timeline.label} readings by visit`}
      >
        {timeline.points.map((point) => (
          <li key={point.at} className="flex flex-col items-center gap-0.5">
            <span className="inline-flex rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-foreground">
              {point.label}
            </span>
            <span className="text-[10px] text-muted-foreground">{point.visitLabel}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
