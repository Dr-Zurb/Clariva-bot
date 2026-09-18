import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import BookPage from "../page";

const getSlotPageInfo = vi.fn();
const getDaySlots = vi.fn();
const selectSlotAndPay = vi.fn();

vi.mock("@/lib/api", () => ({
  getSlotPageInfo: (...args: unknown[]) => getSlotPageInfo(...args),
  getDaySlots: (...args: unknown[]) => getDaySlots(...args),
  selectSlotAndPay: (...args: unknown[]) => selectSlotAndPay(...args),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("token=test-token"),
}));

describe("Book page intake (mca-14)", () => {
  beforeEach(() => {
    getSlotPageInfo.mockReset();
    getDaySlots.mockReset();
    selectSlotAndPay.mockReset();
    getSlotPageInfo.mockResolvedValue({
      data: {
        practiceName: "Test Clinic",
        mode: "book",
        opdMode: "slot",
        bookingAllowed: true,
      },
    });
    getDaySlots.mockResolvedValue({
      data: {
        timezone: "Asia/Kolkata",
        opdMode: "slot",
        slots: [
          {
            start: "2099-01-15T04:30:00.000Z",
            end: "2099-01-15T04:45:00.000Z",
            status: "available",
          },
        ],
      },
    });
  });

  it("shows owned-page details and keeps checkout off until consent", async () => {
    render(<BookPage />);
    expect(await screen.findByLabelText("Full name")).toBeInTheDocument();
    expect(screen.getByLabelText("Phone")).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Reason for visit" })
    ).toBeInTheDocument();
    const consent = screen.getByRole("checkbox");
    expect(consent).not.toBeChecked();

    const continueBtn = screen.getByRole("button", {
      name: /continue to payment/i,
    });
    expect(continueBtn).toBeDisabled();
    expect(selectSlotAndPay).not.toHaveBeenCalled();
  });

  it("sends intake on checkout after name, phone, reason, and consent", async () => {
    selectSlotAndPay.mockResolvedValue({
      data: {
        paymentUrl: null,
        redirectUrl: "https://ig.me/test",
        appointmentId: "appt-1",
        mode: "book",
        opdMode: "slot",
      },
    });

    render(<BookPage />);
    fireEvent.change(await screen.findByLabelText("Full name"), {
      target: { value: "Test Patient" },
    });
    fireEvent.change(screen.getByLabelText("Phone"), {
      target: { value: "+919876543210" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Reason for visit" }), {
      target: { value: "Follow-up" },
    });
    fireEvent.click(screen.getByRole("checkbox"));

    const timeBtn = await screen.findByRole("button", { name: "10:00" });
    fireEvent.click(timeBtn);

    const continueBtn = screen.getByRole("button", {
      name: /continue to payment/i,
    });
    await waitFor(() => expect(continueBtn).not.toBeDisabled());
    fireEvent.click(continueBtn);

    await waitFor(() => expect(selectSlotAndPay).toHaveBeenCalled());
    const args = selectSlotAndPay.mock.calls[0] as unknown[];
    expect(args[0]).toBe("test-token");
    expect(args[3]).toEqual({
      patientName: "Test Patient",
      patientPhone: "+919876543210",
      reasonForVisit: "Follow-up",
      consentGranted: true,
    });
  });
});
