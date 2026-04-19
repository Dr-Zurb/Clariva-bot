/**
 * SFU-06 + SFU-12: Draft state ↔ ServiceCatalogV1 for Practice Setup editor.
 */

import type {
  FollowUpPolicyV1,
  ScopeMode,
  ServiceCatalogV1,
  ServiceOfferingV1,
} from "@/lib/service-catalog-schema";
import {
  CATALOG_CATCH_ALL_LABEL_DEFAULT,
  CATALOG_CATCH_ALL_SERVICE_KEY,
  MATCHER_HINT_EXAMPLE_MAX_CHARS,
  MATCHER_HINT_EXAMPLES_MAX_COUNT,
  SERVICE_CATALOG_VERSION,
  resolveServiceScopeMode,
} from "@/lib/service-catalog-schema";

export type DiscountTypeOption = FollowUpPolicyV1["discount_type"];

/**
 * Plan 02 / Task 06: client-only badge attached to a draft when its fields were
 * populated by `POST /api/v1/catalog/ai-suggest`. The UI renders an "AI suggestion"
 * pill, optional warning callouts (e.g. price clamped), and an "Accept all" /
 * "Discard suggestion" pair. This field is intentionally NOT serialized into the
 * `ServiceOfferingV1` payload (`draftsToCatalogOrNull` ignores it) and is stripped
 * by `offeringToDraft` whenever a fresh server payload is loaded.
 */
export interface AiSuggestionDraftMeta {
  /** Which trigger produced this suggestion. */
  source: "single_card" | "starter" | "review_apply";
  /** ISO timestamp when the suggestion was applied to the draft. */
  appliedAt: string;
  /** Per-field flag so the UI can highlight only what the AI changed. */
  fieldsTouched: {
    description?: boolean;
    scopeMode?: boolean;
    /** Routing v2 (Task 06): primary phrase list. */
    matcherExamples?: boolean;
    /** Legacy — remains tracked while un-migrated rows exist. */
    matcherKeywords?: boolean;
    matcherIncludeWhen?: boolean;
    matcherExcludeWhen?: boolean;
    modalities?: boolean;
  };
  /** Warnings returned by the backend (price clamped, modality disabled, …). PHI-free. */
  warnings: ReadonlyArray<{
    kind: string;
    message: string;
  }>;
}

/** Per-modality follow-up policy (max, window, and discount). */
export interface ModalityFollowUpDiscountDraft {
  followUpDiscountEnabled: boolean;
  max_followups: string;
  eligibility_window_days: string;
  discount_type: DiscountTypeOption;
  discount_value: string;
}

export interface ServiceOfferingDraft {
  /** Stable React key */
  id: string;
  /** SFU-11: persisted UUID; never change when label edits */
  service_id: string;
  label: string;
  /** Internal slug for API payload (server may preserve per service_id) */
  service_key: string;
  description: string;
  /**
   * Routing v2 (Task 06): primary patient-style phrase list shown in the editor
   * as the **Example phrases** input. Mirrors backend `matcher_hints.examples[]`.
   * On save, when this list is non-empty {@link draftsToCatalogOrNull} writes
   * only `examples` + `exclude_when` and intentionally drops legacy
   * `keywords` / `include_when` so the resolver has a single source of truth.
   */
  matcherExamples: string[];
  /** @deprecated Routing v2 (Task 06) — retained for legacy load + transition save only. */
  matcherKeywords: string;
  /** @deprecated Routing v2 (Task 06) — retained for legacy load + transition save only. */
  matcherIncludeWhen: string;
  /** When to choose a different service or catch-all. */
  matcherExcludeWhen: string;
  /**
   * SFU-18: `strict` (default for new services) only routes listed conditions;
   * `flexible` allows broader category matching. Catch-all is forced to `flexible`
   * on save. Legacy offerings load as `flexible` to preserve pre-SFU-18 behavior.
   */
  scopeMode: ScopeMode;
  textEnabled: boolean;
  voiceEnabled: boolean;
  videoEnabled: boolean;
  /** Main currency units as string (e.g. "500" = ₹500); empty if invalid while typing */
  textPriceMain: string;
  voicePriceMain: string;
  videoPriceMain: string;
  textFollowUp: ModalityFollowUpDiscountDraft;
  voiceFollowUp: ModalityFollowUpDiscountDraft;
  videoFollowUp: ModalityFollowUpDiscountDraft;
  /**
   * Plan 02 / Task 06: present only on cards that were just populated by the AI
   * auto-fill endpoint. Always `undefined` after a save round-trip — the field is
   * stripped on load by {@link offeringToDraft} and never serialized by
   * {@link draftsToCatalogOrNull}.
   */
  aiSuggestionMeta?: AiSuggestionDraftMeta;
}

