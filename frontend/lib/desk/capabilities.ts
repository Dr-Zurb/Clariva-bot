export const STAFF_CAPABILITIES = [
  "front_desk",
  "vitals",
  "history",
  "internal_labs",
  "papers",
] as const;
export type StaffCapability = (typeof STAFF_CAPABILITIES)[number];

export const PREP_CAPABILITIES = [
  "vitals",
  "history",
  "internal_labs",
  "papers",
] as const;
export type PrepCapability = (typeof PREP_CAPABILITIES)[number];

export const DEFAULT_STAFF_CAPABILITIES: StaffCapability[] = [...STAFF_CAPABILITIES];

export const STAFF_JOB_LABELS: Record<StaffCapability, string> = {
  front_desk: "Registration & payments",
  vitals: "Vitals",
  history: "Health record",
  internal_labs: "Internal labs",
  papers: "Patient files",
};

export const STAFF_JOB_HELP: Record<StaffCapability, string> = {
  front_desk: "Search, register, book, arrive, collect, move, and mark left.",
  vitals: "This visit's readings.",
  history:
    "Allergies, known conditions, and current medicines — these details go on the health record.",
  internal_labs: "Labs this clinic ran — photograph and extract values.",
  papers:
    "What the patient brought — outside reports, old prescriptions, referrals, imaging, discharge notes.",
};

const PREVISIT_FOLD: readonly StaffCapability[] = [
  "vitals",
  "history",
  "internal_labs",
  "papers",
];

function foldDeskCapabilities(input: readonly string[]): StaffCapability[] {
  const held = new Set<StaffCapability>();
  for (const raw of input) {
    if (raw === "front_desk" || raw === "billing") {
      held.add("front_desk");
      continue;
    }
    if (raw === "previsit") {
      for (const cap of PREVISIT_FOLD) held.add(cap);
      continue;
    }
    if ((STAFF_CAPABILITIES as readonly string[]).includes(raw)) {
      held.add(raw as StaffCapability);
    }
  }
  return STAFF_CAPABILITIES.filter((cap) => held.has(cap));
}

export function normalizeDeskCapabilities(
  input?: readonly string[],
): StaffCapability[] {
  if (!input || input.length === 0) return [...DEFAULT_STAFF_CAPABILITIES];
  const next = foldDeskCapabilities(input);
  return next.length > 0 ? next : [...DEFAULT_STAFF_CAPABILITIES];
}

export function hasDeskCapability(
  capabilities: readonly string[] | undefined,
  capability: StaffCapability,
): boolean {
  if (!capabilities) return true;
  return foldDeskCapabilities(capabilities).includes(capability);
}

export function hasAnyDeskPrepCapability(
  capabilities: readonly string[] | undefined,
): boolean {
  return PREP_CAPABILITIES.some((cap) => hasDeskCapability(capabilities, cap));
}

/** Held prep seats in clinic flow order. Never sort by assignment or alphabet. */
export function deskPrepSlots(
  capabilities?: readonly string[],
): PrepCapability[] {
  return PREP_CAPABILITIES.filter((slot) =>
    hasDeskCapability(capabilities, slot),
  );
}

export function deskPrepSaveLabel(
  slots: readonly PrepCapability[],
  current: PrepCapability,
): "Done" | "Save and next" {
  return slots[slots.length - 1] === current ? "Done" : "Save and next";
}

/** Prep seats only — no counter. Home is Today, not Check-in. */
export function isDeskPrepOnly(
  capabilities?: readonly string[],
): boolean {
  return (
    !hasDeskCapability(capabilities, "front_desk") &&
    hasAnyDeskPrepCapability(capabilities)
  );
}

export function deskHomeHref(
  capabilities?: readonly string[],
): "/desk" | "/desk/today" {
  return isDeskPrepOnly(capabilities) ? "/desk/today" : "/desk";
}

export function deskShowsCheckInNav(
  capabilities?: readonly string[],
): boolean {
  return hasDeskCapability(capabilities, "front_desk");
}

/** Today action: one job uses that job's name; several jobs say Prep. */
export function deskPrepActionLabel(
  capabilities?: readonly string[],
): string {
  const slots = deskPrepSlots(capabilities);
  if (slots.length === 1) return STAFF_JOB_LABELS[slots[0]];
  return "Prep";
}

export function isInternalLabDocument(
  documentType: string,
  orderedBy: string,
): boolean {
  return documentType === "lab_report" && orderedBy === "us";
}

/** Today "Labs pending" chip — a mode, not a status bucket. */
export function deskShowsLabsPending(
  capabilities?: readonly string[],
): boolean {
  return hasDeskCapability(capabilities, "internal_labs");
}

/**
 * Collector-only login: hide the OPD day board.
 * Undefined capabilities (doctor / loading) stay on the board.
 */
export function isDeskLabsOnly(
  capabilities?: readonly string[],
): boolean {
  if (!capabilities) return false;
  const held = foldDeskCapabilities(capabilities);
  return held.length === 1 && held[0] === "internal_labs";
}

export function deskNavTodayLabel(
  capabilities?: readonly string[],
): "Labs" | "Today" {
  return isDeskLabsOnly(capabilities) ? "Labs" : "Today";
}
