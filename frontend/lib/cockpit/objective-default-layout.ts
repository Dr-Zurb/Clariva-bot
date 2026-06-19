/**
 * obj-14 (OBJ-D6) — modality- + specialty-aware **default** objective layout.
 *
 * A pure, deterministic resolver (no I/O, no `Date.now`) in the spirit of
 * `vitals-derive.ts`: consult modality + doctor specialty in → default section
 * order / hidden set out. It computes the DEFAULT only:
 *   - an explicit doctor override (stored order/hidden from obj-11/12) ALWAYS
 *     wins and is never written back (P3-D5);
 *   - the seed never reaches `buildRxPayload` — it is view-only (P3-D3);
 *   - unknown modality/specialty falls back to the obj-09 registry default and
 *     NEVER hides everything (the tab is never blank).
 *
 * Granularity note: the objective registry is coarse (`vitals`, `exam`,
 * `test_results`, legacy blocks). The §E2 specialty packs are mostly about
 * *systems within the exam card* and *custom blocks* (P/V, MSE), neither of
 * which is a top-level section — so specialty emphasis here only reorders the
 * visible sections. Richer system/template emphasis is P4/P5.
 */
import type { ConsultationModality } from "@/types/appointment";
import {
  DEFAULT_OBJECTIVE_SECTION_ORDER,
  isStaticObjectiveSectionId,
  type ObjectiveSectionId,
  type StaticObjectiveSectionId,
} from "@/lib/cockpit/objective-section-order";

export type ConsultModality = ConsultationModality; // "text" | "voice" | "video" | "in_clinic"

/** Coarse specialty buckets for §E2 section-level emphasis. */
export type SpecialtyEmphasis =
  | "gp"
  | "cardiology"
  | "pulmonology"
  | "gynaecology"
  | "obstetrics"
  | "paediatrics"
  | "orthopaedics"
  | "dermatology"
  | "ent"
  | "ophthalmology"
  | "psychiatry"
  | "neurology"
  | "unknown";

export interface DefaultLayout {
  /** Default render order over the static registry (custom blocks layer in later). */
  defaultOrder: StaticObjectiveSectionId[];
  /** Default hidden set (delta — absent ⇒ visible). Never includes `vitals`. */
  defaultHidden: StaticObjectiveSectionId[];
}

/** obj-09 canonical default (the never-blank fallback). */
function registryDefaultLayout(): DefaultLayout {
  return { defaultOrder: [...DEFAULT_OBJECTIVE_SECTION_ORDER], defaultHidden: [] };
}

/**
 * Normalise a free-text specialty label (medical-specialties.ts, ~150 values)
 * into a coarse emphasis bucket. Order of checks matters (more specific first).
 */
export function normalizeSpecialty(specialty: string | null | undefined): SpecialtyEmphasis {
  const s = (specialty ?? "").trim().toLowerCase();
  if (!s) return "unknown";
  if (/cardio/.test(s)) return "cardiology";
  if (/pulmon|respirat|tuberculosis/.test(s)) return "pulmonology";
  if (/obstet|maternal-fetal|neonat/.test(s)) return "obstetrics";
  if (/gyn(a|ae|e)?ec|gynae/.test(s)) return "gynaecology";
  if (/paediatr|pediatr/.test(s)) return "paediatrics";
  if (/orthop|musculoskel/.test(s)) return "orthopaedics";
  if (/derm/.test(s)) return "dermatology";
  if (/otolaryng|\bent\b/.test(s)) return "ent";
  if (/ophthal/.test(s)) return "ophthalmology";
  if (/psych/.test(s)) return "psychiatry";
  if (/neuro/.test(s)) return "neurology";
  if (/general (physician|practice|medicine)|family medicine|internal medicine/.test(s)) {
    return "gp";
  }
  return "unknown";
}

/**
 * Modality → section default (§G). All maps keep `vitals` and never hide
 * everything.
 *   - in_clinic → full exam (registry default).
 *   - video → structured exam (observed) + home vitals; de-emphasise legacy
 *     free-text blocks (hidden).
 *   - voice / text (async) → patient-reported vitals + uploaded reports only;
 *     structured + legacy exam hidden, `test_results` leads.
 */
function resolveModalityLayout(modality: ConsultModality | null | undefined): DefaultLayout {
  switch (modality) {
    case "in_clinic":
      return { defaultOrder: [...DEFAULT_OBJECTIVE_SECTION_ORDER], defaultHidden: [] };
    case "video":
      return {
        defaultOrder: [...DEFAULT_OBJECTIVE_SECTION_ORDER],
        defaultHidden: ["legacy_exam", "legacy_vitals"],
      };
    case "voice":
    case "text":
      return {
        defaultOrder: ["test_results", "vitals", "exam", "legacy_exam", "legacy_vitals"],
        defaultHidden: ["exam", "legacy_exam", "legacy_vitals"],
      };
    default:
      // Unknown / absent modality → registry default (never blank).
      return registryDefaultLayout();
  }
}