export interface FollowUpFormDraft {
  enabled: boolean;
  max_followups: string;
  eligibility_window_days: string;
  discount_type: DiscountTypeOption;
  discount_value: string;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `svc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Slug label → backend service_key pattern. */
export function slugifyLabelToServiceKey(label: string): string {
  let s = label
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");
  if (!s) return "service";
  if (!/^[a-z0-9]/.test(s)) {
    s = `s_${s}`;
  }
  if (s.length > 64) s = s.slice(0, 64);
  return s;
}

/**
 * Routing v2 (Task 06) — normalize incoming `matcher_hints.examples` for the
 * draft. Trims, drops empties, dedupes case-insensitively (preserves first
 * occurrence's casing), and clamps length / count to schema limits so the
 * editor never holds a list that would fail `safeParseServiceCatalogV1`.
 *
 * Mirrors `backend/src/utils/matcher-routing-resolve.ts#normalizeMatcherExamplePhrases`.
 */
export function normalizeMatcherExamplesDraft(input: ReadonlyArray<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const clamped =
      trimmed.length > MATCHER_HINT_EXAMPLE_MAX_CHARS
        ? trimmed.slice(0, MATCHER_HINT_EXAMPLE_MAX_CHARS)
        : trimmed;
    const key = clamped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clamped);
    if (out.length >= MATCHER_HINT_EXAMPLES_MAX_COUNT) break;
  }
  return out;
}

/** Parse the editor's newline-separated textarea contents into the draft array shape. */
export function exampleTextToList(text: string): string[] {
  return normalizeMatcherExamplesDraft(text.split(/\r?\n/));
}

/** Render a draft `matcherExamples` array back into the editor textarea. */
export function exampleListToText(list: ReadonlyArray<string>): string {
  return list.join("\n");
}

/**
 * Routing v2 (Task 07) — one-tap migration from legacy `matcherKeywords` /
 * `matcherIncludeWhen` to a normalized `matcherExamples` list.
 *
 * Splitting rules:
 *  - `matcherKeywords` is treated as a delimited list (commas, semicolons, or
 *    newlines) — already the doctor's mental model from the pre-v2 UI label
 *    "Keywords / synonyms".
 *  - `matcherIncludeWhen` is treated as one phrase per non-empty line. Long
 *    sentences are clamped to {@link MATCHER_HINT_EXAMPLE_MAX_CHARS} by the
 *    normalizer; the doctor can edit / drop them via the chip × afterward.
 *
 * Both legacy fields are zeroed in the returned draft so the next save
 * persists the v2 shape only (matches `draftsToCatalogOrNull`'s precedence
 * rule: any non-empty `examples` drops legacy `keywords` / `include_when`).
 *
 * Pure: caller swaps the returned draft into state. Doctor must still hit
 * Save on the catalog page for the change to round-trip to the server.
 */
export function convertLegacyHintsToExamples(
  draft: ServiceOfferingDraft
): ServiceOfferingDraft {
  const seeds: string[] = [];
  if (draft.matcherKeywords.trim()) {
    seeds.push(...draft.matcherKeywords.split(/[\n,;]+/));
  }
  if (draft.matcherIncludeWhen.trim()) {
    seeds.push(...draft.matcherIncludeWhen.split(/\r?\n/));
  }
  // Merge with any existing examples so the conversion is additive (preserves
  // first-seen order; the normalizer dedupes case-insensitively).
  const merged = [...draft.matcherExamples, ...seeds];
  return {
    ...draft,
    matcherExamples: normalizeMatcherExamplesDraft(merged),
    matcherKeywords: "",
    matcherIncludeWhen: "",
  };
}

