import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PublicClinicBookPage } from "../page";
import SuccessPage from "../../book/success/page";

const getPublicClinicPageInfo = vi.fn();
const getPublicClinicDaySlots = vi.fn();
const getPublicChatVisits = vi.fn();
const postPublicClinicCheckout = vi.fn();

let search = "";

vi.mock("@/lib/api", () => ({
  getSlotPageInfo: vi.fn(),
  getDaySlots: vi.fn(),
  selectSlotAndPay: vi.fn(),
  getBookingRedirectUrl: vi.fn(),
  getPublicClinicPageInfo: (...args: unknown[]) => getPublicClinicPageInfo(...args),
  getPublicClinicDaySlots: (...args: unknown[]) => getPublicClinicDaySlots(...args),
  getPublicChatVisits: (...args: unknown[]) => getPublicChatVisits(...args),
  postPublicClinicCheckout: (...args: unknown[]) => postPublicClinicCheckout(...args),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
  useParams: () => ({ slug: "city-clinic" }),
}));

function fillIntake(age = "34") {
  fireEvent.change(screen.getByLabelText("Full name"), {
    target: { value: "Test Patient" },
  });
  fireEvent.change(screen.getByLabelText("Phone"), {
    target: { value: "+919876543210" },
  });
  if (age) {
    fireEvent.change(screen.getByLabelText("Age"), { target: { value: age } });
  }
  fireEvent.change(screen.getByLabelText("Sex"), { target: { value: "female" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Reason for visit" }), {
    target: { value: "Follow-up" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: /store my name/i }));
  fireEvent.click(screen.getByRole("checkbox", { name: /scheduled visit/i }));
}

describe("Public clinic booking page", () => {
  beforeEach(() => {
    search = "";
    getPublicClinicPageInfo.mockReset();
    getPublicClinicDaySlots.mockReset();
    getPublicChatVisits.mockReset();
    postPublicClinicCheckout.mockReset();
    getPublicChatVisits.mockResolvedValue({ data: { visits: [] } });
    getPublicClinicPageInfo.mockResolvedValue({
      data: {
        doctorId: "11111111-1111-4111-8111-111111111111",
        practiceName: "City Clinic",
        timezone: "Asia/Kolkata",
        mode: "book",
        opdMode: "slot",
        bookingAllowed: true,
      },
    });
    getPublicClinicDaySlots.mockResolvedValue({
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

  it("blocks continue until age and consent are present", async () => {
    render(<PublicClinicBookPage slug="city-clinic" />);
    expect(await screen.findByText("City Clinic")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Next opening" })).toBeInTheDocument();
    expect(screen.getByLabelText("Age")).toBeInTheDocument();
    expect(
      screen.getByText(/store my name, age, sex, phone number, and reason for visit/i)
    ).toBeInTheDocument();

    fillIntake("");
    fireEvent.click(await screen.findByRole("button", { name: "10:00" }));
    expect(screen.getByRole("button", { name: /continue to payment/i })).toBeDisabled();
    expect(postPublicClinicCheckout).not.toHaveBeenCalled();
  });

  it("posts slug checkout fields and omits the conversation token when ?c= is absent", async () => {
    postPublicClinicCheckout.mockResolvedValue({
      data: {
        paymentUrl: null,
        redirectUrl: "https://example.com/book/success",
        appointmentId: "appt-1",
        opdMode: "slot",
      },
    });
    render(<PublicClinicBookPage slug="city-clinic" />);
    await screen.findByText("City Clinic");
    fillIntake("34");
    fireEvent.click(await screen.findByRole("button", { name: "10:00" }));
    const continueBtn = screen.getByRole("button", { name: /continue to payment/i });
    await waitFor(() => expect(continueBtn).not.toBeDisabled());
    fireEvent.click(continueBtn);

    await waitFor(() => expect(postPublicClinicCheckout).toHaveBeenCalled());
    const body = postPublicClinicCheckout.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body).toMatchObject({
      slug: "city-clinic",
      slotStart: "2099-01-15T04:30:00.000Z",
      patientName: "Test Patient",
      patientAge: 34,
      patientSex: "female",
      patientPhone: "+919876543210",
      reasonForVisit: "Follow-up",
      consentGranted: true,
    });
    expect(body.conversationToken).toBeUndefined();
  });

  it("passes ?c= as conversationToken", async () => {
    search = "c=chat-token&for=visit";
    postPublicClinicCheckout.mockResolvedValue({
      data: {
        paymentUrl: null,
        redirectUrl: "https://example.com/book/success",
        appointmentId: "appt-1",
        opdMode: "slot",
      },
    });
    render(<PublicClinicBookPage slug="city-clinic" />);
    await screen.findByText("City Clinic");
    fillIntake("34");
    fireEvent.click(await screen.findByRole("button", { name: "10:00" }));
    fireEvent.click(screen.getByRole("button", { name: /continue to payment/i }));
    await waitFor(() => expect(postPublicClinicCheckout).toHaveBeenCalled());
    expect(postPublicClinicCheckout.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ conversationToken: "chat-token" })
    );
  });

  it("shows the queue window and token, and hides the clock grid", async () => {
    getPublicClinicPageInfo.mockResolvedValue({
      data: {
        doctorId: "11111111-1111-4111-8111-111111111111",
        practiceName: "City Clinic",
        timezone: "Asia/Kolkata",
        mode: "book",
        opdMode: "queue",
        bookingAllowed: true,
      },
    });
    getPublicClinicDaySlots.mockResolvedValue({
      data: {
        timezone: "Asia/Kolkata",
        opdMode: "queue",
        slots: [
          {
            start: "2099-01-15T04:30:00.000Z",
            end: "2099-01-15T04:45:00.000Z",
            status: "available",
          },
        ],
        queue: {
          windows: [
            { start: "2099-01-15T03:30:00.000Z", end: "2099-01-15T07:30:00.000Z" },
          ],
          nextToken: 4,
          avgMinutes: 10,
          expectedAt: "2099-01-15T04:00:00.000Z",
        },
      },
    });
    render(<PublicClinicBookPage slug="city-clinic" />);
    expect(await screen.findByText(/Your token would be 4/)).toBeInTheDocument();
    expect(screen.getByText(/Doctor is available/)).toBeInTheDocument();
    expect(screen.getByText(/Average visit is 10 min/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "10:00" })).not.toBeInTheDocument();
  });

  it("opens a menu from a chat link, and the visit form when for=visit", async () => {
    search = "c=abc";
    getPublicClinicPageInfo.mockResolvedValue({
      data: {
        doctorId: "11111111-1111-4111-8111-111111111111",
        practiceName: "City Clinic",
        timezone: "Asia/Kolkata",
        mode: "book",
        opdMode: "slot",
        bookingAllowed: true,
        clinicAddress: "12 Market Road",
        specialty: "General physician",
      },
    });
    const { unmount } = render(<PublicClinicBookPage slug="city-clinic" />);
    expect(await screen.findByRole("heading", { name: "City Clinic" })).toBeInTheDocument();
    expect(screen.getByText("General physician")).toBeInTheDocument();
    expect(
      screen.getByText("Book a visit, check times, or change a visit you already have.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "New visit / revisit / follow-up" })
    ).toHaveAttribute("href", "/d/city-clinic?c=abc&for=visit");
    expect(screen.getByText("Clinic address")).toBeInTheDocument();
    expect(screen.getByText("12 Market Road")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Continue" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Check availability" })).toHaveAttribute(
      "href",
      "/d/city-clinic?c=abc&for=times"
    );
    expect(screen.getByRole("link", { name: "Change or cancel a visit" })).toHaveAttribute(
      "href",
      "/d/city-clinic?c=abc&for=change"
    );
    expect(screen.getByText("This page does not give medical advice.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Full name")).not.toBeInTheDocument();
    unmount();

    search = "c=abc&for=visit";
    render(<PublicClinicBookPage slug="city-clinic" />);
    expect(await screen.findByLabelText("Full name")).toBeInTheDocument();
  });

  it("lists a visit booked from this chat", async () => {
    search = "for=change&c=ABCdef23";
    getPublicChatVisits.mockResolvedValue({
      data: { visits: [{ at: "2099-01-15T04:30:00.000Z", token: 4 }] },
    });
    render(<PublicClinicBookPage slug="city-clinic" />);
    expect(await screen.findByRole("heading", { name: "Change or cancel a visit" })).toBeInTheDocument();
    expect(screen.getByText("15 Jan, token 4")).toBeInTheDocument();
    expect(screen.queryByText("No upcoming visits from this chat.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "10:00" })).not.toBeInTheDocument();
  });

  it("shows the empty change screen when this chat has no upcoming visit", async () => {
    search = "for=change&c=ABCdef23";
    render(<PublicClinicBookPage slug="city-clinic" />);
    expect(await screen.findByText("No upcoming visits from this chat.")).toBeInTheDocument();
  });

  it("shows not found for an unknown slug", async () => {
    const missing = new Error("Booking page not found") as Error & { status?: number };
    missing.status = 404;
    getPublicClinicPageInfo.mockRejectedValue(missing);
    render(<PublicClinicBookPage slug="missing-clinic" />);
    expect(await screen.findByText("This booking page was not found.")).toBeInTheDocument();
    expect(screen.queryByText("City Clinic")).not.toBeInTheDocument();
  });
});

describe("Clinic-link success page", () => {
  beforeEach(() => {
    search = "";
  });

  it("confirms the visit without sending the visitor to Instagram", async () => {
    render(<SuccessPage />);
    expect(await screen.findByText("Your visit is booked.")).toBeInTheDocument();
    expect(
      screen.getByText(/don't wait for this appointment — get urgent medical help/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/112/)).not.toBeInTheDocument();
    expect(screen.queryByText(/instagram/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /return to chat/i })).not.toBeInTheDocument();
  });

  it("offers skip and continue with the same weight after a clinic booking", async () => {
    sessionStorage.setItem("clinicPrepPath", "/book/prep?t=history-token");
    render(<SuccessPage />);
    const skip = await screen.findByRole("button", { name: "Skip" });
    const continueLink = screen.getByRole("link", { name: "Continue" });
    expect(continueLink).toHaveAttribute("href", "/book/prep?t=history-token");
    expect(skip.className).toBe(continueLink.className);
    fireEvent.click(skip);
    expect(screen.queryByRole("button", { name: "Skip" })).not.toBeInTheDocument();
    expect(screen.getByText("Your visit is booked.")).toBeInTheDocument();
    sessionStorage.removeItem("clinicPrepPath");
  });
});
