/**
 * obj-22 — objective media tag/filter helpers (P5-D4). Pure, deterministic.
 */

import { describe, expect, it } from "vitest";
import {
  OBJECTIVE_ATTACHMENT_CATEGORY,
  attachmentFilename,
  filterObjectiveAttachments,
  isImageAttachment,
  isObjectiveAttachment,
} from "@/lib/cockpit/objective-media";
import type { PrescriptionAttachment } from "@/types/prescription";

function att(overrides: Partial<PrescriptionAttachment>): PrescriptionAttachment {
  return {
    id: "a1",
    prescription_id: "rx-1",
    file_path: "doc-1/rx-1/uuid-file.jpg",
    file_type: "image/jpeg",
    caption: null,
    uploaded_at: "2026-06-19T00:00:00Z",
    ...overrides,
  };
}

describe("isObjectiveAttachment", () => {
  it("is true for an objective-tagged path segment", () => {
    expect(
      isObjectiveAttachment({ file_path: "doc-1/rx-1/objective/uuid-wound.jpg" }),
    ).toBe(true);
  });

  it("is false for a legacy photo-Rx path (no objective segment)", () => {
    expect(isObjectiveAttachment({ file_path: "doc-1/rx-1/uuid-rx.jpg" })).toBe(false);
  });

  it("does not false-positive on a filename that merely contains the word", () => {
    // The category is a discrete path segment, not a substring of the filename.
    expect(
      isObjectiveAttachment({ file_path: "doc-1/rx-1/uuid-objective-summary.jpg" }),
    ).toBe(false);
  });

  it("uses the shared category constant", () => {
    expect(
      isObjectiveAttachment({ file_path: `doc-1/rx-1/${OBJECTIVE_ATTACHMENT_CATEGORY}/x.jpg` }),
    ).toBe(true);
  });
});

describe("filterObjectiveAttachments", () => {
  it("returns only objective-tagged attachments, preserving order", () => {
    const list = [
      att({ id: "legacy", file_path: "doc-1/rx-1/uuid-rx.jpg" }),
      att({ id: "obj-a", file_path: "doc-1/rx-1/objective/uuid-a.jpg" }),
      att({ id: "obj-b", file_path: "doc-1/rx-1/objective/uuid-b.png" }),
    ];
    expect(filterObjectiveAttachments(list).map((a) => a.id)).toEqual(["obj-a", "obj-b"]);
  });

  it("returns empty when there is no objective media", () => {
    expect(filterObjectiveAttachments([att({ file_path: "doc-1/rx-1/uuid-rx.jpg" })])).toEqual([]);
  });
});

describe("isImageAttachment", () => {
  it("is true for image mime types, false for PDF / null", () => {
    expect(isImageAttachment({ file_type: "image/png" })).toBe(true);
    expect(isImageAttachment({ file_type: "application/pdf" })).toBe(false);
    expect(isImageAttachment({ file_type: null })).toBe(false);
  });
});

describe("attachmentFilename", () => {
  it("strips the uuid prefix the uploader prepends", () => {
    expect(
      attachmentFilename({
        file_path: "doc-1/rx-1/objective/0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d-ecg.png",
      }),
    ).toBe("ecg.png");
  });

  it("falls back to the last segment when there is no uuid prefix", () => {
    expect(attachmentFilename({ file_path: "doc-1/rx-1/objective/scan.pdf" })).toBe("scan.pdf");
  });
});