function defaultModalityFollowUpDiscount(): ModalityFollowUpDiscountDraft {
  return {
    followUpDiscountEnabled: false,
    max_followups: "3",
    eligibility_window_days: "90",
    discount_type: "percent",
    discount_value: "30",
  };
}

export function emptyServiceDraft(): ServiceOfferingDraft {
  const sid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : newId();
  return {
    id: newId(),
    service_id: sid,
    label: "",
    service_key: "",
    description: "",
    matcherExamples: [],
    matcherKeywords: "",
    matcherIncludeWhen: "",
    matcherExcludeWhen: "",
    /** SFU-18: new services default to strict so the assistant only routes listed conditions. */
    scopeMode: "strict",
    textEnabled: false,
    voiceEnabled: false,
    videoEnabled: true,
    textPriceMain: "",
    voicePriceMain: "",
    videoPriceMain: "",
    textFollowUp: defaultModalityFollowUpDiscount(),
    voiceFollowUp: defaultModalityFollowUpDiscount(),
    videoFollowUp: defaultModalityFollowUpDiscount(),
  };
}

/** Default description for the Other / not listed row (doctor-facing; editable in the form). */
export const CATALOG_CATCH_ALL_DESCRIPTION_DEFAULT =
  "For patient concerns that do not fit one of your named services above. Set the teleconsult prices patients should see for those visits. This is not for emergencies — send urgent, life-threatening problems to emergency care.";

/** Detect old template text so we can swap in {@link CATALOG_CATCH_ALL_DESCRIPTION_DEFAULT} on load. */
function shouldMigrateLegacyOtherDescription(desc: string): boolean {
  const t = desc.trim();
  if (!t.startsWith("Fallback when a patient")) return false;
  return t.includes("AI routing") || t.includes("does not fit a named service");
}

/** ARM-01: mandatory catch-all row — fixed internal key `other`, default label (editable). */
export function catchAllServiceDraft(): ServiceOfferingDraft {
  const base = emptyServiceDraft();
  return {
    ...base,
    id: newId(),
    label: CATALOG_CATCH_ALL_LABEL_DEFAULT,
    service_key: CATALOG_CATCH_ALL_SERVICE_KEY,
    description: CATALOG_CATCH_ALL_DESCRIPTION_DEFAULT,
    /** SFU-18: catch-all is always flexible — it must be able to absorb anything. */
    scopeMode: "flexible",
    textEnabled: false,
    voiceEnabled: false,
    videoEnabled: true,
    textPriceMain: "",
    voicePriceMain: "",
    videoPriceMain: "0",
  };
}

export function catalogMissingCatchAllOffering(services: ServiceOfferingDraft[]): boolean {
  return !services.some(
    (d) => d.service_key.trim().toLowerCase() === CATALOG_CATCH_ALL_SERVICE_KEY
  );
}

export function defaultFollowUpDraft(): FollowUpFormDraft {
  return {
    enabled: false,
    max_followups: "3",
    eligibility_window_days: "90",
    discount_type: "percent",
    discount_value: "30",
  };
}

function modalityFollowUpDraftFromPolicy(
  p: FollowUpPolicyV1 | null | undefined,
  root: FollowUpPolicyV1 | null | undefined
): ModalityFollowUpDiscountDraft {
  const effective = p ?? root;
  if (!effective?.enabled) {
    return defaultModalityFollowUpDiscount();
  }
  const dv = effective.discount_value;
  const valueStr =
    dv === undefined || dv === null
      ? ""
      : effective.discount_type === "percent"
        ? String(dv)
        : String(dv / 100);
  return {
    followUpDiscountEnabled: true,
    max_followups: String(effective.max_followups),
    eligibility_window_days: String(effective.eligibility_window_days),
    discount_type: effective.discount_type,
    discount_value: valueStr,
  };
}

