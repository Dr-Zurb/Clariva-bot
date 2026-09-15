import {
  VISIT_DOCUMENT_ALLOWED_MIME,
  VISIT_DOCUMENT_MAX_FILE_MB,
} from "@/types/visit-documents";

const MAX_EDGE = 2048;
const JPEG_QUALITY = 0.82;

export function isAllowedVisitDocumentFile(file: File): boolean {
  return (VISIT_DOCUMENT_ALLOWED_MIME as readonly string[]).includes(file.type);
}

export function visitDocumentFileTooLarge(file: File): boolean {
  return file.size > VISIT_DOCUMENT_MAX_FILE_MB * 1024 * 1024;
}

/**
 * Shrink camera photos that would blow the 10 MB server cap (DVP-Q4).
 * PDFs and already-small images pass through unchanged.
 */
export async function downscaleVisitDocumentFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= 2 * 1024 * 1024) {
    return file;
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
  );
  if (!blob || blob.size >= file.size) return file;
  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}
