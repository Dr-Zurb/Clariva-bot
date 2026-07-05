/**
 * Per-site edema model (obj-32).
 *
 * Each selected site carries its own laterality, grade, severity, context, and notes.
 * Stored on `ExamFindingEntry.attributes.sitesJson` as a JSON array.
 */

export const EDEMA_SITES_JSON_KEY = "sitesJson";

export type EdemaSiteId =
  | "pedal"
  | "pretibial"
  | "ankle"
  | "sacral"
  | "periorbital"
  | "generalized";

export type EdemaGrade = "G1" | "G2" | "G3" | "G4" | "Non-pitting";

export type EdemaLaterality = "Bilateral" | "Left" | "Right";

export type EdemaSeverity = "Mild" | "Moderate" | "Severe";

export interface EdemaSiteCatalogItem {
  id: EdemaSiteId;
  label: string;
}

export interface EdemaSiteEntry {
  site: EdemaSiteId;
  laterality?: EdemaLaterality;
  grade?: EdemaGrade;
  severity?: EdemaSeverity;
  context?: string[];
  notes?: string;
}

export interface EdemaGradeReferenceRow {
  grade: EdemaGrade;
  pitDepth: string;
  rebound: string;
}

export const EDEMA_SITE_CATALOG: readonly EdemaSiteCatalogItem[] = [
  { id: "pedal", label: "Pedal" },
  { id: "pretibial", label: "Pretibial" },
  { id: "ankle", label: "Ankle" },
  { id: "sacral", label: "Sacral" },
  { id: "periorbital", label: "Periorbital" },
  { id: "generalized", label: "Generalized" },
] as const;

export const EDEMA_LATERALITY_CHIPS: readonly EdemaLaterality[] = [
  "Bilateral",
  "Left",
  "Right",
] as const;

export const EDEMA_GRADE_CHIPS: readonly EdemaGrade[] = [
  "G1",
  "G2",
  "G3",
  "G4",
  "Non-pitting",
] as const;

export const EDEMA_SEVERITY_CHIPS: readonly EdemaSeverity[] = [
  "Mild",
  "Moderate",
  "Severe",
] as const;

export const EDEMA_CONTEXT_CHIPS = [
  "Acute",
  "Chronic",
  "Dependent",
  "On diuretics",
] as const;

export const EDEMA_GRADE_REFERENCE: readonly EdemaGradeReferenceRow[] = [
  { grade: "G1", pitDepth: "~2 mm pit", rebound: "Immediate rebound" },
  { grade: "G2", pitDepth: "~4 mm pit", rebound: "Rebound in 10–15 s" },
  { grade: "G3", pitDepth: "~6 mm pit", rebound: "Rebound in 1–2 min" },
  { grade: "G4", pitDepth: "~8 mm pit", rebound: "Rebound in >2 min" },
  {
    grade: "Non-pitting",
    pitDepth: "No pit on pressure",
    rebound: "—",
  },
] as const;

const EDEMA_SITE_ORDER = EDEMA_SITE_CATALOG.map((item) => item.id);

const SITE_LABEL_TO_ID = new Map(
  EDEMA_SITE_CATALOG.map((item) => [item.label.toLowerCase(), item.id]),
);

export function edemaSiteLabel(siteId: EdemaSiteId): string {
  return EDEMA_SITE_CATALOG.find((item) => item.id === siteId)?.label ?? siteId;
}

export function resolveEdemaSiteId(label: string): EdemaSiteId | null {
  const normalized = label.trim().toLowerCase();
  const byLabel = SITE_LABEL_TO_ID.get(normalized);
  if (byLabel) return byLabel;
  const byId = EDEMA_SITE_ORDER.find((id) => id === normalized);
  return byId ?? null;
}

