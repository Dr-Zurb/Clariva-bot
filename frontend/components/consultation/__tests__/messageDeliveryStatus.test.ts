/**
 * Unit tests for text-A7 message delivery status derivation.
 */

import { describe, expect, it } from "vitest";
import { deriveMessageDeliveryStatus } from "../MessageStatus";

describe("deriveMessageDeliveryStatus", () => {
  it("returns none while pending", () => {
    expect(deriveMessageDeliveryStatus({ pending: true })).toBe("none");
  });

  it("returns none when failed", () => {
    expect(deriveMessageDeliveryStatus({ failed: true })).toBe("none");
  });

  it("returns delivered when acked but not seen", () => {
    expect(deriveMessageDeliveryStatus({ pending: false, seen: false })).toBe("delivered");
  });

  it("returns seen when seen flag is set", () => {
    expect(deriveMessageDeliveryStatus({ seen: true })).toBe("seen");
  });
});
