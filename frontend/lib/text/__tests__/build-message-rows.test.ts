/**
 * Unit tests for `frontend/lib/text/build-message-rows.ts` (text-D3).
 */

import { describe, expect, it } from "vitest";
import {
  buildMessageRows,
  countMessagesInRows,
  findMessageRowIndex,
  shouldVirtualizeMessageList,
} from "../build-message-rows";
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

describe("buildMessageRows", () => {
  it("interleaves day separators before the first message of each day", () => {
    const messages = [
      msg({
        id: "a",
        kind: "text",
        senderId: "u1",
        body: "day one",
        createdAt: "2026-04-27T10:00:00.000Z",
      }),
      msg({
        id: "b",
        kind: "text",
        senderId: "u1",
        body: "day two",
        createdAt: "2026-04-28T10:00:00.000Z",
      }),
    ];
    const rows = buildMessageRows(messages);
    expect(rows.map((r) => r.__type)).toEqual(["separator", "single", "separator", "single"]);
    expect(rows[0]).toMatchObject({ __type: "separator", dateISO: "2026-04-27" });
    expect(rows[2]).toMatchObject({ __type: "separator", dateISO: "2026-04-28" });
  });

  it("emits batch rows for multi-attachment groups", () => {
    const batchId = "batch-1";
    const m1 = msg({
      id: "1",
      kind: "attachment",
      senderId: "u1",
      batch_id: batchId,
      attachmentUrl: "p1",
    });
    const m2 = msg({
      id: "2",
      kind: "attachment",
      senderId: "u1",
      batch_id: batchId,
      attachmentUrl: "p2",
      createdAt: "2026-04-28T10:00:01.000Z",
    });
    const rows = buildMessageRows([m1, m2]);
    expect(rows.filter((r) => r.__type !== "separator")).toEqual([
      expect.objectContaining({ __type: "batch", batchId, messages: [m1, m2] }),
    ]);
  });

  it("findMessageRowIndex resolves singles and batch members", () => {
    const batchId = "batch-x";
    const single = msg({ id: "solo", kind: "text", senderId: "u1", body: "hi" });
    const b1 = msg({
      id: "b1",
      kind: "attachment",
      senderId: "u1",
      batch_id: batchId,
      attachmentUrl: "p1",
    });
    const b2 = msg({
      id: "b2",
      kind: "attachment",
      senderId: "u1",
      batch_id: batchId,
      attachmentUrl: "p2",
      createdAt: "2026-04-28T10:00:01.000Z",
    });
    const rows = buildMessageRows([single, b1, b2]);
    expect(findMessageRowIndex(rows, "solo")).toBeGreaterThanOrEqual(0);
    expect(findMessageRowIndex(rows, "b2")).toBe(findMessageRowIndex(rows, "b1"));
    expect(findMessageRowIndex(rows, "missing")).toBe(-1);
  });
});

describe("shouldVirtualizeMessageList", () => {
  it("virtualizes only above the message threshold", () => {
    const short = Array.from({ length: 100 }, (_, i) =>
      msg({ id: `m-${i}`, kind: "text", senderId: "u1", body: `msg ${i}` }),
    );
    const shortRows = buildMessageRows(short);
    expect(countMessagesInRows(shortRows)).toBe(100);
    expect(shouldVirtualizeMessageList(shortRows)).toBe(false);

    const long = [
      ...short,
      msg({ id: "m-100", kind: "text", senderId: "u1", body: "one more" }),
    ];
    const longRows = buildMessageRows(long);
    expect(shouldVirtualizeMessageList(longRows)).toBe(true);
  });
});
