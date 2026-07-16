/**
 * Plan investigation order catalog — search + panel commit helpers (inv-lib-01/02)
 * and alias-aware merge (inv-lib-03).
 *
 * Vocabulary reuses `lab-test-library` (analytes/panels) + `IMAGING_ORDERS`.
 * Persistence stays the flat `investigations_orders` string (INV-D1).
 */

import {
  getImagingOrderById,
  getImagingViewById,
  getLabAnalyteById,
  getLabPanelById,
  imagingOrderHasViews,
  imagingOrderIsExpandable,
  IMAGING_ORDERS,
  LAB_ANALYTES,
  LAB_PANELS,
  lookupImagingViewByAlias,
  type ImagingOrderDefinition,
  type LabPanelDefinition,
} from "@/lib/cockpit/lab-test-library";
import type {
  InvestigationImagingContrast,
  InvestigationImagingRequisition,
  InvestigationImagingUrgency,
  InvestigationOrder,
  InvestigationOrderMember,
} from "@/types/prescription";

export type InvestigationOrderKind = "panel" | "analyte" | "imaging" | "custom";

export interface InvestigationOrderCatalogEntry {
  kind: InvestigationOrderKind;
  /** Stable id: panel/analyte/imaging id, or custom slug (without `custom:` prefix). */
  id: string;
  /** Combobox value token (`panel:lft`, `analyte:hb`, `imaging:cxr`, `custom:…`). */
  value: string;
  label: string;
  searchText: string;
}

function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

export function encodeOrderCatalogValue(
  kind: InvestigationOrderKind,
  id: string,
): string {
  return `${kind}:${id}`;
}

export function parseOrderCatalogValue(
  value: string,
): { kind: InvestigationOrderKind; id: string } | null {
  const trimmed = value.trim();
  const colon = trimmed.indexOf(":");
  if (colon <= 0) return null;
  const kind = trimmed.slice(0, colon) as InvestigationOrderKind;
  const id = trimmed.slice(colon + 1);
  if (
    !id ||
    (kind !== "panel" &&
      kind !== "analyte" &&
      kind !== "imaging" &&
      kind !== "custom")
  ) {
    return null;
  }
  return { kind, id };
}

function buildSearchText(
  name: string,
  aliases: readonly string[],
  extra: readonly string[] = [],
): string {
  return [name, ...aliases, ...extra].map(normalizeKey).join(" | ");
}

/** Extra panel aliases for search + dedupe (common OPD synonyms). */
const PANEL_ALIASES: Readonly<Record<string, readonly string[]>> = {
  cbc: ["complete blood count", "complete blood picture", "cbp", "hemogram"],
  cbc_diff: ["cbc with differential", "cbc differential", "dc", "differential count"],
  lft: ["liver function test", "liver function tests", "lfts"],
  kft: ["rft", "kidney function test", "renal function test", "kfts", "rfts"],
  lipid: ["lipid profile", "lipids", "lipid panel"],
  thyroid: ["thyroid profile", "tft", "thyroid function test"],
  diabetes: ["diabetes panel", "sugar panel"],
  urine_routine: ["urine routine", "urine r/m", "urine rm", "urine analysis"],
  electrolytes: ["serum electrolytes", "lytes"],
  fever: ["fever panel", "fever workup", "fever profile"],
  cardiac: ["cardiac markers", "cardiac enzymes"],
  coagulation: ["coag", "coagulation profile", "pt inr aptt"],
  hormones: ["hormone panel", "hormonal profile", "hormones"],
  serology: ["viral serology", "hepatitis panel", "viral markers"],
  anc_profile: ["anc profile", "antenatal profile", "anc investigation", "pregnancy profile"],
  torch: ["torch", "torch panel", "torch titer"],
  infertility: ["infertility panel", "infertility workup", "hormone infertility"],
  pediatric: ["pediatric workup", "paediatric workup", "peds panel", "child workup"],
  autoimmune: ["autoimmune panel", "ana panel", "connective tissue panel"],
};

export const INVESTIGATION_ORDER_CATALOG: readonly InvestigationOrderCatalogEntry[] =
  (() => {
    const panels: InvestigationOrderCatalogEntry[] = LAB_PANELS.map((panel) => ({
      kind: "panel" as const,
      id: panel.id,
      value: encodeOrderCatalogValue("panel", panel.id),
      label: panel.name,
      searchText: buildSearchText(
        panel.name,
        [panel.id, ...(PANEL_ALIASES[panel.id] ?? [])],
        ["panel", "package"],
      ),
    }));

    const analytes: InvestigationOrderCatalogEntry[] = LAB_ANALYTES.map((a) => ({
      kind: "analyte" as const,
      id: a.id,
      value: encodeOrderCatalogValue("analyte", a.id),
      label: a.name,
      searchText: buildSearchText(a.name, a.aliases, [a.id]),
    }));

    const imaging: InvestigationOrderCatalogEntry[] = IMAGING_ORDERS.map((o) => ({
      kind: "imaging" as const,
      id: o.id,
      value: encodeOrderCatalogValue("imaging", o.id),
      label: o.name,
      searchText: buildSearchText(o.name, o.aliases, [o.id, "imaging"]),
    }));

    return [...panels, ...analytes, ...imaging];
  })();

