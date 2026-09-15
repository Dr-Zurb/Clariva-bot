import { parseInvestigationsOrders } from "@/components/cockpit/rx/inputs/investigations-orders-format";

export type InvestigationsRxItem =
  | { kind: "order"; label: string }
  | { kind: "package"; label: string; members: string[] };

export type InvestigationsRxRow =
  | { kind: "pair"; labels: string[] }
  | { kind: "package"; label: string; members: string[] };

export type InvestigationsRxLayout =
  | { kind: "list"; items: InvestigationsRxItem[]; note: string | null }
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

/** Commas inside `Title: a, b, c` stay on one segment, then expand to a package. */
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

function peelIndication(rest: string): { body: string; indication: string | null } {
  const idx = rest.indexOf(" — ");
  if (idx < 0) return { body: rest, indication: null };
  const body = rest.slice(0, idx).trim();
  const indication = rest.slice(idx + 3).trim();
  return { body, indication: indication || null };
}

/** `CBC: a, b` → package; `CBC` / `CBC:` → plain order. */
export function itemFromInvestigationSegment(
  segment: string,
): InvestigationsRxItem {
  const colon = segment.indexOf(":");
  if (colon <= 0) return { kind: "order", label: segment };

  const title = segment.slice(0, colon).trim();
  if (!title) return { kind: "order", label: segment };

  const { body, indication } = peelIndication(segment.slice(colon + 1).trim());
  const members = body
    ? body
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
    : [];
  const label = indication ? `${title} — ${indication}` : title;
  if (members.length === 0) return { kind: "order", label };
  return { kind: "package", label, members };
}

/** Chip-level orders print as headings, same as packages that have members. */
function asTopLevelItem(item: InvestigationsRxItem): InvestigationsRxItem {
  if (item.kind === "package") return item;
  return { kind: "package", label: item.label, members: [] };
}

export function rowsFromInvestigationItems(
  items: readonly InvestigationsRxItem[],
): InvestigationsRxRow[] {
  const rows: InvestigationsRxRow[] = [];
  let pair: string[] = [];
  const flushPair = () => {
    if (pair.length === 0) return;
    rows.push({ kind: "pair", labels: pair });
    pair = [];
  };
  for (const item of items) {
    if (item.kind === "package") {
      flushPair();
      rows.push({
        kind: "package",
        label: item.label,
        members: item.members,
      });
      continue;
    }
    pair.push(item.label);
    if (pair.length === 2) flushPair();
  }
  flushPair();
  return rows;
}

/**
 * How investigations should print on the Rx.
 * Semicolon chips stay discrete top-level headings (bold on print).
 * A comma list becomes ticks. `Title: a, b` nests member ticks.
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
    return {
      kind: "list",
      items: peeled.items.map((seg) =>
        asTopLevelItem(itemFromInvestigationSegment(seg)),
      ),
      note: peeled.note,
    };
  }

  const only = segments[0] ?? trimmed;
  const { rest, note } = peelTrailingNote(only);
  const items = splitCommaOrders(rest).map(itemFromInvestigationSegment);
  if (items.length >= 2) return { kind: "list", items, note };
  if (items.length === 1 && items[0]!.kind === "package") {
    return { kind: "list", items, note };
  }
  return { kind: "paragraph", text: trimmed };
}