export function offeringToDraft(o: ServiceOfferingV1): ServiceOfferingDraft {
  const text = o.modalities.text;
  const voice = o.modalities.voice;
  const video = o.modalities.video;
  const sid =
    o.service_id ??
    (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : newId());
  const rootFu = o.followup_policy?.enabled ? o.followup_policy : undefined;

  let description = o.description?.trim() ?? "";
  if (
    o.service_key.trim().toLowerCase() === CATALOG_CATCH_ALL_SERVICE_KEY &&
    shouldMigrateLegacyOtherDescription(description)
  ) {
    description = CATALOG_CATCH_ALL_DESCRIPTION_DEFAULT;
  }

  /**
   * SFU-18: catch-all is forced to `flexible` regardless of stored value. For every
   * other offering, honor the saved `scope_mode` when present. Legacy offerings
   * with `scope_mode: undefined` load as `flexible` so pre-SFU-18 catalogs keep
   * their broader matching behavior until the doctor explicitly tightens a row.
   */
  const isCatchAll = o.service_key.trim().toLowerCase() === CATALOG_CATCH_ALL_SERVICE_KEY;
  const scopeMode: ScopeMode = isCatchAll ? "flexible" : resolveServiceScopeMode(o.scope_mode);

  return {
    id: newId(),
    service_id: sid,
    label: o.label,
    service_key: o.service_key,
    description,
    matcherExamples: normalizeMatcherExamplesDraft(o.matcher_hints?.examples ?? []),
    matcherKeywords: o.matcher_hints?.keywords?.trim() ?? "",
    matcherIncludeWhen: o.matcher_hints?.include_when?.trim() ?? "",
    matcherExcludeWhen: o.matcher_hints?.exclude_when?.trim() ?? "",
    scopeMode,
    textEnabled: !!text?.enabled,
    voiceEnabled: !!voice?.enabled,
    videoEnabled: !!video?.enabled,
    textPriceMain: text?.enabled ? minorToMain(text.price_minor) : "",
    voicePriceMain: voice?.enabled ? minorToMain(voice.price_minor) : "",
    videoPriceMain: video?.enabled ? minorToMain(video.price_minor) : "",
    textFollowUp: modalityFollowUpDraftFromPolicy(
      text?.followup_policy,
      text?.enabled ? rootFu : undefined
    ),
    voiceFollowUp: modalityFollowUpDraftFromPolicy(
      voice?.followup_policy,
      voice?.enabled ? rootFu : undefined
    ),
    videoFollowUp: modalityFollowUpDraftFromPolicy(
      video?.followup_policy,
      video?.enabled ? rootFu : undefined
    ),
  };
}

/** Catch-all row last; relative order preserved within named vs catch-all groups. */
export function normalizeDraftOrder(services: ServiceOfferingDraft[]): ServiceOfferingDraft[] {
  const key = CATALOG_CATCH_ALL_SERVICE_KEY.toLowerCase();
  const named = services.filter((s) => s.service_key.trim().toLowerCase() !== key);
  const tail = services.filter((s) => s.service_key.trim().toLowerCase() === key);
  return [...named, ...tail];
}

/**
 * Drag-reorder among named rows only; Other / not listed stays last.
 * @param targetId named row id to insert before, or null to append as last named (before Other).
 */
export function reorderNamedServiceRelative(
  services: ServiceOfferingDraft[],
  draggedId: string,
  targetId: string | null
): ServiceOfferingDraft[] {
  if (targetId !== null && draggedId === targetId) {
    return services;
  }
  const key = CATALOG_CATCH_ALL_SERVICE_KEY.toLowerCase();
  const others = services.filter((s) => s.service_key.trim().toLowerCase() === key);
  const named = services.filter((s) => s.service_key.trim().toLowerCase() !== key);
  const fromIdx = named.findIndex((s) => s.id === draggedId);
  if (fromIdx < 0) return services;
  const [item] = named.splice(fromIdx, 1);
  if (targetId === null) {
    named.push(item);
    return [...named, ...others];
  }
  const toIdx = named.findIndex((s) => s.id === targetId);
  if (toIdx < 0) {
    named.push(item);
  } else {
    named.splice(toIdx, 0, item);
  }
  return [...named, ...others];
}