/**
 * Curated OPD common-order chips (~2 rows). Full catalog stays searchable
 * via the combobox — do not dump every panel/imaging here.
 */
const INVESTIGATION_QUICK_PICK_IDS: readonly string[] = [
  "panel:cbc",
  "panel:lft",
  "panel:kft",
  "panel:lipid",
  "panel:thyroid",
  "panel:hba1c_panel",
  "panel:urine_routine",
  "panel:crp_esr",
  "imaging:cxr",
  "imaging:ecg",
  "imaging:usg_abdomen",
] as const;

export const INVESTIGATION_QUICK_PICK_ENTRIES: readonly InvestigationOrderCatalogEntry[] =
  INVESTIGATION_QUICK_PICK_IDS.map((value) => {
    const entry = INVESTIGATION_ORDER_CATALOG.find((e) => e.value === value);
    if (!entry) {
      throw new Error(`Missing investigation quick-pick catalog entry: ${value}`);
    }
    return entry;
  });

export function filterInvestigationOrderCatalog(
  options: readonly { value: string; label: string }[],
  query: string,
  extras: readonly InvestigationOrderCatalogEntry[] = [],
): { value: string; label: string }[] {
  const q = normalizeKey(query);
  const byValue = new Map(
    [...extras, ...INVESTIGATION_ORDER_CATALOG].map((e) => [e.value, e] as const),
  );
  const filtered = options.filter((opt) => {
    if (!q) return true;
    const entry = byValue.get(opt.value);
    if (!entry) return normalizeKey(opt.label).includes(q);
    return entry.searchText.includes(q) || normalizeKey(opt.label).includes(q);
  });
  return filtered.sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
  );
}

export function resolveInvestigationOrderCatalog(
  query: string,
  extras: readonly InvestigationOrderCatalogEntry[] = [],
): string | undefined {
  const trimmed = normalizeKey(query);
  if (!trimmed) return undefined;

  const catalog = [...extras, ...INVESTIGATION_ORDER_CATALOG];

  const exactLabel = catalog.find((e) => normalizeKey(e.label) === trimmed);
  if (exactLabel) return exactLabel.value;

  const exactAlias = catalog.find((e) =>
    e.searchText.split(" | ").some((term) => term === trimmed),
  );
  return exactAlias?.value;
}

/**
 * INV-D3: all members selected → panel name; otherwise selected analyte names.
 */
export function labelsFromPanelSelection(
  panelId: string,
  selectedAnalyteIds: readonly string[],
): string[] {
  const panel = getLabPanelById(panelId);
  if (!panel) return [];

  const allowed = new Set(panel.analyteIds);
  const selected = selectedAnalyteIds.filter((id) => allowed.has(id));
  if (selected.length === 0) return [];

  if (selected.length === panel.analyteIds.length) {
    return [panel.name];
  }

  const labels: string[] = [];
  for (const id of selected) {
    const analyte = getLabAnalyteById(id);
    if (analyte) labels.push(analyte.name);
  }
  return labels;
}

/**
 * Infer which panel members are currently ordered from the flat chip list.
 * Full panel chip → all members; otherwise any matching analyte chips.
 */
export function inferPanelSelectionFromChips(
  chips: readonly string[],
  panelId: string,
): string[] {
  const panel = getLabPanelById(panelId);
  if (!panel) return [];

  const hasPanelChip = chips.some((chip) => {
    const entry = resolveOrderCatalogEntryFromLabel(chip);
    return entry?.kind === "panel" && entry.id === panelId;
  });
  if (hasPanelChip) return [...panel.analyteIds];

  const memberIds = new Set(panel.analyteIds);
  const selected: string[] = [];
  for (const chip of chips) {
    const entry = resolveOrderCatalogEntryFromLabel(chip);
    if (entry?.kind === "analyte" && memberIds.has(entry.id)) {
      selected.push(entry.id);
    }
  }
  return selected;
}

/**
 * Rewrite the flat order list for a panel membership change (INV-D3).
 * Removes the panel chip and any of its member analyte chips, then inserts
 * the new labels (panel name or selected analytes) at the first removed index.
 */
