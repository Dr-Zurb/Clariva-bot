import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import DoctorVideoGrantExtendButton from "../DoctorVideoGrantExtendButton";
import {
  extendVideoGrant,
  VideoEscalationError,
} from "@/lib/api/recording-escalation";

vi.mock("@/lib/api/recording-escalation", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/api/recording-escalation")
  >("@/lib/api/recording-escalation");
  return {
    ...actual,
    extendVideoGrant: vi.fn(),
  };
});

const mockedExtend = vi.mocked(extendVideoGrant);

beforeEach(() => {
  mockedExtend.mockReset();
  mockedExtend.mockResolvedValue({
    grantExpiresAt: "2026-08-20T10:04:00.000Z",
    grantExtendedAt: "2026-08-20T10:02:00.000Z",
  });
});

describe("DoctorVideoGrantExtendButton", () => {
  it("hides for the patient", () => {
    const { container } = render(
      <DoctorVideoGrantExtendButton
        sessionId="s1"
        token="t1"
        currentUserRole="patient"
        extensionSpent={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("extends once and then shows already extended", async () => {
    const onExtended = vi.fn();
    const { rerender } = render(
      <DoctorVideoGrantExtendButton
        sessionId="s1"
        token="t1"
        currentUserRole="doctor"
        extensionSpent={false}
        onExtended={onExtended}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /add two minutes/i }));
    await waitFor(() => {
      expect(mockedExtend).toHaveBeenCalledWith("t1", "s1");
    });
    expect(onExtended).toHaveBeenCalledTimes(1);

    rerender(
      <DoctorVideoGrantExtendButton
        sessionId="s1"
        token="t1"
        currentUserRole="doctor"
        extensionSpent
        onExtended={onExtended}
      />,
    );
    const spent = screen.getByRole("button", { name: /already extended/i });
    expect(spent).toBeDisabled();
    fireEvent.click(spent);
    expect(mockedExtend).toHaveBeenCalledTimes(1);
  });

  it("surfaces the server refusal on a second spend", async () => {
    mockedExtend.mockRejectedValueOnce(
      new VideoEscalationError(
        "This video grant has already been extended.",
        "UNKNOWN",
        409,
      ),
    );
    render(
      <DoctorVideoGrantExtendButton
        sessionId="s1"
        token="t1"
        currentUserRole="doctor"
        extensionSpent={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /add two minutes/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "This video grant has already been extended.",
      );
    });
  });
});
