import { describe, expect, it } from "vitest";
import {
  buildChatImageLightboxImages,
  isImageAttachmentMessage,
} from "@/lib/text/image-lightbox-images";
import type { ConsultationMessage } from "@/lib/text/types";

function msg(
  overrides: Partial<ConsultationMessage> = {},
): ConsultationMessage {
  return {
    id: "msg-1",
    sessionId: "sess-1",
    senderId: "user-1",
    senderRole: "patient",
    body: "photo.jpg",
    createdAt: "2026-04-28T10:00:00.000Z",
    kind: "attachment",
    attachmentUrl: "path/photo.jpg",
    attachmentMimeType: "image/jpeg",
    ...overrides,
  };
}

describe("isImageAttachmentMessage", () => {
  it("accepts image attachment rows with a storage path", () => {
    expect(isImageAttachmentMessage(msg())).toBe(true);
  });

  it("rejects deleted, non-image, and non-attachment rows", () => {
    expect(isImageAttachmentMessage(msg({ deleted_at: "2026-04-28T11:00:00Z" }))).toBe(
      false,
    );
    expect(
      isImageAttachmentMessage(
        msg({ attachmentMimeType: "application/pdf" }),
      ),
    ).toBe(false);
    expect(isImageAttachmentMessage(msg({ kind: "text" }))).toBe(false);
  });
});

describe("buildChatImageLightboxImages", () => {
  it("returns chronological signed image attachments only", () => {
    const messages = [
      msg({ id: "b", createdAt: "2026-04-28T10:05:00.000Z" }),
      msg({
        id: "a",
        createdAt: "2026-04-28T10:00:00.000Z",
        body: "first.png",
        attachmentMimeType: "image/png",
      }),
      msg({
        id: "pdf",
        attachmentMimeType: "application/pdf",
      }),
      msg({ id: "missing-url", attachmentUrl: "path/x.jpg" }),
    ];
    const signed = {
      a: "https://signed/a",
      b: "https://signed/b",
    };

    expect(buildChatImageLightboxImages(messages, signed)).toEqual([
      { src: "https://signed/a", alt: "first.png", messageId: "a" },
      { src: "https://signed/b", alt: "photo.jpg", messageId: "b" },
    ]);
  });
});