export function applyPanelSelectionToChips(
  chips: readonly string[],
  panelId: string,
  selectedAnalyteIds: readonly string[],
): string[] {
  const panel = getLabPanelById(panelId);
  if (!panel) return [...chips];

  const memberIds = new Set(panel.analyteIds);
  let insertAt = chips.length;
  const without: string[] = [];
  for (let i = 0; i < chips.length; i++) {
    const chip = chips[i]!;
    const entry = resolveOrderCatalogEntryFromLabel(chip);
    const isPanel = entry?.kind === "panel" && entry.id === panelId;
    const isMember = entry?.kind === "analyte" && memberIds.has(entry.id);
    if (isPanel || isMember) {
      if (insertAt === chips.length) insertAt = without.length;
      continue;
    }
    without.push(chip);
  }

  const labels = labelsFromPanelSelection(panelId, selectedAnalyteIds);
  if (labels.length === 0) return without;
  return [...without.slice(0, insertAt), ...labels, ...without.slice(insertAt)];
}

export function panelMemberOptions(panel: LabPanelDefinition): {
  id: string;
  label: string;
}[] {
  return panel.analyteIds
    .map((id) => {
      const analyte = getLabAnalyteById(id);
      return analyte ? { id: analyte.id, label: analyte.name } : null;
    })
    .filter((row): row is { id: string; label: string } => row !== null);
}

/** Default view checklist for a viewable imaging study (INV-D6). */
export function imagingViewOptions(order: ImagingOrderDefinition): {
  id: string;
  label: string;
}[] {
  return (order.viewIds ?? [])
    .map((id) => {
      const view = getImagingViewById(id);
      return view ? { id: view.id, label: view.name } : null;
    })
    .filter((row): row is { id: string; label: string } => row != null);
}

export function findOrderCatalogEntryByValue(
  value: string,
  extras: readonly InvestigationOrderCatalogEntry[] = [],
): InvestigationOrderCatalogEntry | undefined {
  return (
    extras.find((e) => e.value === value) ??
    INVESTIGATION_ORDER_CATALOG.find((e) => e.value === value)
  );
}

export function findOrderCatalogEntryByLabel(
  label: string,
  extras: readonly InvestigationOrderCatalogEntry[] = [],
): InvestigationOrderCatalogEntry | undefined {
  const key = normalizeKey(label);
  return (
    extras.find((e) => normalizeKey(e.label) === key) ??
    INVESTIGATION_ORDER_CATALOG.find((e) => normalizeKey(e.label) === key)
  );
}

/** Match preferred label or any catalog alias / id term. */
export function resolveOrderCatalogEntryFromLabel(
  label: string,
  extras: readonly InvestigationOrderCatalogEntry[] = [],
): InvestigationOrderCatalogEntry | undefined {
  const key = normalizeKey(label);
  if (!key) return undefined;

  const exact = findOrderCatalogEntryByLabel(label, extras);
  if (exact) return exact;

  const catalog = [...extras, ...INVESTIGATION_ORDER_CATALOG];
  return catalog.find((e) =>
    e.searchText.split(" | ").some((term) => term === key),
  );
}

/** Preferred display label when the text matches the catalog; else trimmed input. */
export function canonicalizeOrderLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "";
  return resolveOrderCatalogEntryFromLabel(trimmed)?.label ?? trimmed;
}

function identityKeyForEntry(entry: InvestigationOrderCatalogEntry): string {
  return `${entry.kind}:${entry.id}`;
}

/**
 * Occupied identity keys for the current order list.
 * A panel chip also occupies each of its analyte ids (INV-D3 / inv-lib-03).
 */
export function occupiedOrderIdentityKeys(
  chips: readonly string[],
): Set<string> {
  const keys = new Set<string>();
  for (const chip of chips) {
    const entry = resolveOrderCatalogEntryFromLabel(chip);
    if (!entry) {
      keys.add(`custom:${normalizeKey(chip)}`);
      continue;
    }
    keys.add(identityKeyForEntry(entry));
    if (entry.kind === "panel") {
      const panel = getLabPanelById(entry.id);
      if (!panel) continue;
      for (const analyteId of panel.analyteIds) {
        keys.add(`analyte:${analyteId}`);
      }
    }
  }
  return keys;
}

function isLabelOccupied(
  label: string,
  occupied: ReadonlySet<string>,
): boolean {
  const entry = resolveOrderCatalogEntryFromLabel(label);
  if (!entry) return occupied.has(`custom:${normalizeKey(label)}`);
  if (occupied.has(identityKeyForEntry(entry))) return true;
  if (entry.kind === "analyte" && occupied.has(`analyte:${entry.id}`)) {
    return true;
  }
  return false;
}

/**
 * Merge incoming order labels into existing chips with alias/panel-aware dedupe.
 * Canonicalizes catalog matches; dropping member chips when a covering panel is added.
 */
