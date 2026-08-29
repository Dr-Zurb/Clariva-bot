/**
 * Build a booking-path journey for the Inbox detail pane:
 * reached steps are done/current; remaining core steps stay upcoming (greyed).
 */

import type {
  InteractionTimelineStep,
  InteractionTimelineStepType,
} from "@/lib/api";

/** Core funnel order shown in the Path stepper (optional comment when present). */
export const INBOX_JOURNEY_CORE = [
  "comment_captured",
  "first_dm",
  "booking_started",
  "slot_selected",
  "booked",
  "paid",
] as const satisfies readonly InteractionTimelineStepType[];

export type InboxJourneyNodeState = "done" | "current" | "upcoming";

export type InboxJourneyNode = {
  type: InteractionTimelineStepType;
  label: string;
  at: string | null;
  state: InboxJourneyNodeState;
};

export type InboxPathJourney = {
  nodes: InboxJourneyNode[];
  /** Side events not in the core funnel (review / reschedule). */
  extras: InteractionTimelineStep[];
};

/** Doctor-facing copy — aligned with Inbox sidebar funnel labels where they map. */
const LABELS: Record<InteractionTimelineStepType, string> = {
  comment_captured: "Commented",
  first_dm: "Chatting",
  booking_started: "Booking in progress",
  slot_selected: "Slot picked",
  needs_review: "Needs review",
  booked: "On calendar",
  paid: "Confirmed",
  rescheduled: "Rescheduled",
};

export function journeyStepLabel(type: InteractionTimelineStepType): string {
  return LABELS[type] ?? type;
}

export function buildInboxPathJourney(
  steps: readonly InteractionTimelineStep[]
): InboxPathJourney {
  const byType = new Map<InteractionTimelineStepType, InteractionTimelineStep>();
  for (const step of steps) {
    const prev = byType.get(step.type);
    if (!prev || prev.at < step.at) byType.set(step.type, step);
  }

  const includeComment = byType.has("comment_captured");
  const core = INBOX_JOURNEY_CORE.filter(
    (t) => t !== "comment_captured" || includeComment
  );

  let lastReached = -1;
  for (let i = 0; i < core.length; i++) {
    if (byType.has(core[i]!)) lastReached = i;
  }

  const nodes: InboxJourneyNode[] = core.map((type, i) => {
    const hit = byType.get(type) ?? null;
    let state: InboxJourneyNodeState = "upcoming";
    if (lastReached < 0) {
      state = "upcoming";
    } else if (i < lastReached) {
      state = "done";
    } else if (i === lastReached) {
      state = "current";
    }
    return {
      type,
      label: journeyStepLabel(type),
      at: hit?.at ?? null,
      state,
    };
  });

  const extras = steps.filter(
    (s) => s.type === "needs_review" || s.type === "rescheduled"
  );

  return { nodes, extras };
}

export type InboxPathSummary = {
  /** Current (or last reached) node for compact display. */
  current: InboxJourneyNode | null;
  /** 1-based index among core nodes (0 when nothing reached). */
  reachedIndex: number;
  total: number;
  /** Needs review / reschedule — prefer expanded Path for this interaction. */
  hasActionExtras: boolean;
};

/** Compact Path chip: current stage + progress among core funnel nodes. */
export function summarizeInboxPathJourney(
  journey: InboxPathJourney
): InboxPathSummary {
  const total = journey.nodes.length;
  const currentIdx = journey.nodes.findIndex((n) => n.state === "current");
  if (currentIdx >= 0) {
    return {
      current: journey.nodes[currentIdx] ?? null,
      reachedIndex: currentIdx + 1,
      total,
      hasActionExtras: journey.extras.length > 0,
    };
  }
  let lastDone = -1;
  for (let i = 0; i < journey.nodes.length; i++) {
    if (journey.nodes[i]?.state === "done") lastDone = i;
  }
  if (lastDone >= 0) {
    return {
      current: journey.nodes[lastDone] ?? null,
      reachedIndex: lastDone + 1,
      total,
      hasActionExtras: journey.extras.length > 0,
    };
  }
  return {
    current: null,
    reachedIndex: 0,
    total,
    hasActionExtras: journey.extras.length > 0,
  };
}