/** Front-of-order priority sections per specialty (§E2), section-level only. */
const SPECIALTY_PRIORITY: Record<SpecialtyEmphasis, StaticObjectiveSectionId[]> = {
  cardiology: ["vitals", "exam"],
  pulmonology: ["vitals", "exam"],
  paediatrics: ["vitals", "exam"],
  dermatology: ["exam"],
  psychiatry: ["exam"],
  neurology: ["exam"],
  orthopaedics: ["exam"],
  gynaecology: ["exam"],
  obstetrics: ["vitals", "exam"],
  ent: ["exam"],
  ophthalmology: ["exam"],
  gp: [],
  unknown: [],
};

/**
 * Bring a specialty's priority sections to the front of the order (stable for
 * the rest). Never hides or unhides — that stays a modality + doctor concern.
 */
function applySpecialtyEmphasis(layout: DefaultLayout, specialty: SpecialtyEmphasis): DefaultLayout {
  const priority = SPECIALTY_PRIORITY[specialty];
  if (priority.length === 0) return layout;

  const present = priority.filter((id) => layout.defaultOrder.includes(id));
  if (present.length === 0) return layout;

  const front = present;
  const rest = layout.defaultOrder.filter((id) => !front.includes(id));
  return { defaultOrder: [...front, ...rest], defaultHidden: layout.defaultHidden };
}

export interface ResolveDefaultLayoutArgs {
  modality?: ConsultModality | null;
  /** Free-text specialty label (normalised internally) or a pre-bucketed value. */
  specialty?: string | SpecialtyEmphasis | null;
}

/**
 * The OBJ-D6 seed: modality default with specialty emphasis layered on. Pure +
 * deterministic; unknown inputs degrade to the registry default.
 */
export function resolveDefaultLayout({
  modality,
  specialty,
}: ResolveDefaultLayoutArgs): DefaultLayout {
  const base = resolveModalityLayout(modality);
  const bucket = normalizeSpecialty(typeof specialty === "string" ? specialty : null);
  // Allow callers to pass a pre-bucketed emphasis directly.
  const emphasis: SpecialtyEmphasis =
    specialty && isSpecialtyEmphasis(specialty) ? specialty : bucket;
  return applySpecialtyEmphasis(base, emphasis);
}

function isSpecialtyEmphasis(value: string): value is SpecialtyEmphasis {
  return value in SPECIALTY_PRIORITY;
}

export interface ResolveEffectiveLayoutArgs {
  seed: DefaultLayout;
  /** Doctor's stored order override (obj-11). Empty ⇒ unset → fall back to the seed. */
  storedOrder: readonly ObjectiveSectionId[];
  /** Doctor's stored hidden set (obj-12). Non-empty ⇒ wins wholesale over the seed. */
  storedHidden: readonly ObjectiveSectionId[];
}

export interface EffectiveLayout {
  /**
   * Base order to feed `resolveInitialSectionOrder` — the doctor override when
   * present, otherwise the seed default (P3-D5: override wins wholesale,
   * untouched practices follow the seed).
   */
  baseOrder: ObjectiveSectionId[];
  /**
   * Hidden set to feed obj-12's `resolveVisibleSections`. Mirrors `baseOrder`:
   * the doctor's stored set wins WHOLESALE when present, otherwise the seed
   * default applies. Wholesale (not union) so a doctor who has configured
   * visibility can still SHOW a section the seed would hide — there is no
   * "explicitly shown" delta to express otherwise (P10-D4 tri-state is a
   * follow-up). Never persisted (P3-D5); never reaches output (P3-D3).
   */
  hidden: ObjectiveSectionId[];
}

/** Layer the doctor override over the seed over the registry default. */
export function resolveEffectiveLayout({
  seed,
  storedOrder,
  storedHidden,
}: ResolveEffectiveLayoutArgs): EffectiveLayout {
  const baseOrder: ObjectiveSectionId[] =
    storedOrder.length > 0 ? [...storedOrder] : [...seed.defaultOrder];

  // Override wins wholesale; otherwise the seed is the default. Custom blocks are
  // removed by deletion, never hidden (P10-D4), so they are filtered out.
  const source = storedHidden.length > 0 ? storedHidden : seed.defaultHidden;
  const seen = new Set<ObjectiveSectionId>();
  const hidden: ObjectiveSectionId[] = [];
  for (const id of source) {
    if (!isStaticObjectiveSectionId(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    hidden.push(id);
  }

  return { baseOrder, hidden };
}
