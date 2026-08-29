import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PatientChatSheet from "../PatientChatSheet";
import {
  PATIENT_CHAT_SNAP_FULL,
  PATIENT_CHAT_SNAP_HALF,
  PATIENT_CHAT_SNAP_PEEK,
} from "@/lib/call/patient-mobile-chrome";

describe("PatientChatSheet", () => {
  it("stays mounted but off-screen at peek, with no Chat opener", () => {
    render(
      <PatientChatSheet snap={PATIENT_CHAT_SNAP_PEEK} onSnapChange={vi.fn()}>
        <p>thread</p>
      </PatientChatSheet>
    );

    expect(screen.getByTestId("patient-chat-sheet")).toHaveAttribute(
      "data-snap",
      PATIENT_CHAT_SNAP_PEEK
    );
    expect(screen.queryByTestId("patient-chat-open")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("patient-chat-sheet-controls")
    ).not.toBeInTheDocument();
    expect(screen.getByText("thread").parentElement).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    expect(screen.getByTestId("patient-chat-sheet-column")).toHaveStyle({
      height: "0px",
    });
  });

  it("reveals the thread at half and hosts a close control in the header row", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <PatientChatSheet
        snap={PATIENT_CHAT_SNAP_HALF}
        onSnapChange={vi.fn()}
        onClose={onClose}
      >
        <p>thread</p>
      </PatientChatSheet>
    );
    expect(screen.getByText("thread")).toBeVisible();
    expect(screen.getByText("Chat")).toBeVisible();
    expect(screen.getByTestId("patient-chat-sheet-close")).toBeVisible();
    expect(screen.getByTestId("patient-chat-sheet-column")).toHaveStyle({
      height: "50%",
    });
    expect(
      screen.queryByTestId("patient-chat-sheet-controls")
    ).not.toBeInTheDocument();

    rerender(
      <PatientChatSheet
        snap={PATIENT_CHAT_SNAP_FULL}
        onSnapChange={vi.fn()}
        onClose={onClose}
      >
        <p>thread</p>
      </PatientChatSheet>
    );
    expect(screen.getByTestId("patient-chat-sheet-close")).toBeVisible();
    expect(screen.getByText("thread")).toBeVisible();
    expect(screen.getByTestId("patient-chat-sheet-column")).toHaveStyle({
      height: "100%",
    });
  });
});