export function catalogToServiceDrafts(catalog: ServiceCatalogV1 | null): ServiceOfferingDraft[] {
  if (!catalog) return [];
  return normalizeDraftOrder(catalog.services.map(offeringToDraft));
}

/**
 * Null when save would succeed; otherwise a short message for Save gating + UX copy.
 * Empty list → message (cannot persist structured catalog).
 */
export function draftsSaveBlockingReason(services: ServiceOfferingDraft[]): string | null {
  if (services.length === 0) {
    return 'Add at least one service row to save, or use "Clear structured catalog" for legacy-only pricing.';
  }
  try {
    draftsToCatalogOrNull(services);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Fix validation errors before saving.";
  }
}

/** @deprecated SFU-12 — use per-service drafts only; kept for transitional imports */
export function catalogToFollowUpDraft(_catalog: ServiceCatalogV1 | null): FollowUpFormDraft {
  return defaultFollowUpDraft();
}

function mainToMinor(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function minorToMain(minor: number): string {
  return (minor / 100).toString();
}

function buildFollowUpPolicy(form: FollowUpFormDraft): FollowUpPolicyV1 | null {
  if (!form.enabled) return null;

  const maxFollow = parseInt(form.max_followups, 10);
  const windowDays = parseInt(form.eligibility_window_days, 10);
  if (Number.isNaN(maxFollow) || maxFollow < 0 || maxFollow > 100) {
    throw new Error("Max follow-up visits must be 0–100");
  }
  if (Number.isNaN(windowDays) || windowDays < 1 || windowDays > 3650) {
    throw new Error("Eligibility window must be 1–3650 days");
  }

  const dt = form.discount_type;
  let discount_value: number | undefined;

  if (dt === "percent") {
    const v = parseFloat(form.discount_value);
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      throw new Error("Percent discount must be between 0 and 100");
    }
    discount_value = v;
  } else if (dt === "flat_off" || dt === "fixed_price") {
    const main = parseFloat(form.discount_value);
    if (!Number.isFinite(main) || main < 0) {
      throw new Error("Discount amount must be a non-negative number");
    }
    discount_value = Math.round(main * 100);
  } else {
    discount_value = 0;
  }

  return {
    enabled: true,
    max_followups: maxFollow,
    eligibility_window_days: windowDays,
    discount_type: dt,
    ...(discount_value !== undefined ? { discount_value } : {}),
  };
}

function buildModalityFollowUpPolicy(disc: ModalityFollowUpDiscountDraft): FollowUpPolicyV1 | null {
  if (!disc.followUpDiscountEnabled) return null;
  return buildFollowUpPolicy({
    enabled: true,
    max_followups: disc.max_followups,
    eligibility_window_days: disc.eligibility_window_days,
    discount_type: disc.discount_type,
    discount_value: disc.discount_value,
  });
}

function buildModalities(d: ServiceOfferingDraft): ServiceOfferingV1["modalities"] {
  const modalities: ServiceOfferingV1["modalities"] = {};
  if (d.textEnabled) {
    const m = mainToMinor(d.textPriceMain);
    if (m === null) throw new Error("Text price required");
    const fp = buildModalityFollowUpPolicy(d.textFollowUp);
    modalities.text = {
      enabled: true,
      price_minor: m,
      ...(fp ? { followup_policy: fp } : { followup_policy: null }),
    };
  }
  if (d.voiceEnabled) {
    const m = mainToMinor(d.voicePriceMain);
    if (m === null) throw new Error("Voice price required");
    const fp = buildModalityFollowUpPolicy(d.voiceFollowUp);
    modalities.voice = {
      enabled: true,
      price_minor: m,
      ...(fp ? { followup_policy: fp } : { followup_policy: null }),
    };
  }
  if (d.videoEnabled) {
    const m = mainToMinor(d.videoPriceMain);
    if (m === null) throw new Error("Video price required");
    const fp = buildModalityFollowUpPolicy(d.videoFollowUp);
    modalities.video = {
      enabled: true,
      price_minor: m,
      ...(fp ? { followup_policy: fp } : { followup_policy: null }),
    };
  }
  return modalities;
}

