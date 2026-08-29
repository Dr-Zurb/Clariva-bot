/**
 * text-B2 — MessageBubble snapshot tests (Vitest + RTL).
 */

import type { ComponentProps } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageBubble } from "@/components/consultation/MessageBubble";
import { formatTime } from "@/lib/format-date";
import {
  MESSAGE_READ_TICK_CLASS,
  MESSAGE_SELF_BUBBLE,
} from "@/lib/text/message-bubble-theme";
import type { ConsultationMessage } from "@/lib/text/types";

const SESSION_ID = "sess-001";
const DOCTOR_ID = "doc-001";
const PATIENT_ID = "pat-001";
const FIXED_AT = "2026-04-28T10:15:00.000Z";

function baseMessage(
  overrides: Partial<ConsultationMessage> = {}
): ConsultationMessage {
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
  props: Partial<ComponentProps<typeof MessageBubble>> = {}
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
    </ul>
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
      </ul>
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
      { signedAttachmentUrl: null }
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
      }
    );
    expect(container).toMatchSnapshot();
  });

  it("uses sent / delivered / read ticks on own bubbles", () => {
    const sent = renderBubble({ body: "sending", pending: true });
    expect(
      sent
        .getByTestId("message-delivery-ticks")
        .querySelector("[data-delivery]")
    ).toHaveAttribute("data-delivery", "sent");
    sent.unmount();

    const delivered = renderBubble({
      body: "acked",
      pending: false,
      seen: false,
    });
    const deliveredTick = delivered
      .getByTestId("message-delivery-ticks")
      .querySelector("[data-delivery]");
    expect(deliveredTick).toHaveAttribute("data-delivery", "delivered");
    expect(deliveredTick?.className).not.toContain(MESSAGE_READ_TICK_CLASS);
    delivered.unmount();

    const read = renderBubble({ body: "seen", seen: true });
    const tick = read
      .getByTestId("message-delivery-ticks")
      .querySelector("[data-delivery]");
    expect(tick).toHaveAttribute("data-delivery", "read");
    expect(tick?.className).toContain(MESSAGE_READ_TICK_CLASS);
  });

  it("tints own bubbles instead of filling them with brand blue", () => {
    const { container } = renderBubble({ body: "mine", seen: true });
    const bubble = container.querySelector(".message-body");
    expect(bubble?.className).toContain(MESSAGE_SELF_BUBBLE);
    expect(bubble?.className).not.toContain("text-white");
  });

  it("puts time and ticks on the last line inside the bubble", () => {
    const { getByTestId } = renderBubble({
      body: "Yes",
      seen: true,
    });
    const meta = getByTestId("message-bubble-meta");
    expect(meta.className).toMatch(/float-right/);
    expect(meta).toHaveTextContent(formatTime(FIXED_AT));
    expect(getByTestId("message-delivery-ticks")).toBeTruthy();
  });

  it("right-aligns own bubbles inside the max-width wrapper", () => {
    const { container } = renderBubble({ body: "Yes" });
    const wrapper = container.querySelector("li > div.relative");
    expect(wrapper?.className).toMatch(/justify-end/);
  });

  it("left-aligns incoming bubbles", () => {
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
          layout="panel"
          mode="live"
          showTimestamp
          {...bubbleHelpers}
        />
      </ul>
    );
    const wrapper = container.querySelector("li > div.relative");
    expect(wrapper?.className).toMatch(/justify-start/);
    expect(
      container.querySelector("[data-testid=message-bubble-meta]")
    ).toBeTruthy();
    expect(
      container.querySelector("[data-testid=message-delivery-ticks]")
    ).toBeNull();
  });

  it("hides the in-call ··· until hover so it cannot clip the sheet", () => {
    const { getByLabelText } = renderBubble(
      { body: "hello" },
      { layout: "panel", onStartReply: () => {} }
    );
    const menu = getByLabelText("Message actions");
    expect(menu.className).toMatch(/(?:^|\s)opacity-0(?:\s|$)/);
    expect(menu.className).not.toMatch(/(?:^|\s)opacity-100(?:\s|$)/);
  });

  it("renders in readonly mode without failed-send affordances", () => {
    const { container } = renderBubble(
      {
        senderId: DOCTOR_ID,
        body: "Read-only history line.",
        seen: true,
        pending: false,
      },
      { mode: "readonly" }
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
      }
    );
    expect(container).toMatchSnapshot();
  });
});
