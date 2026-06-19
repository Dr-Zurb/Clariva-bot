/** Sentence-case for complaint names: "headache" → "Headache". */
export function formatComplaintDisplayName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function measureTextWidth(text: string, font: string): number {
  if (typeof document === "undefined") return text.length * 7;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return text.length * 7;
  ctx.font = font;
  return ctx.measureText(text).width;
}

/**
 * Fit as many associated names as possible in `availableWidth` (px).
 * Returns text without the leading " · " separator.
 */
export function fitAssociatedNamesText(
  names: string[],
  availableWidth: number,
  measureWidth: (text: string) => number,
): string {
  const labels = names.map(formatComplaintDisplayName);
  if (labels.length === 0) return "";

  const prefix = " · ";
  const full = labels.join(", ");
  if (measureWidth(prefix + full) <= availableWidth) return full;

  for (let count = labels.length - 1; count >= 1; count -= 1) {
    const shown = labels.slice(0, count).join(", ");
    const hidden = labels.length - count;
    const candidate = `${shown} +${hidden}`;
    if (measureWidth(prefix + candidate) <= availableWidth) return candidate;
  }

  if (labels.length === 1) return labels[0]!;
  return `+${labels.length}`;
}
