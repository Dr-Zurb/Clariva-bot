/**
 * Unit tests for `frontend/lib/text/group-messages.ts` (text-B8).
 */

import { describe, expect, it } from "vitest";
import { groupMessages } from "../group-messages";
import type { ConsultationMessage } from "../types";

function msg(
  partial: Partial<ConsultationMessage> & Pick<ConsultationMessage, "id" | "senderId" | "kind">,
): ConsultationMessage {
  return {
    sessionId: "s1",
    senderRole: "patient",
    body: "",
    createdAt: "2026-04-28T10:00:00.000Z",
    ...partial,
  };
}

describe("groupMessages", () => {
  it("returns singles when batch_id is absent", () => {
    const messages = [
      msg({ id: "a", kind: "text", senderId: "u1", body: "hi" }),
      msg({ id: "b", kind: "attachment", senderId: "u1", attachmentUrl: "p1" }),
    ];
    const groups = groupMessages(messages);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual({ type: "single", message: messages[0] });
    expect(groups[1]).toEqual({ type: "single", message: messages[1] });
  });

  it("keeps a lone batch_id row as a single bubble", () => {
    const lone = msg({
      id: "b",
      kind: "attachment",
      senderId: "u1",
      batch_id: "batch-1",
      attachmentUrl: "p1",
    });
    const groups = groupMessages([lone]);
    expect(groups).toEqual([{ type: "single", message: lone }]);
  });

  it("groups consecutive same-sender rows with the same batch_id", () => {
    const batchId = "batch-abc";
    const m1 = msg({
      id: "1",
      kind: "attachment",
      senderId: "u1",
      batch_id: batchId,
      body: "Lab results",
      createdAt: "2026-04-28T10:00:01.000Z",
      attachmentUrl: "p1",
    });
    const m2 = msg({
      id: "2",
      kind: "attachment",
      senderId: "u1",
      batch_id: batchId,
      createdAt: "2026-04-28T10:00:02.000Z",
      attachmentUrl: "p2",
    });
    const m3 = msg({
      id: "3",
      kind: "attachment",
      senderId: "u1",
      batch_id: batchId,
      createdAt: "2026-04-28T10:00:03.000Z",
      attachmentUrl: "p3",
    });
    const groups = groupMessages([m1, m2, m3]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual({
      type: "batch",
      messages: [m1, m2, m3],
      batchId,
    });
  });

  it("splits batches when sender or batch_id changes", () => {
    const batchA = "batch-a";
    const a1 = msg({
      id: "1",
      kind: "attachment",
      senderId: "u1",
      batch_id: batchA,
      attachmentUrl: "p1",
    });
    const a2 = msg({
      id: "2",
      kind: "attachment",
      senderId: "u2",
      batch_id: batchA,
      attachmentUrl: "p2",
    });
    const groups = groupMessages([a1, a2]);
    expect(groups).toHaveLength(2);
    expect(groups[0].type).toBe("single");
    expect(groups[1].type).toBe("single");
  });

  it("does not merge non-consecutive batch rows", () => {
    const batchId = "batch-x";
    const first = msg({
      id: "1",
      kind: "attachment",
      senderId: "u1",
      batch_id: batchId,
      attachmentUrl: "p1",
    });
    const text = msg({ id: "t", kind: "text", senderId: "u1", body: "between" });
    const second = msg({
      id: "2",
      kind: "attachment",
      senderId: "u1",
      batch_id: batchId,
      attachmentUrl: "p2",
    });
    const groups = groupMessages([first, text, second]);
    expect(groups.map((g) => g.type)).toEqual(["single", "single", "single"]);
  });
});
