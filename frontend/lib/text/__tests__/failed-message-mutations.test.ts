import { describe, expect, it } from "vitest";
import {
  discardFailedMessage,
  markMessageRetrying,
} from "../failed-message-mutations";

describe("markMessageRetrying", () => {
  it("preserves array index when retrying a failed message", () => {
    const messages = [
      { id: "a", body: "one" },
      { id: "b", body: "two", failed: true, retryBody: "two" },
      { id: "c", body: "three" },
    ];
    const result = markMessageRetrying(messages, "b");
    expect(result.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(result[1]).toMatchObject({
      id: "b",
      pending: true,
      failed: false,
      retryBody: "two",
    });
    expect(result[0]).toEqual(messages[0]);
    expect(result[2]).toEqual(messages[2]);
  });

  it("only updates the targeted localId", () => {
    const messages = [
      { id: "a", failed: true },
      { id: "b", failed: true },
      { id: "c", failed: true },
    ];
    const result = markMessageRetrying(messages, "b");
    expect(result[0].failed).toBe(true);
    expect(result[1].failed).toBe(false);
    expect(result[2].failed).toBe(true);
  });

  it("clears the failureReason tag on retry (text-D5)", () => {
    const messages = [
      {
        id: "a",
        failed: true,
        failureReason: "rate-limited" as const,
        retryBody: "hi",
      },
      { id: "b", failed: false },
    ];
    const result = markMessageRetrying(messages, "a");
    expect(result[0]).toMatchObject({
      id: "a",
      pending: true,
      failed: false,
      failureReason: undefined,
      retryBody: "hi",
    });
    expect(result[1]).toEqual(messages[1]);
  });
});

describe("discardFailedMessage", () => {
  it("removes only the targeted failed bubble", () => {
    const messages = [
      { id: "a", failed: true },
      { id: "b", failed: true },
      { id: "c", failed: true },
    ];
    expect(discardFailedMessage(messages, "b").map((m) => m.id)).toEqual([
      "a",
      "c",
    ]);
  });
});
