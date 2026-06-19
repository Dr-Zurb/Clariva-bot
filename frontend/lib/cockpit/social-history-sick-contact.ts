export type SickContactType =
  | "flu-covid-cold"
  | "tb-cough"
  | "measles-chickenpox"
  | "gi-contact"
  | "skin-scabies"
  | "unknown"
  | "other";

export type SickContactContext =
  | "household"
  | "workplace"
  | "travel"
  | "healthcare-setting"
  | "other";

/** @deprecated Legacy sick-contact type — migrated to travel.vectorRisk on normalize. */
export type LegacySickContactType =
  | "fever-dengue-malaria"
  | "respiratory"
  | "gi"
  | "rash-measles";

export interface SickContactSectionInput {
  present?: boolean;
  types?: SickContactType[];
  context?: SickContactContext[];
  notes?: string;
}

export const SICK_CONTACT_TYPE_OPTIONS: readonly {
  value: SickContactType;
  label: string;
}[] = [
  { value: "flu-covid-cold", label: "Flu / COVID / cold" },
  { value: "tb-cough", label: "TB / prolonged cough" },
  { value: "measles-chickenpox", label: "Measles / chickenpox / mumps" },
  { value: "gi-contact", label: "Diarrhoea / vomiting (contact)" },
  { value: "skin-scabies", label: "Skin rash / scabies" },
  { value: "unknown", label: "Unknown" },
  { value: "other", label: "Other" },
] as const;

export const SICK_CONTACT_CONTEXT_OPTIONS: readonly {
  value: SickContactContext;
  label: string;
}[] = [
  { value: "household", label: "Household member" },
  { value: "workplace", label: "Workplace / colleague" },
  { value: "travel", label: "Travel" },
  { value: "healthcare-setting", label: "Healthcare setting" },
  { value: "other", label: "Other" },
] as const;

const SICK_CONTACT_TYPE_LABELS: Record<SickContactType, string> = {
  "flu-covid-cold": "Flu/COVID/cold",
  "tb-cough": "TB/prolonged cough",
  "measles-chickenpox": "Measles/chickenpox/mumps",
  "gi-contact": "Diarrhoea/vomiting (contact)",
  "skin-scabies": "Skin rash/scabies",
  unknown: "Unknown",
  other: "Other",
};

const LEGACY_SICK_CONTACT_TYPE_LABELS: Record<LegacySickContactType, string> = {
  "fever-dengue-malaria": "Fever/dengue/malaria",
  respiratory: "Respiratory",
  gi: "Diarrhoea/vomiting",
  "rash-measles": "Rash/measles/chickenpox",
};

const SICK_CONTACT_CONTEXT_LABELS: Record<SickContactContext, string> = {
  household: "Household",
  workplace: "Workplace",
  travel: "Travel",
  "healthcare-setting": "Healthcare setting",
  other: "Other",
};

export function isLegacyVectorSickContactType(value: string): boolean {
  return value === "fever-dengue-malaria";
}

function migrateSickContactType(value: string): SickContactType | undefined {
  if (isLegacyVectorSickContactType(value)) return undefined;
  if (value === "respiratory") return "flu-covid-cold";
  if (value === "gi") return "gi-contact";
  if (value === "rash-measles") return "measles-chickenpox";
  return SICK_CONTACT_TYPE_OPTIONS.find((option) => option.value === value)?.value;
}

export function sickContactHasContent(
  section: SickContactSectionInput | null | undefined,
): boolean {
  if (!section) return false;
  if (section.present != null) return true;
  if ((section.types?.length ?? 0) > 0) return true;
  if ((section.context?.length ?? 0) > 0) return true;
  if (section.notes?.trim()) return true;
  return false;
}

export function normalizeSickContactSection(
  input: SickContactSectionInput | null | undefined,
): SickContactSectionInput | null {
  if (!input) return null;

  const cleaned: SickContactSectionInput = {};
  if (typeof input.present === "boolean") cleaned.present = input.present;

  const types = [...(input.types ?? [])]
    .map((entry) => migrateSickContactType(String(entry)))
    .filter((entry): entry is SickContactType => entry != null);
  if (types.length > 0) cleaned.types = types;

  const context = [...(input.context ?? [])]
    .map((entry) => migrateSickContactContext(String(entry)))
    .filter((entry): entry is SickContactContext => entry != null);
  if (context.length > 0) cleaned.context = context;

  const notes = input.notes?.trim();
  if (notes) cleaned.notes = notes;

  return sickContactHasContent(cleaned) ? cleaned : null;
}

