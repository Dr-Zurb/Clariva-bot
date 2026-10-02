const MAX_BYTES = 10 * 1024 * 1024;
const MAX_EDGE = 1600;

export async function downscalePatientFile(
  file: File
): Promise<{ body: Blob; contentType: string }> {
  if (file.type === "application/pdf") {
    return { body: file, contentType: file.type };
  }
  if (!file.type.startsWith("image/") || file.size <= 900 * 1024) {
    return { body: file, contentType: file.type || "application/octet-stream" };
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return { body: file, contentType: file.type };
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.8);
  });
  if (!blob || blob.size > MAX_BYTES) {
    return { body: file, contentType: file.type };
  }
  return { body: blob, contentType: "image/jpeg" };
}
