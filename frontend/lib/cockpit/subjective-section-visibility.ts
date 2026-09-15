import {
  isCustomBlockSectionId,
  SUBJECTIVE_SECTION_LABELS,
  type StaticSubjectiveSectionId,
  type SubjectiveSectionId,
} from "@/lib/cockpit/subjective-section-order";

/** Per-doctor hidden section ids. Empty stored set ⇒ factory lean default. */
export type SubjectiveSectionHiddenSet = SubjectiveSectionId[];

/**
 * Visible at factory default. Surgical / family / social history stay one tap
 * away in the manage-sections menu (same contract as CORE_CLASSIC_VITAL_KEYS).
 */
export const CORE_SUBJECTIVE_DEFAULT_VISIBLE_IDS = [
  "chief_complaints",
  "patient_background",
  "allergies",
  "free_text_notes",
] as const;

const CORE_VISIBLE_SET = new Set<string>(CORE_SUBJECTIVE_DEFAULT_VISIBLE_IDS);

const STATIC_SECTION_ID_SET = new Set<string>(Object.keys(SUBJECTIVE_SECTION_LABELS));

function isKnownStaticSectionId(id: string): id is SubjectiveSectionId {
  return STATIC_SECTION_ID_SET.has(id);
}

function isKnownSubjectiveSectionId(id: string): id is SubjectiveSectionId {
  return isKnownStaticSectionId(id) || isCustomBlockSectionId(id);
}

function toMountableSet(mountableIds: readonly SubjectiveSectionId[]): ReadonlySet<SubjectiveSectionId> {
  return new Set(mountableIds);
}

function toHiddenSet(hiddenIds: readonly string[]): ReadonlySet<string> {
  return new Set(hiddenIds);
}

export interface DefaultSubjectiveLayout {
  defaultHidden: SubjectiveSectionId[];
}

/** Factory default: complaints, background, allergies, notes on; history hidden. */
export function resolveDefaultSubjectiveLayout(): DefaultSubjectiveLayout {
  const defaultHidden = (Object.keys(SUBJECTIVE_SECTION_LABELS) as StaticSubjectiveSectionId[]).filter(
    (id) => id !== "custom_subsections" && !CORE_VISIBLE_SET.has(id),
  );
  return { defaultHidden };
}

/**
 * Layer the doctor override over the factory default. Stored set wins wholesale
 * when present; otherwise the lean default applies (vitals / V3-D3 analogue).
 */
export function resolveEffectiveSubjectiveHidden({
  storedHidden,
}: {
  storedHidden: readonly string[];
}): { hidden: SubjectiveSectionId[] } {
  const seed = resolveDefaultSubjectiveLayout();
  const source = storedHidden.length > 0 ? storedHidden : seed.defaultHidden;
  const seen = new Set<SubjectiveSectionId>();
  const hidden: SubjectiveSectionId[] = [];

  for (const id of source) {
    if (!isKnownSubjectiveSectionId(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    hidden.push(id);
  }

  return { hidden };
}

/**
 * Resolve the visible render plan by filtering mountable hidden ids out of
 * `order` (subj-33 / P10-D2, P10-D7; subj-37 — custom blocks included).
 *
 * - Removes an id only when it is **both** in `hiddenIds` **and** mountable.
 * - Ids not currently mountable pass through `order` untouched even if hidden
 *   (mode-aware filtering — hiding `allergies` in linked mode does not affect
 *   fallback mode where it is absent from the render plan anyway).
 */
export function resolveVisibleSections(
  order: readonly SubjectiveSectionId[],
  hiddenIds: readonly string[],
  mountableIds: readonly SubjectiveSectionId[],
): SubjectiveSectionId[] {
  const hidden = toHiddenSet(hiddenIds);
  const mountable = toMountableSet(mountableIds);

  return order.filter((id) => {
    if (!hidden.has(id)) return true;
    if (!mountable.has(id)) return true;
    return false;
  });
}

/**
 * Whether a section should show as hidden in the section-manager menu
 * (subj-34 / subj-37). Non-mountable ids are never reported hidden.
 */
export function isSectionHidden(
  id: SubjectiveSectionId,
  hiddenIds: readonly string[],
  mountableIds: readonly SubjectiveSectionId[],
): boolean {
  if (!toMountableSet(mountableIds).has(id)) return false;
  return toHiddenSet(hiddenIds).has(id);
}

/**
 * Compute the minimal hidden set to persist (subj-33 / P10-D2; subj-37).
 *
 * **Cross-mode retention (2.1.1):** retains hidden ids even when they
 * are not currently mountable — the doctor's hide intent survives chart-mode
 * switches. Drops ids unknown to the subjective-section registry (static or
 * custom_block); dedupes while preserving first-occurrence order.
 *
 * `mountableIds` is accepted for API symmetry with the resolver (subj-34
 * passes the live mountable set) but is **not** used to strip non-mountable
 * ids from the payload.
 */
export function hiddenOverridesToPersist(
  hiddenIds: readonly string[],
  _mountableIds: readonly SubjectiveSectionId[],
): SubjectiveSectionHiddenSet {
  const seen = new Set<SubjectiveSectionId>();
  const result: SubjectiveSectionHiddenSet = [];

  for (const id of hiddenIds) {
    if (typeof id !== "string") continue;
    if (!isKnownSubjectiveSectionId(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }

  return result;
}

/** Stable JSON key for debounce guards (sorted ids). */
export function serializeHiddenIds(ids: readonly string[]): string {
  return JSON.stringify([...ids].sort());
}

/** Load the doctor's stored hidden section set (empty = factory lean default). */
export async function fetchSubjectiveSectionHidden(
  token: string,
): Promise<SubjectiveSectionHiddenSet> {
  const { getDoctorSettings } = await import("@/lib/api");
  const res = await getDoctorSettings(token);
  return res.data.settings.subjective_section_hidden ?? [];
}

/** Persist the doctor's hidden section set (subj-32 transport; subj-34 wires UI). */
export async function saveSubjectiveSectionHidden(
  token: string,
  ids: SubjectiveSectionHiddenSet,
): Promise<SubjectiveSectionHiddenSet> {
  const { patchDoctorSettings } = await import("@/lib/api");
  const res = await patchDoctorSettings(token, { subjective_section_hidden: ids });
  return res.data.settings.subjective_section_hidden ?? [];
}
