import type { ImageLightboxImage } from "@/components/consultation/ImageLightbox";
import type { ConsultationMessage } from "@/lib/text/types";

export function isImageAttachmentMessage(message: ConsultationMessage): boolean {
  return (
    message.kind === "attachment" &&
    !message.deleted_at &&
    !!message.attachmentUrl &&
    !!message.attachmentMimeType?.startsWith("image/")
  );
}

/**
 * Collect signed image attachments from the chat timeline (chronological).
 */
export function buildChatImageLightboxImages(
  messages: ConsultationMessage[],
  signedUrls: Record<string, string>,
): ImageLightboxImage[] {
  return messages
    .filter(isImageAttachmentMessage)
    .filter((m) => !!signedUrls[m.id])
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
    .map((m) => ({
      src: signedUrls[m.id],
      alt: m.body || "Image attachment",
      messageId: m.id,
    }));
}
