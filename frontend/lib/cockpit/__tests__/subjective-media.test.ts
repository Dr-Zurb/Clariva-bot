/**
 * sdp-03 — subjective per-complaint media tag/filter helpers (P2-D4). Pure, deterministic.
 */

import { describe, expect, it } from "vitest";
import {
  SUBJECTIVE_ATTACHMENT_CATEGORY,
  collectKnownComplaintIdSegments,
  filterOrphanSubjectiveAttachments,
  filterSubjectiveAttachments,
  filterSubjectiveAttachmentsForComplaint,
  isSubjectiveAttachment,
  sanitizeComplaintIdSegment,
} from "@/lib/cockpit/subjective-media";
import type { PrescriptionAttachment } from "@/types/prescription";

function att(overrides: Partial<PrescriptionAttachment>): PrescriptionAttachment {
  return {
    id: "a1",
    prescription_id: "rx-1",
    file_path: "doc-1/rx-1/uuid-file.jpg",
    file_type: "image/jpeg",
    caption: null,
    uploaded_at: "2026-06-25T00:00:00Z",
    ...overrides,
  };
}

describe("isSubjectiveAttachment", () => {
  it("is true for a subjective-tagged path segment", () => {
    expect(
      isSubjectiveAttachment({ file_path: "doc-1/rx-1/subjective/cmp-7/uuid-rash.jpg" }),
    ).toBe(true);
  });

  it("is false for objective and legacy paths", () => {
    expect(isSubjectiveAttachment({ file_path: "doc-1/rx-1/objective/uuid-wound.jpg" })).toBe(
      false,
    );
    expect(isSubjectiveAttachment({ file_path: "doc-1/rx-1/uuid-rx.jpg" })).toBe(false);
  });

  it("uses the shared category constant", () => {
    expect(
      isSubjectiveAttachment({
        file_path: `doc-1/rx-1/${SUBJECTIVE_ATTACHMENT_CATEGORY}/cmp-1/x.jpg`,
      }),
    ).toBe(true);
  });
});

describe("filterSubjectiveAttachmentsForComplaint", () => {
  it("returns only photos pinned to the given complaint id", () => {
    const list = [
      att({ id: "obj", file_path: "doc-1/rx-1/objective/uuid-wound.jpg" }),
      att({ id: "c1-a", file_path: "doc-1/rx-1/subjective/cmp-1/uuid-a.jpg" }),
      att({ id: "c2-a", file_path: "doc-1/rx-1/subjective/cmp-2/uuid-b.jpg" }),
      att({ id: "c1-b", file_path: "doc-1/rx-1/subjective/cmp-1/uuid-c.jpg" }),
    ];
    expect(filterSubjectiveAttachmentsForComplaint(list, "cmp-1").map((a) => a.id)).toEqual([
      "c1-a",
      "c1-b",
    ]);
    expect(filterSubjectiveAttachmentsForComplaint(list, "cmp-2").map((a) => a.id)).toEqual([
      "c2-a",
    ]);
  });

  it("sanitizes the complaint id segment the same way as the backend", () => {
    const list = [
      att({ id: "safe", file_path: "doc-1/rx-1/subjective/evilid/uuid-rash.jpg" }),
    ];
    expect(
      filterSubjectiveAttachmentsForComplaint(list, "../../evil/id_$$").map((a) => a.id),
    ).toEqual(["safe"]);
  });
});

describe("filterSubjectiveAttachments", () => {
  it("returns all subjective-tagged attachments, preserving order", () => {
    const list = [
      att({ id: "legacy", file_path: "doc-1/rx-1/uuid-rx.jpg" }),
      att({ id: "sub-a", file_path: "doc-1/rx-1/subjective/cmp-1/uuid-a.jpg" }),
      att({ id: "sub-b", file_path: "doc-1/rx-1/subjective/cmp-2/uuid-b.jpg" }),
    ];
    expect(filterSubjectiveAttachments(list).map((a) => a.id)).toEqual(["sub-a", "sub-b"]);
  });
});

describe("sanitizeComplaintIdSegment", () => {
  it("strips unsafe characters and bounds length", () => {
    expect(sanitizeComplaintIdSegment("cmp-7")).toBe("cmp-7");
    expect(sanitizeComplaintIdSegment("../../evil")).toBe("evil");
    expect(sanitizeComplaintIdSegment("")).toBe("unpinned");
  });
});

describe("filterOrphanSubjectiveAttachments (sdp-04 / P2-D3)", () => {
  it("returns subjective photos whose complaint folder matches no current complaint id", () => {
    const list = [
      att({ id: "pinned", file_path: "doc-1/rx-1/subjective/cmp-1/uuid-a.jpg" }),
      att({ id: "orphan", file_path: "doc-1/rx-1/subjective/deleted-cmp/uuid-b.jpg" }),
      att({ id: "unpinned", file_path: "doc-1/rx-1/subjective/unpinned/uuid-c.jpg" }),
    ];
    expect(filterOrphanSubjectiveAttachments(list, ["cmp-1"]).map((a) => a.id)).toEqual([
      "orphan",
      "unpinned",
    ]);
  });

  it("ignores objective and legacy attachments", () => {
    const list = [
      att({ id: "obj", file_path: "doc-1/rx-1/objective/uuid-wound.jpg" }),
      att({ id: "legacy", file_path: "doc-1/rx-1/uuid-rx.jpg" }),
      att({ id: "orphan", file_path: "doc-1/rx-1/subjective/gone/uuid.jpg" }),
    ];
    expect(filterOrphanSubjectiveAttachments(list, []).map((a) => a.id)).toEqual(["orphan"]);
  });
});

describe("collectKnownComplaintIdSegments", () => {
  it("includes nested associated complaint ids", () => {
    const segments = collectKnownComplaintIdSegments([
      {
        id: "main-1",
        associatedComplaints: [{ id: "assoc-1" }],
      },
    ]);
    expect(segments).toEqual(expect.arrayContaining(["main-1", "assoc-1"]));
  });
});