function splitCommaSeparated(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function sanitizeEdemaSiteEntry(raw: unknown): EdemaSiteEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const siteRaw = typeof row.site === "string" ? row.site.trim() : "";
  const site = resolveEdemaSiteId(siteRaw);
  if (!site) return null;

  const entry: EdemaSiteEntry = { site };

  if (typeof row.laterality === "string") {
    const lat = row.laterality.trim() as EdemaLaterality;
    if (EDEMA_LATERALITY_CHIPS.includes(lat) && site !== "generalized") {
      entry.laterality = lat;
    }
  }

  if (typeof row.grade === "string") {
    const grade = row.grade.trim() as EdemaGrade;
    if (EDEMA_GRADE_CHIPS.includes(grade)) entry.grade = grade;
  }

  if (typeof row.severity === "string") {
    const severity = row.severity.trim() as EdemaSeverity;
    if (EDEMA_SEVERITY_CHIPS.includes(severity)) entry.severity = severity;
  }

  if (Array.isArray(row.context)) {
    const context = row.context
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
    if (context.length > 0) entry.context = context;
  } else if (typeof row.context === "string") {
    const context = splitCommaSeparated(row.context);
    if (context.length > 0) entry.context = context;
  }

  if (typeof row.notes === "string") {
    const notes = row.notes.trim();
    if (notes) entry.notes = notes;
  }

  return entry;
}

function sortEdemaSites(sites: EdemaSiteEntry[]): EdemaSiteEntry[] {
  return [...sites].sort((a, b) => {
    const ai = EDEMA_SITE_ORDER.indexOf(a.site);
    const bi = EDEMA_SITE_ORDER.indexOf(b.site);
    return ai - bi;
  });
}

function migrateLegacyPitting(pitting: string | undefined): EdemaGrade | undefined {
  const value = pitting?.trim();
  if (!value) return undefined;
  if (value === "+") return "G1";
  if (value === "++") return "G2";
  if (value === "+++") return "G3";
  if (value.toLowerCase() === "non-pitting") return "Non-pitting";
  if (EDEMA_GRADE_CHIPS.includes(value as EdemaGrade)) return value as EdemaGrade;
  return undefined;
}

/** Parse `sitesJson`; returns empty array when absent or invalid. */
export function parseEdemaSites(attributes: Record<string, string>): EdemaSiteEntry[] {
  const raw = attributes[EDEMA_SITES_JSON_KEY]?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      const sites: EdemaSiteEntry[] = [];
      for (const item of parsed) {
        const entry = sanitizeEdemaSiteEntry(item);
        if (entry) sites.push(entry);
      }
      return sortEdemaSites(sites);
    } catch {
      return [];
    }
  }
  return [];
}

/** Migrate flat legacy edema attrs into `sitesJson`. */
export function migrateEdemaAttributes(
  attributes: Record<string, string>,
): Record<string, string> {
  const existing = parseEdemaSites(attributes);
  if (existing.length > 0) {
    return { [EDEMA_SITES_JSON_KEY]: serializeEdemaSites(existing) };
  }

  const legacySites = splitCommaSeparated(attributes.site);
  if (legacySites.length === 0) return attributes;

  const sharedLaterality = attributes.laterality?.trim() as EdemaLaterality | undefined;
  const sharedGrade = migrateLegacyPitting(attributes.pitting);
  const sharedSeverity = attributes.severity?.trim() as EdemaSeverity | undefined;
  const sharedContext = splitCommaSeparated(attributes.context);
  const sharedNotes = attributes.notes?.trim();

  const sites: EdemaSiteEntry[] = [];
  for (const label of legacySites) {
    const site = resolveEdemaSiteId(label);
    if (!site) continue;
    const entry: EdemaSiteEntry = { site };
    if (sharedLaterality && site !== "generalized") entry.laterality = sharedLaterality;
    if (sharedGrade) entry.grade = sharedGrade;
    if (sharedSeverity) entry.severity = sharedSeverity;
    if (sharedContext.length > 0) entry.context = sharedContext;
    if (sharedNotes) entry.notes = sharedNotes;
    sites.push(entry);
  }

  if (sites.length === 0) return attributes;
  return { [EDEMA_SITES_JSON_KEY]: serializeEdemaSites(sites) };
}

