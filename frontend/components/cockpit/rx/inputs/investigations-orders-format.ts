/** Split stored `investigations_orders` free-text into chip labels (comma or semicolon). */
export function parseInvestigationsOrders(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  return trimmed
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Serialize chip labels back to the DB string slot (semicolon-separated). */
export function serializeInvestigationsOrders(chips: string[]): string {
  return chips.join("; ");
}