/** Build API payload from drafts. Returns null if user cleared all services (legacy-only). */
export function draftsToCatalogOrNull(services: ServiceOfferingDraft[]): ServiceCatalogV1 | null {
  if (services.length === 0) {
    return null;
  }

  const offerings: ServiceOfferingV1[] = services.map((d) => {
    if (!d.label.trim()) throw new Error("Each service needs a label");
    if (!d.service_id.trim()) throw new Error("Each service needs a stable id");

    const validateFu = (disc: ModalityFollowUpDiscountDraft) => {
      if (!disc.followUpDiscountEnabled) return;
      const mf = parseInt(disc.max_followups, 10);
      const wd = parseInt(disc.eligibility_window_days, 10);
      if (Number.isNaN(mf) || mf < 0 || mf > 100) {
        throw new Error("Max follow-up visits must be 0–100");
      }
      if (Number.isNaN(wd) || wd < 1 || wd > 3650) {
        throw new Error("Eligibility window must be 1–3650 days");
      }
    };
    if (d.textEnabled) validateFu(d.textFollowUp);
    if (d.voiceEnabled) validateFu(d.voiceFollowUp);
    if (d.videoEnabled) validateFu(d.videoFollowUp);

    try {
      const modalities = buildModalities(d);
      const key = d.service_key.trim().toLowerCase() || slugifyLabelToServiceKey(d.label);
      /**
       * SFU-18: always persist `scope_mode` on save so legacy rows (which loaded as
       * `flexible` from `undefined`) now materialize the field explicitly. Catch-all
       * is forced to `flexible` here to match {@link catchAllServiceDraft} — never
       * trust the draft value for the catch-all row.
       */
      const scopeMode: ScopeMode = key === CATALOG_CATCH_ALL_SERVICE_KEY
        ? "flexible"
        : resolveServiceScopeMode(d.scopeMode);
      const base: ServiceOfferingV1 = {
        service_id: d.service_id.trim(),
        service_key: key,
        label: d.label.trim(),
        modalities,
        followup_policy: null,
        scope_mode: scopeMode,
      };
      const desc = d.description.trim();
      if (desc) {
        base.description = desc;
      }
      /**
       * Routing v2 (Task 06) — single-source-of-truth save:
       * - When the doctor has at least one **example phrase**, persist only
       *   `examples` + `exclude_when`. The legacy `keywords` / `include_when`
       *   draft fields are intentionally NOT written: the resolver
       *   (`backend/src/utils/matcher-routing-resolve.ts`) already prefers
       *   `examples` when present, so emitting both would be a silent
       *   dual-write and re-introduce the keywords/include_when overlap this
       *   plan exists to remove.
       * - When `matcherExamples` is empty (un-migrated row), preserve the
       *   pre-v2 behavior so legacy catalogs round-trip byte-for-byte until the
       *   doctor edits them.
       */
      const examples = normalizeMatcherExamplesDraft(d.matcherExamples);
      const me = d.matcherExcludeWhen.trim();
      if (examples.length > 0) {
        base.matcher_hints = {
          examples,
          ...(me ? { exclude_when: me } : {}),
        };
      } else {
        const mk = d.matcherKeywords.trim();
        const mi = d.matcherIncludeWhen.trim();
        if (mk || mi || me) {
          base.matcher_hints = {
            ...(mk ? { keywords: mk } : {}),
            ...(mi ? { include_when: mi } : {}),
            ...(me ? { exclude_when: me } : {}),
          };
        }
      }
      return base;
    } catch (e) {
      throw e;
    }
  });

  const hasCatchAll = offerings.some(
    (o) => o.service_key.trim().toLowerCase() === CATALOG_CATCH_ALL_SERVICE_KEY
  );
  if (!hasCatchAll) {
    throw new Error(
      `Your catalog must include the “${CATALOG_CATCH_ALL_LABEL_DEFAULT}” row before saving. Add it back (for example with Add service on an empty catalog), then try again.`
    );
  }

  return {
    version: SERVICE_CATALOG_VERSION,
    services: offerings,
  };
}

