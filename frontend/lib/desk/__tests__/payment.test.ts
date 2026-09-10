import { describe, expect, it } from "vitest";
import {
  deskPaidMethodLabels,
  deskPaymentLabel,
  deskPaymentMethodLabel,
  minorToRupeesInput,
  rupeesToMinor,
  visitPaymentById,
} from "@/lib/desk/payment";

describe("deskPaymentLabel", () => {
  it("uses desk words, not waived", () => {
    expect(deskPaymentLabel("paid")).toBe("Paid");
    expect(deskPaymentLabel("no_charge")).toBe("No charge");
    expect(deskPaymentLabel("due")).toBe("—");
    expect(deskPaymentLabel("returned")).toBe("Returned");
    expect(deskPaymentLabel(undefined)).toBe("—");
  });
});

describe("deskPaymentMethodLabel", () => {
  it("names till methods", () => {
    expect(deskPaymentMethodLabel("cash")).toBe("Cash");
    expect(deskPaymentMethodLabel("upi")).toBe("UPI");
    expect(deskPaymentMethodLabel("card")).toBe("Card");
    expect(deskPaidMethodLabels(["cash"])).toBe("Cash");
    expect(deskPaidMethodLabels(["upi", "card"])).toBe("UPI · Card");
    expect(deskPaidMethodLabels(["no_charge"])).toBeNull();
  });
});

describe("visitPaymentById", () => {
  it("finds the visit row", () => {
    const visits = [
      { appointmentId: "a", status: "due" as const, collectedMinor: 0, methods: [] },
      { appointmentId: "b", status: "paid" as const, collectedMinor: 50000, methods: ["cash" as const] },
    ];
    expect(visitPaymentById(visits, "b")?.status).toBe("paid");
    expect(visitPaymentById(visits, "c")).toBeUndefined();
  });
});

describe("rupee conversion", () => {
  it("round-trips whole rupees", () => {
    expect(rupeesToMinor(500)).toBe(50000);
    expect(minorToRupeesInput(50000)).toBe("500");
    expect(minorToRupeesInput(null)).toBe("");
  });
});
