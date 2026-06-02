import { describe, expect, it } from "vitest";
import {
  filterReviews,
  sortPendingByUrgency,
  sortReviews,
} from "@/lib/service-reviews/filter-sort";
import type { ServiceStaffReviewListItem } from "@/types/service-staff-review";

const NOW = Date.parse("2026-05-31T12:00:00.000Z");

function row(
  overrides: Partial<ServiceStaffReviewListItem> & Pick<ServiceStaffReviewListItem, "id">
): ServiceStaffReviewListItem {
  return {
    doctor_id: "doc-1",
    conversation_id: "conv-1",
    patient_id: "pat-1",
    correlation_id: null,
    status: "pending",
    proposed_catalog_service_key: "general",
    proposed_catalog_service_id: null,
    proposed_consultation_modality: null,
    match_confidence: "medium",
    match_reason_codes: [],
    candidate_labels: [],
    created_at: "2026-05-31T10:00:00.000Z",
    updated_at: "2026-05-31T10:00:00.000Z",
    resolved_at: null,
    resolved_by_user_id: null,
    final_catalog_service_key: null,
    final_catalog_service_id: null,
    final_consultation_modality: null,
    resolution_internal_note: null,
    patient_display_name: "Alice Example",
    reason_for_visit_preview: null,
    ...overrides,
  };
}

const labelForKey = (key: string) => (key === "followup" ? "Follow-up visit" : "General consult");

describe("filterReviews", () => {
  const rows = [
    row({ id: "a", patient_display_name: "Alice Example", proposed_catalog_service_key: "general", match_confidence: "high" }),
    row({ id: "b", patient_display_name: "Bob Smith", proposed_catalog_service_key: "followup", match_confidence: "low" }),
    row({ id: "c", patient_display_name: "Carol Jones", proposed_catalog_service_key: "special", match_confidence: "medium" }),
  ];

  it("matches patient name case-insensitively", () => {
    expect(filterReviews(rows, { query: "alice", confidence: "all", labelForKey }).map((r) => r.id)).toEqual(["a"]);
  });

  it("matches service label and service_key case-insensitively", () => {
    expect(filterReviews(rows, { query: "follow-up", confidence: "all", labelForKey }).map((r) => r.id)).toEqual(["b"]);
    expect(filterReviews(rows, { query: "SPECIAL", confidence: "all", labelForKey }).map((r) => r.id)).toEqual(["c"]);
  });

  it("excludes non-matching rows", () => {
    expect(filterReviews(rows, { query: "zzzzz", confidence: "all", labelForKey })).toEqual([]);
  });

  it('"Low only" returns only low-confidence rows; "all" returns everything', () => {
    expect(filterReviews(rows, { query: "", confidence: "low", labelForKey }).map((r) => r.id)).toEqual(["b"]);
    expect(filterReviews(rows, { query: "", confidence: "all", labelForKey })).toHaveLength(3);
  });
});

describe("sortReviews", () => {
  const rows = [
    row({
      id: "late",
      sla_deadline_at: "2026-05-31T14:00:00.000Z",
      created_at: "2026-05-31T08:00:00.000Z",
      match_confidence: "medium",
    }),
    row({
      id: "soon",
      sla_deadline_at: "2026-05-31T12:30:00.000Z",
      created_at: "2026-05-31T09:00:00.000Z",
      match_confidence: "high",
    }),
    row({
      id: "null-old",
      sla_deadline_at: null,
      created_at: "2026-05-31T07:00:00.000Z",
      match_confidence: "low",
    }),
    row({
      id: "null-new",
      sla_deadline_at: null,
      created_at: "2026-05-31T11:00:00.000Z",
      match_confidence: "low",
    }),
  ];

  it("urgent sort matches sortPendingByUrgency output", () => {
    expect(sortReviews(rows, "urgent", NOW).map((r) => r.id)).toEqual(
      sortPendingByUrgency(rows).map((r) => r.id)
    );
  });

  it("newest and oldest order by created_at", () => {
    expect(sortReviews(rows, "newest", NOW).map((r) => r.id)).toEqual([
      "null-new",
      "soon",
      "late",
      "null-old",
    ]);
    expect(sortReviews(rows, "oldest", NOW).map((r) => r.id)).toEqual([
      "null-old",
      "late",
      "soon",
      "null-new",
    ]);
  });

  it("confidence sort orders high to low", () => {
    expect(sortReviews(rows, "confidence", NOW).map((r) => r.id)).toEqual([
      "soon",
      "late",
      "null-old",
      "null-new",
    ]);
  });
});

describe("filter + sort pipeline", () => {
  it('empty query + "all" + "urgent" is a no-op vs Phase 1 pipeline', () => {
    const rows = [
      row({ id: "a", sla_deadline_at: "2026-05-31T13:00:00.000Z" }),
      row({ id: "b", sla_deadline_at: "2026-05-31T12:15:00.000Z" }),
    ];
    const filtered = filterReviews(rows, { query: "", confidence: "all", labelForKey });
    expect(sortReviews(filtered, "urgent", NOW).map((r) => r.id)).toEqual(
      sortPendingByUrgency(rows).map((r) => r.id)
    );
  });
});
