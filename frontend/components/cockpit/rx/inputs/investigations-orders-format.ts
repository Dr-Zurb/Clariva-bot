/** Split stored `investigations_orders` into top-level order segments.
 * Semicolons separate orders; commas stay inside customized baskets
 * (`Title: a, b, c` — INV-D11).
 */
export function parseInvestigationsOrders(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  return trimmed
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Serialize top-level order segments back to the DB string slot. */
export function serializeInvestigationsOrders(chips: string[]): string {
  return chips.join("; ");
}

/** Display label for a flat segment (strip member list after `: ` for baskets). */
export function displayLabelForInvestigationSegment(segment: string): string {
  const colon = segment.indexOf(": ");
  if (colon <= 0) return segment;
  return segment.slice(0, colon).trim() || segment;
}
