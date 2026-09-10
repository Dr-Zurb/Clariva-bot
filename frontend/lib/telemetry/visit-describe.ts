/**
 * Describe-visit telemetry — counts + enums only (vnb-05 / vnt-05).
 *
 * Prefix `[ehr:rxvisit]`. Signatures must not accept the paragraph, a
 * complaint name, a drug string, a quote, or a span (VNB-D7 / VN-DL-11).
 * Accept-rate math happens off-device from these counts.
 *
 * Phase-1 `typed` / `dictated` shapes are frozen (VNT-D8). Those events
 * split det vs AI because that split is the VN-Q6 trust denominator.
 *
 * Phase-2 `transcript` does not copy that split. Under VNT-D4 every
 * transcript item is a confirm card, so det/AI counts measure nothing
 * about trust. The useful measure is items offered vs accepted per
 * consult (and, off-device, consults with a `shown` vs consults with
 * any `accepted`). `shown` carries per-kind offered counts; `accepted`
 * carries `kind` + `count` (always 1 at the emit site).
 */

const PREFIX = "[ehr:rxvisit]";

/**
 * Phase-1 authored sources. `transcript` is a third *event* source
 * (`VisitDescribeEventSource`) emitted only by the transcript-specific
 * functions — widening this union would type VisitDescribeBar to accept
 * a value it must never emit (VNT-D8).
 */
export type VisitDescribeSource = "typed" | "dictated";

export type VisitDescribeTranscriptSource = "transcript";

export type VisitDescribeEventSource =
  | VisitDescribeSource
  | VisitDescribeTranscriptSource;

export type VisitDescribeKind =
  | "subjective"
  | "vitals"
  | "assessment"
  | "investigations"
  | "plan"
  | "prose";

/** Per-group deterministic vs AI counts. Integers only. */
export interface VisitDescribeKindCounts {
  subjectiveDet: number;
  subjectiveAi: number;
  vitalsDet: number;
  vitalsAi: number;
  assessmentAi: number;
  investigationsAi: number;
  planDet: number;
  planAi: number;
  proseDet: number;
}

/**
 * Per-kind offered counts for a transcript proposal. No det/AI split —
 * every item is a confirm card (VNT-D4).
 */
export interface VisitTranscriptKindCounts {
  subjective: number;
  vitals: number;
  assessment: number;
  investigations: number;
  plan: number;
  prose: number;
}

export const EMPTY_VISIT_DESCRIBE_COUNTS: VisitDescribeKindCounts = {
  subjectiveDet: 0,
  subjectiveAi: 0,
  vitalsDet: 0,
  vitalsAi: 0,
  assessmentAi: 0,
  investigationsAi: 0,
  planDet: 0,
  planAi: 0,
  proseDet: 0,
};

export const EMPTY_VISIT_TRANSCRIPT_COUNTS: VisitTranscriptKindCounts = {
  subjective: 0,
  vitals: 0,
  assessment: 0,
  investigations: 0,
  plan: 0,
  prose: 0,
};

function emit(event: string, payload?: Record<string, unknown>): void {
  if (typeof console === "undefined") return;
  try {
    // eslint-disable-next-line no-console
    console.debug(PREFIX, event, payload ?? {});
  } catch {
    // Telemetry must never break capture.
  }
}

/** Proposal ready. Kind counts + source — never the source text. */
export function visitDescribeShown(
  source: VisitDescribeSource,
  counts: VisitDescribeKindCounts
): void {
  emit("shown", { source, ...counts });
}

/** Items accepted on one kind. Det vs AI counts; no item text. */
export function visitDescribeAccepted(
  source: VisitDescribeSource,
  kind: VisitDescribeKind,
  detCount: number,
  aiCount: number
): void {
  emit("accepted", { source, kind, detCount, aiCount });
}

/**
 * Transcript proposal ready. Per-kind offered counts — never a quote,
 * span, or transcript id.
 */
export function visitDescribeTranscriptShown(
  counts: VisitTranscriptKindCounts
): void {
  emit("shown", { source: "transcript" as const, ...counts });
}

/**
 * One transcript item accepted. `count` is the item count (1 at the
 * emit site), not a det/AI split.
 */
export function visitDescribeTranscriptAccepted(
  kind: VisitDescribeKind,
  count: number
): void {
  emit("accepted", { source: "transcript" as const, kind, count });
}

/** Panel dismissed or Keep as typed (no item accept). */
export function visitDescribeDismissed(source: VisitDescribeEventSource): void {
  emit("dismissed", { source });
}