// ============================================================================
// Plan 02 / Task 06 — AI auto-fill helpers
// ============================================================================

/** Subset of {@link ServiceOfferingV1} the AI suggest endpoint sends back. */
export interface AiSuggestedCardV1 {
  service_id?: string;
  service_key: string;
  label: string;
  description?: string;
  scope_mode?: ScopeMode;
  matcher_hints?: {
    /** Routing v2 (Task 06): primary phrase list. */
    examples?: string[];
    keywords?: string;
    include_when?: string;
    exclude_when?: string;
  };
  modalities: ServiceOfferingV1["modalities"];
}

/**
 * Convert a server-returned AI card into a fresh draft. Used by the "Generate a
 * starter catalog" flow where every card is brand new (no doctor edits to
 * preserve). Returns a draft with `aiSuggestionMeta.source = 'starter'`.
 */
export function aiSuggestedCardToDraft(
  card: AiSuggestedCardV1,
  warnings: AiSuggestionDraftMeta["warnings"] = []
): ServiceOfferingDraft {
  const seed = emptyServiceDraft();
  const isCatchAll = card.service_key.trim().toLowerCase() === CATALOG_CATCH_ALL_SERVICE_KEY;
  const text = card.modalities.text;
  const voice = card.modalities.voice;
  const video = card.modalities.video;
  /**
   * Routing v2 (Task 06): when the AI emits both `examples` and legacy fields
   * we prefer `examples` (matches the resolver's precedence) and stash legacy
   * fields as empty so save-time serialization writes the v2 shape only.
   */
  const aiExamples = normalizeMatcherExamplesDraft(card.matcher_hints?.examples ?? []);
  const aiKeywords = card.matcher_hints?.keywords?.trim() ?? "";
  const aiIncludeWhen = card.matcher_hints?.include_when?.trim() ?? "";
  const preferExamples = aiExamples.length > 0;
  return {
    ...seed,
    service_id: card.service_id?.trim() || seed.service_id,
    label: card.label,
    service_key: card.service_key,
    description: card.description?.trim() ?? "",
    matcherExamples: aiExamples,
    matcherKeywords: preferExamples ? "" : aiKeywords,
    matcherIncludeWhen: preferExamples ? "" : aiIncludeWhen,
    matcherExcludeWhen: card.matcher_hints?.exclude_when?.trim() ?? "",
    scopeMode: isCatchAll ? "flexible" : resolveServiceScopeMode(card.scope_mode),
    textEnabled: !!text?.enabled,
    voiceEnabled: !!voice?.enabled,
    videoEnabled: !!video?.enabled,
    textPriceMain: text?.enabled ? minorToMain(text.price_minor) : "",
    voicePriceMain: voice?.enabled ? minorToMain(voice.price_minor) : "",
    videoPriceMain: video?.enabled ? minorToMain(video.price_minor) : "",
    aiSuggestionMeta: {
      source: "starter",
      appliedAt: new Date().toISOString(),
      fieldsTouched: {
        description: !!card.description?.trim(),
        scopeMode: true,
        matcherExamples: aiExamples.length > 0,
        matcherKeywords: !preferExamples && !!aiKeywords,
        matcherIncludeWhen: !preferExamples && !!aiIncludeWhen,
        matcherExcludeWhen: !!card.matcher_hints?.exclude_when?.trim(),
        modalities: true,
      },
      warnings,
    },
  };
}

/**
 * Merge an AI-suggested card onto an existing draft (single_card flow). Preserves
 * doctor-typed `id`, `service_id`, `service_key`, and `label` so the row stays the
 * same in the editor list — the AI only ever fills the matcher hints, scope_mode,
 * description, and modality price/enable defaults. Always overwrites the whole
 * `aiSuggestionMeta` so re-running the AI gives a fresh meta with current
 * timestamp + warnings.
 */