export function mergeInvestigationOrderLabels(
  existing: readonly string[],
  incoming: readonly string[],
  limits: { maxChips: number; maxChipLength: number; maxTotalLength: number },
): string[] {
  let next = [...existing];

  for (const raw of incoming) {
    const canonical = canonicalizeOrderLabel(raw);
    if (!canonical || canonical.length > limits.maxChipLength) continue;

    let occupied = occupiedOrderIdentityKeys(next);
    if (isLabelOccupied(canonical, occupied)) continue;

    const entry = resolveOrderCatalogEntryFromLabel(canonical);
    if (entry?.kind === "panel") {
      const panel = getLabPanelById(entry.id);
      if (panel) {
        const memberIds = new Set(panel.analyteIds);
        next = next.filter((chip) => {
          const chipEntry = resolveOrderCatalogEntryFromLabel(chip);
          if (chipEntry?.kind === "analyte" && memberIds.has(chipEntry.id)) {
            return false;
          }
          return true;
        });
        occupied = occupiedOrderIdentityKeys(next);
        if (isLabelOccupied(entry.label, occupied)) continue;
      }
    }

    if (next.length >= limits.maxChips) break;
    const labelToAdd = entry?.label ?? canonical;
    const candidate = [...next, labelToAdd];
    if (candidate.join("; ").length > limits.maxTotalLength) {
      break;
    }
    next = candidate;
  }

  return next;
}

function scoreCatalogEntry(
  entry: InvestigationOrderCatalogEntry,
  query: string,
): number {
  const q = normalizeKey(query);
  if (!q || q.length < 2) return 0;

  const label = normalizeKey(entry.label);
  if (label === q) return 100;
  if (label.startsWith(q)) return 90;
  if (label.includes(q)) return 70;

  const terms = entry.searchText.split(" | ");
  let best = 0;
  for (const term of terms) {
    if (!term) continue;
    if (term === q) best = Math.max(best, 95);
    else if (term.startsWith(q)) best = Math.max(best, 85);
    else if (term.includes(q)) best = Math.max(best, 60);
    else if (q.includes(term) && term.length >= 3) best = Math.max(best, 50);
  }

  // Token overlap (e.g. "liver test" ≈ LFT aliases)
  const qTokens = q.split(" ").filter((t) => t.length >= 2);
  if (qTokens.length > 1) {
    let hits = 0;
    for (const token of qTokens) {
      if (terms.some((term) => term.includes(token) || token.includes(term))) {
        hits += 1;
      }
    }
    if (hits === qTokens.length) best = Math.max(best, 75);
    else if (hits > 0) best = Math.max(best, 40 + hits * 10);
  }

  return best;
}

function isEntryOccupied(
  entry: InvestigationOrderCatalogEntry,
  occupied: ReadonlySet<string>,
): boolean {
  if (entry.kind === "custom") {
    return (
      occupied.has(entry.value) ||
      occupied.has(`custom:${entry.id}`) ||
      occupied.has(`custom:${entry.value}`)
    );
  }
  if (occupied.has(`${entry.kind}:${entry.id}`)) return true;
  if (entry.kind === "analyte" && occupied.has(`analyte:${entry.id}`)) {
    return true;
  }
  return false;
}

/**
 * Catalog-constrained near-miss suggestions for free-text orders (inv-lib-04).
 * Local fuzzy only — LLM resolve is a separate Opus wave.
 */
