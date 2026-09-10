/**
 * Unit tests for text-A7 message delivery status derivation.
 */

import { describe, expect, it } from "vitest";
import { deriveMessageDeliveryStatus } from "../MessageStatus";

describe("deriveMessageDeliveryStatus", () => {
  it("returns sent (single tick) while pending", () => {
    expect(deriveMessageDeliveryStatus({ pending: true })).toBe("sent");
  });

  it("returns none when failed", () => {
    expect(deriveMessageDeliveryStatus({ failed: true })).toBe("none");
  });

  it("returns delivered (double tick) when acked but not read", () => {
    expect(deriveMessageDeliveryStatus({ pending: false, seen: false })).toBe(
      "delivered"
    );
  });

  it("returns read (blue double tick) when seen", () => {
    expect(deriveMessageDeliveryStatus({ seen: true })).toBe("read");
  });
});
