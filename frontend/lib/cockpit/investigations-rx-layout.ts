import { parseInvestigationsOrders } from "@/components/cockpit/rx/inputs/investigations-orders-format";

export type InvestigationsRxLayout =
  | { kind: "list"; items: string[]; note: string | null }
  | { kind: "paragraph"; text: string };

/** Instruction-like leftover after a lab list — not a test to tick. */
function looksLikeInvestigationNote(text: string): boolean {
  const t = text.trim().replace(/\.$/, "");
  if (!t) return false;
  if (
    /^(bring|come|please|take|return|keep|show|call|do not)\b/i.test(t)
  ) {
    return true;
  }
  return t.split(/\s+/).filter(Boolean).length >= 8;
}

function peelTrailingNote(text: string): { rest: string; note: string | null } {
  const lastDot = text.lastIndexOf(". ");
  if (lastDot < 0) {
    return { rest: text.replace(/\.$/, "").trim(), note: null };
  }
  const rest = text.slice(0, lastDot).trim();
  const last = text.slice(lastDot + 2).trim();
  if (!looksLikeInvestigationNote(last)) {
    return { rest: text.replace(/\.$/, "").trim(), note: null };
  }
  return { rest, note: last };
}

/** Commas inside `Title: a, b, c` stay on one tick. */
function splitCommaOrders(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (/^[^,]+:\s/.test(trimmed)) return [trimmed];
  return trimmed
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function peelNoteFromItems(items: string[]): {
  items: string[];
  note: string | null;
} {
  if (items.length < 2) return { items, note: null };
  const last = items[items.length - 1]!;
  if (!looksLikeInvestigationNote(last)) return { items, note: null };
  return { items: items.slice(0, -1), note: last };
}

/**
 * How investigations should print on the Rx.
 * Semicolon chips stay discrete. A comma list becomes ticks.
 * A trailing instruction sentence becomes a note, not a fake test.
 * A single undivided sentence stays a paragraph.
 */
export function layoutInvestigationsForRx(
  raw: string | null | undefined,
): InvestigationsRxLayout | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return null;

  const segments = parseInvestigationsOrders(trimmed);
  if (segments.length >= 2) {
    const peeled = peelNoteFromItems(segments);
    return { kind: "list", items: peeled.items, note: peeled.note };
  }

  const only = segments[0] ?? trimmed;
  const { rest, note } = peelTrailingNote(only);
  const items = splitCommaOrders(rest);
  if (items.length >= 2) return { kind: "list", items, note };
  return { kind: "paragraph", text: trimmed };
}
