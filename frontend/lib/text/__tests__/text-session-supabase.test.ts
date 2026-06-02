import { describe, expect, it } from "vitest";
import { projectConsultationMessageRow } from "../text-session-supabase";

describe("projectConsultationMessageRow", () => {
  it("returns the row unchanged when not deleted", () => {
    const row = {
      body: "still here",
      deleted_at: null,
      attachment_url: "path/img.jpg",
    };
    expect(projectConsultationMessageRow(row)).toEqual(row);
  });

  it("nulls body and attachment fields when deleted_at is set", () => {
    const row = {
      body: "secret dose",
      deleted_at: "2026-04-28T10:16:00.000Z",
      attachment_url: "path/img.jpg",
      attachment_mime_type: "image/jpeg",
      attachment_byte_size: 1024,
      metadata: { note: "x" },
    };
    expect(projectConsultationMessageRow(row)).toEqual({
      body: null,
      deleted_at: row.deleted_at,
      attachment_url: null,
      attachment_mime_type: null,
      attachment_byte_size: null,
      metadata: null,
    });
  });
});
