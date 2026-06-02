/**
 * text-B2 — MessageBubble snapshot tests (Vitest + RTL).
 */

import type { ComponentProps } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageBubble } from "@/components/consultation/MessageBubble";
import type { ConsultationMessage } from "@/lib/text/types";

const SESSION_ID = "sess-001";
const DOCTOR_ID = "doc-001";
const PATIENT_ID = "pat-001";
const FIXED_AT = "2026-04-28T10:15:00.000Z";

function baseMessage(overrides: Partial<ConsultationMessage> = {}): ConsultationMessage {
  return {
    id: "msg-001",
    sessionId: SESSION_ID,
    senderId: DOCTOR_ID,
    senderRole: "doctor",
    body: "Hello from the doctor.",
    createdAt: FIXED_AT,
    kind: "text",
    ...overrides,
  };
}

const bubbleHelpers = {
  lookupMessageById: () => null,
  getSenderDisplayName: (m: ConsultationMessage) =>
    m.senderRole === "doctor" ? "Doctor" : "Patient",
};

function renderBubble(
  overrides: Partial<ConsultationMessage> = {},
  props: Partial<ComponentProps<typeof MessageBubble>> = {},
) {
  const message = baseMessage(overrides);
  return render(
    <ul>
      <MessageBubble
        message={message}
        currentUserId={DOCTOR_ID}
        currentUserRole="doctor"
        layout="standalone"
        mode="live"
        showTimestamp
        {...bubbleHelpers}
        {...props}
      />
    </ul>,
  );
}

describe("MessageBubble snapshots", () => {
  it("renders a doctor text message", () => {
    const { container } = renderBubble({
      senderId: DOCTOR_ID,
      senderRole: "doctor",
      body: "Plan discussed — follow up in two weeks.",
    });
    expect(container).toMatchSnapshot();
  });

  it("renders a patient text message", () => {
    const { container } = render(
      <ul>
        <MessageBubble
          message={baseMessage({
            id: "msg-patient",
            senderId: PATIENT_ID,
            senderRole: "patient",
            body: "Thank you, doctor.",
          })}
          currentUserId={DOCTOR_ID}
          currentUserRole="doctor"
          layout="standalone"
          mode="live"
          showTimestamp
          {...bubbleHelpers}
        />
      </ul>,
    );
    expect(container).toMatchSnapshot();
  });

  it("renders a system message", () => {
    const { container } = renderBubble({
      id: "msg-system",
      kind: "system",
      senderId: DOCTOR_ID,
      senderRole: "system",
      body: "Consult started.",
      systemEvent: "session_started",
    });
    expect(container).toMatchSnapshot();
  });

  it("renders an attachment message", () => {
    const { container } = renderBubble(
      {
        kind: "attachment",
        body: "lab-report.pdf",
        attachmentUrl: "consultation-attachments/sess/lab-report.pdf",
        attachmentMimeType: "application/pdf",
        attachmentByteSize: 204_800,
      },
      { signedAttachmentUrl: null },
    );
    expect(container).toMatchSnapshot();
  });

  it("renders a failed-send bubble", () => {
    const { container } = renderBubble(
      {
        id: "msg-failed",
        failed: true,
        body: "Message that failed to send.",
      },
      {
        onRetryFailed: () => {},
        onDiscardFailed: () => {},
      },
    );
    expect(container).toMatchSnapshot();
  });

  it("renders in readonly mode without failed-send affordances", () => {
    const { container } = renderBubble(
      {
        senderId: DOCTOR_ID,
        body: "Read-only history line.",
        seen: true,
        pending: false,
      },
      { mode: "readonly" },
    );
    expect(container).toMatchSnapshot();
  });

  it("renders a reply with quoted parent preview", () => {
    const parent = baseMessage({
      id: "msg-parent",
      body: "Take 5mg twice a day",
    });
    const { container } = renderBubble(
      {
        id: "msg-reply",
        senderId: PATIENT_ID,
        senderRole: "patient",
        body: "Got it",
        reply_to_id: "msg-parent",
      },
      {
        currentUserId: PATIENT_ID,
        currentUserRole: "patient",
        lookupMessageById: (id) => (id === "msg-parent" ? parent : null),
        getSenderDisplayName: () => "Doctor",
      },
    );
    expect(container).toMatchSnapshot();
  });
});