export function applyAiSuggestionToDraft(
  draft: ServiceOfferingDraft,
  card: AiSuggestedCardV1,
  source: AiSuggestionDraftMeta["source"],
  warnings: AiSuggestionDraftMeta["warnings"] = []
): ServiceOfferingDraft {
  const isCatchAll = draft.service_key.trim().toLowerCase() === CATALOG_CATCH_ALL_SERVICE_KEY;

  const newDescription = card.description?.trim() ?? draft.description;
  /**
   * Routing v2 (Task 06) — the AI may now emit `matcher_hints.examples`. When it
   * does we adopt the v2 list and zero out the legacy text fields so the next
   * save uses the v2 shape only. If the AI emitted legacy fields only (back-compat
   * with un-migrated prompts), fall back to the prior behavior so we don't drop
   * the suggestion on the floor.
   */
  const aiExamples = normalizeMatcherExamplesDraft(card.matcher_hints?.examples ?? []);
  const aiEmittedExamples = aiExamples.length > 0;
  const newExamples = aiEmittedExamples ? aiExamples : draft.matcherExamples;
  const newKeywords = aiEmittedExamples
    ? ""
    : (card.matcher_hints?.keywords?.trim() ?? draft.matcherKeywords);
  const newIncludeWhen = aiEmittedExamples
    ? ""
    : (card.matcher_hints?.include_when?.trim() ?? draft.matcherIncludeWhen);
  const newExcludeWhen = card.matcher_hints?.exclude_when?.trim() ?? draft.matcherExcludeWhen;
  const newScope: ScopeMode = isCatchAll ? "flexible" : resolveServiceScopeMode(card.scope_mode);

  // Modality overlay: trust the AI for enabled flags + prices, but only when it
  // emitted a value. Modalities the AI omitted entirely keep the doctor's prior choice.
  const text = card.modalities.text;
  const voice = card.modalities.voice;
  const video = card.modalities.video;

  const next: ServiceOfferingDraft = {
    ...draft,
    description: newDescription,
    matcherExamples: newExamples,
    matcherKeywords: newKeywords,
    matcherIncludeWhen: newIncludeWhen,
    matcherExcludeWhen: newExcludeWhen,
    scopeMode: newScope,
    textEnabled: text?.enabled ?? draft.textEnabled,
    voiceEnabled: voice?.enabled ?? draft.voiceEnabled,
    videoEnabled: video?.enabled ?? draft.videoEnabled,
    textPriceMain:
      text?.enabled && typeof text.price_minor === "number"
        ? minorToMain(text.price_minor)
        : draft.textPriceMain,
    voicePriceMain:
      voice?.enabled && typeof voice.price_minor === "number"
        ? minorToMain(voice.price_minor)
        : draft.voicePriceMain,
    videoPriceMain:
      video?.enabled && typeof video.price_minor === "number"
        ? minorToMain(video.price_minor)
        : draft.videoPriceMain,
    aiSuggestionMeta: {
      source,
      appliedAt: new Date().toISOString(),
      fieldsTouched: {
        description: newDescription !== draft.description,
        scopeMode: newScope !== draft.scopeMode,
        matcherExamples: aiEmittedExamples,
        matcherKeywords: newKeywords !== draft.matcherKeywords,
        matcherIncludeWhen: newIncludeWhen !== draft.matcherIncludeWhen,
        matcherExcludeWhen: newExcludeWhen !== draft.matcherExcludeWhen,
        modalities: !!(text || voice || video),
      },
      warnings,
    },
  };
  return next;
}

/** Drop the suggestion badge (e.g. user clicked "Discard suggestion" or accepted it). */
export function clearAiSuggestionMeta(draft: ServiceOfferingDraft): ServiceOfferingDraft {
  if (!draft.aiSuggestionMeta) return draft;
  const { aiSuggestionMeta: _omit, ...rest } = draft;
  return { ...rest } as ServiceOfferingDraft;
}