export function suggestInvestigationOrders(
  query: string,
  occupied: ReadonlySet<string> = new Set(),
  limit = 5,
  extras: readonly InvestigationOrderCatalogEntry[] = [],
): InvestigationOrderCatalogEntry[] {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  // Exact catalog hit → caller should commit directly (no suggest panel).
  if (resolveInvestigationOrderCatalog(trimmed, extras)) return [];

  const scored: { entry: InvestigationOrderCatalogEntry; score: number }[] = [];
  for (const entry of [...extras, ...INVESTIGATION_ORDER_CATALOG]) {
    if (isEntryOccupied(entry, occupied)) continue;
    const score = scoreCatalogEntry(entry, trimmed);
    if (score < 40) continue;
    scored.push({ entry, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Prefer panels slightly on ties (package expand is the common intent).
    if (a.entry.kind !== b.entry.kind) {
      if (a.entry.kind === "panel") return -1;
      if (b.entry.kind === "panel") return 1;
      if (a.entry.kind === "custom") return -1;
      if (b.entry.kind === "custom") return 1;
    }
    return a.entry.label.localeCompare(b.entry.label, undefined, {
      sensitivity: "base",
    });
  });

  return scored.slice(0, limit).map((row) => row.entry);
}

/**
 * Convert doctor-saved custom orders into combobox catalog entries.
 */
export function doctorCustomOrdersToCatalogEntries(
  customs: readonly {
    id: string;
    label: string;
  }[],
): InvestigationOrderCatalogEntry[] {
  return customs.map((order) => {
    const id = order.id.startsWith("custom:")
      ? order.id.slice("custom:".length)
      : order.id;
    const value = encodeOrderCatalogValue("custom", id);
    const label = order.label.trim();
    return {
      kind: "custom" as const,
      id,
      value,
      label,
      searchText: buildSearchText(label, [], ["my order", "custom"]),
    };
  });
}

/**
 * Seed a named basket from a catalog panel (INV-D11).
 */
export function createPanelBasket(panelId: string): InvestigationOrder | null {
  const panel = getLabPanelById(panelId);
  if (!panel) return null;
  const members = panelMemberOptions(panel).map((m) => ({
    id: m.id,
    label: m.label,
    kind: "analyte" as const,
  }));
  return {
    id: panel.id,
    label: panel.name,
    kind: "panel",
    sourcePanelId: panel.id,
    members,
  };
}

/**
 * Seed an imaging basket. Expandable studies (views / related / requisition)
 * return a basket; atomic imaging returns a plain row.
 */
export function createImagingBasket(
  imagingId: string,
): InvestigationOrder | null {
  const imaging = getImagingOrderById(imagingId);
  if (!imaging) return null;
  if (!imagingOrderIsExpandable(imaging)) {
    return { id: imaging.id, label: imaging.name, kind: "imaging" };
  }
  const viewMembers = imagingOrderHasViews(imaging)
    ? imagingViewOptions(imaging).map((m) => ({
        id: m.id,
        label: m.label,
        kind: "custom" as const,
      }))
    : [];
  return {
    id: imaging.id,
    label: imaging.name,
    kind: "imaging",
    sourcePanelId: imaging.id,
    members: viewMembers,
    ...(imaging.requiresRequisition
      ? {
          requisition: {
            contrast: null,
            site: null,
            indication: null,
            urgency: null,
          },
        }
      : {}),
  };
}

/**
 * Seed a free-text named basket (always expandable — add any tests inside).
 */
export function createCustomBasket(label: string): InvestigationOrder {
  const trimmed = label.trim();
  return {
    id: `custom:${normalizeKey(trimmed)}`,
    label: trimmed,
    kind: "custom",
    members: [],
  };
}

/**
 * True when title or membership no longer matches the catalog template.
 * Requisition fields (contrast / indication / …) do NOT count — those are
 * normal study details, not a "custom package".
 */
export function isBasketCustomized(order: InvestigationOrder): boolean {
  return isBasketMembershipCustomized(order);
}

/**
 * Membership / title drift only — ignores requisition fields.
 * Drives the "Custom package" badge, chip "· custom", and rename nudge.
 */
export function isBasketMembershipCustomized(
  order: InvestigationOrder,
): boolean {
  if (order.kind === "custom") {
    return (order.members?.length ?? 0) > 0;
  }
  if (order.kind === "panel") {
    const sourceId = order.sourcePanelId ?? order.id;
    const panel = getLabPanelById(sourceId);
    if (!panel) return true;
    if (normalizeKey(order.label) !== normalizeKey(panel.name)) return true;
    const members = order.members ?? [];
    if (members.length !== panel.analyteIds.length) return true;
    const memberIds = new Set(members.map((m) => m.id));
    return panel.analyteIds.some((id) => !memberIds.has(id));
  }
  if (order.kind === "imaging") {
    const sourceId = order.sourcePanelId ?? order.id;
    const imaging = getImagingOrderById(sourceId);
    if (!imaging || !imagingOrderIsExpandable(imaging)) return false;
    if (normalizeKey(order.label) !== normalizeKey(imaging.name)) return true;
    const members = order.members ?? [];
    if (imagingOrderHasViews(imaging)) {
      const templateIds = imaging.viewIds ?? [];
      if (members.length !== templateIds.length) return true;
      const memberIds = new Set(members.map((m) => m.id));
      return templateIds.some((id) => !memberIds.has(id));
    }
    // Region / related checklist: customized when any region is selected.
    return members.length > 0;
  }
  return false;
}

function requisitionHasContent(
  req: InvestigationImagingRequisition | null | undefined,
): boolean {
  if (!req) return false;
  return Boolean(
    req.contrast ||
      (req.site && req.site.trim()) ||
      (req.indication && req.indication.trim()) ||
      req.urgency,
  );
}

const CONTRAST_FLAT: Record<InvestigationImagingContrast, string> = {
  plain: "plain",
  contrast: "CECT",
  both: "plain+contrast",
};

function contrastFromFlatToken(
  token: string,
): InvestigationImagingContrast | null {
  const t = normalizeKey(token);
  if (t === "plain" || t === "ncct" || t === "non contrast") return "plain";
  if (
    t === "cect" ||
    t === "contrast" ||
    t === "with contrast" ||
    t === "c+" ||
    t === "gad" ||
    t === "with gad"
  ) {
    return "contrast";
  }
  if (t === "plain+contrast" || t === "both" || t === "plain and contrast") {
    return "both";
  }
  return null;
}

function formatRequisitionParen(
  req: InvestigationImagingRequisition | null | undefined,
): string {
  if (!requisitionHasContent(req) || !req) return "";
  const parts: string[] = [];
  if (req.contrast) parts.push(CONTRAST_FLAT[req.contrast]);
  if (req.site?.trim()) parts.push(req.site.trim());
  if (req.urgency === "urgent") parts.push("urgent");
  else if (req.urgency === "routine") parts.push("routine");
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

function formatOrderForFlat(order: InvestigationOrder): string {
  if (order.kind === "panel") {
    const members = order.members ?? [];
    if (!isBasketCustomized(order)) return order.label;
    if (members.length === 0) return `${order.label}:`;
    return `${order.label}: ${members.map((m) => m.label).join(", ")}`;
  }
  if (order.kind === "imaging") {
    const imaging = getImagingOrderById(order.sourcePanelId ?? order.id);
    const reqSuffix = formatRequisitionParen(order.requisition);
    const indication = order.requisition?.indication?.trim() ?? "";
    const members = order.members ?? [];
    const membershipCustom = isBasketMembershipCustomized(order);
    const hasReq = requisitionHasContent(order.requisition);
    // Untouched study name only; requisition and/or member edits both print.
    if (!membershipCustom && !hasReq) return order.label;
    let body = `${order.label}${reqSuffix}`;
    if (members.length > 0) {
      body = `${body}: ${members.map((m) => m.label).join(", ")}`;
    } else if (
      imagingOrderHasViews(imaging) &&
      membershipCustom &&
      !reqSuffix &&
      !indication
    ) {
      body = `${order.label}:`;
    }
    if (indication) body = `${body} — ${indication}`;
    return body;
  }
  if (order.kind === "custom") {
    const members = order.members ?? [];
    if (members.length === 0) return order.label;
    return `${order.label}: ${members.map((m) => m.label).join(", ")}`;
  }
  return order.label;
}

/** Serialize structured orders to the flat investigations_orders TEXT (INV-D8/D11). */
export function serializeInvestigationOrdersToFlat(
  orders: readonly InvestigationOrder[],
): string {
  return orders
    .map((o) => formatOrderForFlat(o).trim())
    .filter(Boolean)
    .join("; ");
}

function memberFromCatalogEntry(
  entry: InvestigationOrderCatalogEntry,
): InvestigationOrderMember {
  return { id: entry.id, label: entry.label, kind: entry.kind };
}

function splitIndication(segment: string): {
  head: string;
  indication: string | null;
} {
  const idx = segment.indexOf(" — ");
  if (idx < 0) return { head: segment.trim(), indication: null };
  return {
    head: segment.slice(0, idx).trim(),
    indication: segment.slice(idx + 3).trim() || null,
  };
}

function parseTitleRequisition(titleRaw: string): {
  label: string;
  requisition: InvestigationImagingRequisition | null;
} {
  const match = titleRaw.match(/^(.*?)(?:\s*\(([^)]*)\))\s*$/);
  const label = (match?.[1] ?? titleRaw).trim();
  const paren = match?.[2]?.trim() ?? "";
  if (!paren) return { label, requisition: null };

  const tokens = paren
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  let contrast: InvestigationImagingContrast | null = null;
  let urgency: InvestigationImagingUrgency | null = null;
  const siteParts: string[] = [];
  for (const token of tokens) {
    const c = contrastFromFlatToken(token);
    if (c) {
      contrast = c;
      continue;
    }
    const key = normalizeKey(token);
    if (key === "urgent") {
      urgency = "urgent";
      continue;
    }
    if (key === "routine") {
      urgency = "routine";
      continue;
    }
    siteParts.push(token);
  }
  const site = siteParts.length > 0 ? siteParts.join(", ") : null;
  if (!contrast && !urgency && !site) return { label, requisition: null };
  return {
    label,
    requisition: { contrast, site, indication: null, urgency },
  };
}

function parseBasketSegment(segment: string): InvestigationOrder | null {
  const { head, indication } = splitIndication(segment);
  const colon = head.indexOf(":");
  const hasColon = colon > 0;
  const titleRaw = hasColon ? head.slice(0, colon).trim() : head.trim();
  const rest = hasColon ? head.slice(colon + 1).trim() : "";
  if (!titleRaw) return null;

  // Avoid treating "SGOT (AST)" style labels as baskets when there is no member list
  // and no requisition / indication payload.
  if (
    !rest &&
    !indication &&
    resolveOrderCatalogEntryFromLabel(segment)
  ) {
    return null;
  }
  if (
    rest &&
    !rest.includes(",") &&
    !indication &&
    resolveOrderCatalogEntryFromLabel(segment)
  ) {
    return null;
  }

  const { label: title, requisition: titleReq } =
    parseTitleRequisition(titleRaw);
  const requisition: InvestigationImagingRequisition | null =
    titleReq || indication
      ? {
          contrast: titleReq?.contrast ?? null,
          site: titleReq?.site ?? null,
          urgency: titleReq?.urgency ?? null,
          indication,
        }
      : null;

  // Requisition-only (no colon) — e.g. `CT brain (CECT) — headache`
  if (!hasColon) {
    if (!requisitionHasContent(requisition) && !indication) return null;
    const source = resolveOrderCatalogEntryFromLabel(title);
    if (source?.kind === "imaging") {
      const basket = createImagingBasket(source.id);
      return {
        ...(basket ?? {
          id: source.id,
          label: source.label,
          kind: "imaging" as const,
          sourcePanelId: source.id,
          members: [],
        }),
        label: title,
        requisition,
      };
    }
    return null;
  }

  // Avoid treating "SGOT (AST)" when rest empty and exact catalog hit on full segment.
  if (!rest && resolveOrderCatalogEntryFromLabel(segment) && !requisition) {
    return null;
  }

  const memberLabels = rest
    ? rest
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
    : [];

  const members = memberLabels.map((raw) => {
    const view = lookupImagingViewByAlias(raw);
    if (view) {
      return { id: view.id, label: view.name, kind: "custom" as const };
    }
    const entry = resolveOrderCatalogEntryFromLabel(raw);
    if (entry) return memberFromCatalogEntry(entry);
    const label = raw.trim();
    return {
      id: `custom:${normalizeKey(label)}`,
      label,
      kind: "custom" as const,
    };
  });

  const source = resolveOrderCatalogEntryFromLabel(title);
  if (source?.kind === "imaging") {
    const imaging = getImagingOrderById(source.id);
    if (imaging && imagingOrderIsExpandable(imaging)) {
      return {
        id: source.id,
        label: title,
        kind: "imaging",
        sourcePanelId: source.id,
        members,
        ...(requisition ? { requisition } : {}),
      };
    }
  }
  if (source?.kind === "panel") {
    return {
      id: source.id,
      label: title,
      kind: "panel",
      sourcePanelId: source.id,
      members,
    };
  }
  // Freeform / renamed package → custom expandable basket.
  return {
    id: `custom:${normalizeKey(title)}`,
    label: title,
    kind: "custom",
    members,
  };
}

function orderFromCatalogOrCustom(label: string): InvestigationOrder {
  const entry = resolveOrderCatalogEntryFromLabel(label);
  if (entry?.kind === "panel") {
    return createPanelBasket(entry.id) ?? {
      id: entry.id,
      label: entry.label,
      kind: "panel",
      sourcePanelId: entry.id,
      members: [],
    };
  }
  if (entry?.kind === "imaging") {
    return (
      createImagingBasket(entry.id) ?? {
        id: entry.id,
        label: entry.label,
        kind: "imaging",
      }
    );
  }
  if (entry) {
    return { id: entry.id, label: entry.label, kind: entry.kind };
  }
  return createCustomBasket(label);
}

/**
 * Parse flat investigations_orders TEXT into structured orders (including
 * customized baskets encoded as `Title: a, b, c`).
 */
export function parseInvestigationOrdersFromFlat(
  value: string,
): InvestigationOrder[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  // Top-level orders are semicolon-separated; commas stay inside basket bodies.
  const segments = trimmed
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
  const out: InvestigationOrder[] = [];
  const seen = new Set<string>();

  for (const segment of segments) {
    const basket = parseBasketSegment(segment);
    const order = basket ?? orderFromCatalogOrCustom(canonicalizeOrderLabel(segment) || segment);
    const key = `${order.kind}:${order.id.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(order);
  }
  return out;
}

/**
 * Derive structured investigation orders from the flat chip labels (INV-D8 /
 * migration 167 / INV-D11 baskets). Prefer this at the save boundary when the
 * form already holds structured state — otherwise parse the flat string.
 */
export function deriveInvestigationOrdersJson(
  value: string,
): InvestigationOrder[] {
  return parseInvestigationOrdersFromFlat(value);
}

/** Occupied keys for a structured order list (panels occupy member analytes). */
export function occupiedKeysFromOrders(
  orders: readonly InvestigationOrder[],
): Set<string> {
  const keys = new Set<string>();
  for (const order of orders) {
    if (order.kind === "custom") {
      keys.add(
        order.id.startsWith("custom:") ? order.id : `custom:${order.id}`,
      );
    } else {
      keys.add(`${order.kind}:${order.id}`);
    }
    if (order.kind === "panel") {
      for (const m of order.members ?? []) {
        keys.add(`${m.kind}:${m.id}`);
        if (m.kind === "analyte") keys.add(`analyte:${m.id}`);
      }
      const sourceId = order.sourcePanelId ?? order.id;
      const panel = getLabPanelById(sourceId);
      if (panel) {
        for (const analyteId of panel.analyteIds) {
          keys.add(`analyte:${analyteId}`);
        }
      }
    }
    if (order.kind === "imaging" || order.kind === "custom") {
      for (const m of order.members ?? []) {
        keys.add(`${m.kind}:${m.id}`);
        if (order.kind === "imaging") keys.add(`view:${m.id}`);
        if (m.kind === "analyte") keys.add(`analyte:${m.id}`);
      }
    }
  }
  return keys;
}

/** Add a catalog/custom entry as a member of an expandable basket. */
export function addMemberToBasket(
  order: InvestigationOrder,
  member: InvestigationOrderMember,
): InvestigationOrder {
  if (
    order.kind !== "panel" &&
    order.kind !== "imaging" &&
    order.kind !== "custom"
  ) {
    return order;
  }
  const members = [...(order.members ?? [])];
  if (members.some((m) => m.kind === member.kind && m.id === member.id)) {
    return order;
  }
  // Same label custom dedupe
  if (
    members.some(
      (m) => normalizeKey(m.label) === normalizeKey(member.label),
    )
  ) {
    return order;
  }
  members.push(member);
  return { ...order, members };
}

export function toggleBasketMember(
  order: InvestigationOrder,
  memberId: string,
): InvestigationOrder {
  if (order.kind === "panel") {
    const members = [...(order.members ?? [])];
    const idx = members.findIndex((m) => m.id === memberId);
    if (idx >= 0) {
      members.splice(idx, 1);
    } else {
      const analyte = getLabAnalyteById(memberId);
      if (analyte) {
        members.push({
          id: analyte.id,
          label: analyte.name,
          kind: "analyte",
        });
      }
    }
    return { ...order, members };
  }
  if (order.kind === "imaging") {
    const members = [...(order.members ?? [])];
    const idx = members.findIndex((m) => m.id === memberId);
    if (idx >= 0) {
      members.splice(idx, 1);
    } else {
      const view = getImagingViewById(memberId);
      if (view) {
        members.push({
          id: view.id,
          label: view.name,
          kind: "custom",
        });
      }
    }
    return { ...order, members };
  }
  if (order.kind === "custom") {
    const members = [...(order.members ?? [])];
    const idx = members.findIndex((m) => m.id === memberId);
    if (idx >= 0) members.splice(idx, 1);
    return { ...order, members };
  }
  return order;
}

export function renameBasket(
  order: InvestigationOrder,
  title: string,
): InvestigationOrder {
  const label = title.trim();
  if (
    !label ||
    (order.kind !== "panel" &&
      order.kind !== "imaging" &&
      order.kind !== "custom")
  ) {
    return order;
  }
  return { ...order, label };
}

/**
 * Map AI-normalized order TERMS onto catalog entries (inv-lib-04, client-side
 * constraint). The backend resolver only cleans up messy/vernacular text into
 * terms; the catalog owns identity, so each term is re-resolved here — the model
 * can never surface an order the catalog does not know. Occupied entries are
 * skipped and results are de-duplicated by identity, best (exact) first.
 */
export function mapResolvedTermsToCatalog(
  terms: readonly string[],
  occupied: ReadonlySet<string> = new Set(),
  limit = 5,
): InvestigationOrderCatalogEntry[] {
  const out: InvestigationOrderCatalogEntry[] = [];
  const seen = new Set<string>();

  const push = (entry: InvestigationOrderCatalogEntry): void => {
    const key = `${entry.kind}:${entry.id}`;
    if (seen.has(key)) return;
    if (isEntryOccupied(entry, occupied)) return;
    seen.add(key);
    out.push(entry);
  };

  for (const raw of terms) {
    if (out.length >= limit) break;
    const term = raw.trim();
    if (!term) continue;

    const exact = resolveOrderCatalogEntryFromLabel(term);
    if (exact) {
      push(exact);
      continue;
    }
    const [best] = suggestInvestigationOrders(term, occupied, 1);
    if (best) push(best);
  }

  return out.slice(0, limit);
}