export function serializeEdemaSites(sites: readonly EdemaSiteEntry[]): string {
  const cleaned = sortEdemaSites(
    sites
      .map((entry) => sanitizeEdemaSiteEntry(entry))
      .filter((entry): entry is EdemaSiteEntry => entry !== null),
  );
  return JSON.stringify(cleaned);
}

export function edemaSiteEntryHasDetails(entry: EdemaSiteEntry): boolean {
  return Boolean(
    entry.laterality ||
      entry.grade ||
      entry.severity ||
      (entry.context?.length ?? 0) > 0 ||
      entry.notes?.trim(),
  );
}

export function edemaAttributesHaveContent(attributes: Record<string, string>): boolean {
  return parseEdemaSites(migrateEdemaAttributes(attributes)).length > 0;
}

function formatEdemaSiteSegment(entry: EdemaSiteEntry): string {
  const label = edemaSiteLabel(entry.site);
  const parts: string[] = [];
  if (entry.laterality) parts.push(entry.laterality);
  if (entry.grade) parts.push(entry.grade);
  if (entry.severity) parts.push(entry.severity);
  if (entry.context?.length) parts.push(...entry.context);
  if (entry.notes?.trim()) parts.push(entry.notes.trim());
  return parts.length > 0 ? `${label} (${parts.join(", ")})` : label;
}

/** Collapsed preview segments, e.g. `Pedal (Left, G2)`. */
export function edemaPreviewParts(attributes: Record<string, string>): string[] {
  const sites = parseEdemaSites(migrateEdemaAttributes(attributes));
  return sites.map(formatEdemaSiteSegment);
}

/** Derived-text detail for exam summary, e.g. `Pedal: left, G2; Ankle: right, G1`. */
export function edemaDerivedDetail(attributes: Record<string, string>): string {
  const sites = parseEdemaSites(migrateEdemaAttributes(attributes));
  return sites
    .map((entry) => {
      const label = edemaSiteLabel(entry.site);
      const parts: string[] = [];
      if (entry.laterality) parts.push(entry.laterality.toLowerCase());
      if (entry.grade) parts.push(entry.grade);
      if (entry.severity) parts.push(entry.severity.toLowerCase());
      if (entry.context?.length) parts.push(...entry.context.map((c) => c.toLowerCase()));
      if (entry.notes?.trim()) parts.push(entry.notes.trim());
      return parts.length > 0 ? `${label}: ${parts.join(", ")}` : label;
    })
    .join("; ");
}

export function patchEdemaSites(
  sites: readonly EdemaSiteEntry[],
  siteId: EdemaSiteId,
  patch: Partial<Omit<EdemaSiteEntry, "site">>,
): EdemaSiteEntry[] {
  const index = sites.findIndex((entry) => entry.site === siteId);
  if (index === -1) return [...sites];

  const current = sites[index]!;
  const merged = { ...current, ...patch, site: siteId };
  const next: EdemaSiteEntry = { site: siteId };

  if (siteId !== "generalized" && merged.laterality) {
    next.laterality = merged.laterality;
  }
  if (merged.grade) next.grade = merged.grade;
  if (merged.severity) next.severity = merged.severity;
  if (merged.context?.length) next.context = merged.context;
  if (merged.notes?.trim()) next.notes = merged.notes.trim();

  const updated = [...sites];
  updated[index] = next;
  return updated;
}

export function toggleEdemaSite(
  sites: readonly EdemaSiteEntry[],
  siteId: EdemaSiteId,
): EdemaSiteEntry[] {
  const exists = sites.some((entry) => entry.site === siteId);
  if (exists) return sites.filter((entry) => entry.site !== siteId);
  return sortEdemaSites([...sites, { site: siteId }]);
}