export function serializeSickContactSection(section: SickContactSectionInput): string {
  const normalized = normalizeSickContactSection(section);
  if (!normalized) return "";

  if (normalized.present === false) return "Sick contact: None";

  const parts: string[] = [];
  if (normalized.types?.length) {
    parts.push(
      normalized.types.map((type) => SICK_CONTACT_TYPE_LABELS[type] ?? type).join(", "),
    );
  } else if (normalized.present === true) {
    parts.push("Recent contact");
  }

  if (normalized.context?.length) {
    parts.push(
      normalized.context.map((ctx) => SICK_CONTACT_CONTEXT_LABELS[ctx] ?? ctx).join(", "),
    );
  }

  if (normalized.notes?.trim()) parts.push(normalized.notes.trim());

  if (parts.length === 0) return "";
  return `Sick contact: ${parts.join(" · ")}`;
}

function resolveSickContactType(value: string): SickContactType | undefined {
  const trimmed = value.trim().toLowerCase();
  const migrated = migrateSickContactType(trimmed);
  if (migrated) return migrated;

  return SICK_CONTACT_TYPE_OPTIONS.find(
    (option) =>
      option.value === trimmed ||
      option.label.toLowerCase() === trimmed ||
      SICK_CONTACT_TYPE_LABELS[option.value]?.toLowerCase() === trimmed,
  )?.value;
}

function migrateSickContactContext(value: string): SickContactContext | undefined {
  if (value === "travel-companion") return "travel";
  return SICK_CONTACT_CONTEXT_OPTIONS.find((option) => option.value === value)?.value;
}

function resolveSickContactContext(value: string): SickContactContext | undefined {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "travel companion") return "travel";
  return SICK_CONTACT_CONTEXT_OPTIONS.find(
    (option) =>
      option.value === trimmed ||
      option.label.toLowerCase() === trimmed ||
      SICK_CONTACT_CONTEXT_LABELS[option.value]?.toLowerCase() === trimmed,
  )?.value;
}

/** Parse value after `Sick contact:` from derived TEXT. */
export function parseSickContactText(value: string): SickContactSectionInput {
  const raw = value.trim();
  if (!raw) return {};
  if (/^none$/i.test(raw)) return { present: false };

  const section: SickContactSectionInput = { present: true };
  const segments = raw.split(/\s*·\s*/).map((part) => part.trim()).filter(Boolean);
  const types: SickContactType[] = [];
  const context: SickContactContext[] = [];
  const noteParts: string[] = [];

  for (const segment of segments) {
    if (/^recent contact$/i.test(segment)) continue;

    const typeTokens = segment.split(/,\s*/).map((token) => token.trim()).filter(Boolean);
    const resolvedTypes = typeTokens
      .map((token) => {
        const legacyLabel = Object.entries(LEGACY_SICK_CONTACT_TYPE_LABELS).find(
          ([, label]) => label.toLowerCase() === token.toLowerCase(),
        )?.[0];
        if (legacyLabel) return migrateSickContactType(legacyLabel);
        return resolveSickContactType(token);
      })
      .filter((token): token is SickContactType => token != null);
    if (resolvedTypes.length === typeTokens.length && resolvedTypes.length > 0) {
      types.push(...resolvedTypes);
      continue;
    }

    const contextTokens = segment.split(/,\s*/).map((token) => token.trim()).filter(Boolean);
    const resolvedContext = contextTokens
      .map((token) => resolveSickContactContext(token))
      .filter((token): token is SickContactContext => token != null);
    if (resolvedContext.length === contextTokens.length && resolvedContext.length > 0) {
      context.push(...resolvedContext);
      continue;
    }

    noteParts.push(segment);
  }

  if (types.length > 0) section.types = types;
  if (context.length > 0) section.context = context;
  if (noteParts.length > 0) section.notes = noteParts.join(" · ");

  return section;
}

export function sickContactInputPromotesVectorRisk(
  input: SickContactSectionInput | null | undefined,
): boolean {
  return (input?.types ?? []).some((type) => isLegacyVectorSickContactType(String(type)));
}
