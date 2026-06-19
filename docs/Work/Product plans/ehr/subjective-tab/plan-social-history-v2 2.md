# Plan — Social / Personal History v2 (structured + clinical indices)

> **Purpose:** Upgrade the Social / Personal History field from a flat single-select chip
> string (v1, ST-D6) into a **structured, schema-driven section** with daily quantities and
> the clinical indices doctors are trained on — **pack-years** (smoking) and **CAGE**
> (alcohol) — while keeping a derived TEXT string for display/PDF/carry-forward.
>
> **Read-order:** [plan-subjective-tab.md](./plan-subjective-tab.md) (ST-D6 v1) →
> **plan-social-history-v2.md (this file)**.
>
> **Created:** 2026-06-07 · **Status:** `Drafted` · **Effort:** ~2–3 dev-days (Phase 1),
> +1–2 days (Phase 2).
>
> **Decisions locked (2026-06-07):**
> - **Storage:** new `prescriptions.social_history_structured` JSONB = source of truth;
>   existing `social_history` TEXT stays as the **derived** display string (mirrors
>   `complaints` → `cc`/`hopi`, ST-D2).
> - **Phasing:** **Phase 1** = data model + Smoking / Smokeless tobacco / Alcohol with
>   **pack-years** + **CAGE**. **Phase 2** = remaining dimensions.
> - **Sexual history:** included in Phase 2 but **behind an off-by-default "Add if relevant"
>   toggle** (collapsed, discreet).

---

## Why v2

v1 (shipped) gives single-select chips per dimension serialized to one TEXT column. It
cannot capture **quantity** (cigs/day, units/week) or the **derived indices** that drive
clinical decisions:

| Index | Formula | Threshold |
|-------|---------|-----------|
| **Pack-years** | `(cigarettes per day ÷ 20) × years smoked` | risk stratification (e.g. ≥20) |
| **CAGE** | count of 4 yes/no answers (Cut down · Annoyed · Guilty · **E**ye-opener) | **≥2 = screen positive** |

These need numbers + a small structured object, which the flat TEXT model can't hold
cleanly. Hence the JSONB source + derived TEXT split.

> **Note:** `social_history` is currently **stored but not rendered** in PDF/SMS (verified:
> no `social_history` references in PDF services). So the derived TEXT has no downstream
> coupling today — it exists for carry-forward, future PDF, and human-readable snapshots.

---

## Architecture (mirrors `complaints` → `cc`/`hopi`)

```
SocialHistoryField (UI)
   │  edits structured object
   ▼
RxFormFields.socialHistoryStructured : SocialHistoryStructured
   │  buildRxPayload
   ▼
{ socialHistoryStructured: {...},            → social_history_structured JSONB (source)
  socialHistory: serialize(structured) }     → social_history TEXT (derived display)
   │
   ▼
prescription-service (insert/update/last-subjective passthrough)
   │  hydrate: prefer JSONB; fall back to parsing legacy TEXT
   ▼
SocialHistoryField (UI)
```

---

# Phase 1 — Data model + nicotine/alcohol with indices

## P1-01 · Migration `125_prescriptions_social_history_structured.sql`

```sql
ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS social_history_structured JSONB NULL;

COMMENT ON COLUMN prescriptions.social_history_structured IS
  'PHI: structured social/personal history (v2). social_history TEXT is derived from this on save. subjective-tab / ST-D6.';
```

- Additive only, `IF NOT EXISTS` (matches 116 pattern). RLS unchanged (026 covers all
  columns). 7-year retention applies (PHI).
- **Rollback (documented, not shipped):** `DROP COLUMN IF EXISTS social_history_structured;`

## P1-02 · Shared types & schema — `frontend/lib/cockpit/social-history.ts` (rewrite)

Keep the existing parse/serialize export names where possible (consumers already import
them) but change the model. Phase-1 shape:

```ts
export type SmokingStatus = "never" | "current" | "ex";

export interface SocialHistoryStructured {
  smoking?: {
    status: SmokingStatus;
    types: string[];              // cigarette | beedi | hookah | cigar | vape
    perDay?: number;
    years?: number;
    quitYearsAgo?: number;        // when status = "ex"
  };
  smokeless?: {
    status: SmokingStatus;
    types: string[];              // gutka | khaini | paan/supari | zarda | mishri
    perDay?: number;
    years?: number;
  };
  alcohol?: {
    status: SmokingStatus;
    types: string[];              // beer | wine | spirits | local
    unitsPerWeek?: number;
    pattern?: "occasional" | "weekend" | "daily" | "binge";
    cage?: { cutDown: boolean; annoyed: boolean; guilty: boolean; eyeOpener: boolean };
    quitYearsAgo?: number;
  };
  notes?: string;                 // free-text remainder
  // Phase 2 keys appended here (substances, diet, activity, occupation, …)
}
```

Functions in this module:
- `parseSocialHistory(input)` — accepts the **JSONB object** (preferred). For legacy rows
  with only TEXT, reuse the existing v1 token/legacy parser to best-effort hydrate
  smoking/alcohol/diet so old prescriptions still show something.
- `serializeSocialHistory(structured)` — deterministic, human-readable TEXT (see P1-04).
- `setSmoking / setSmokeless / setAlcohol / setSocialHistoryNotes` — immutable updaters
  returning a new `SocialHistoryStructured` (replace-within-dimension semantics).
- `formatSocialHistoryPreview(structured)` — one-line collapsed preview.

## P1-03 · Indices — `frontend/lib/cockpit/social-history-indices.ts` (new, pure)

```ts
export function packYears(perDay?: number, years?: number): number | null {
  if (!perDay || !years) return null;          // both required
  return Math.round((perDay / 20) * years * 10) / 10;   // 1 dp
}

export function cageScore(cage?: SocialHistoryStructured["alcohol"]["cage"]): {
  score: number; positive: boolean;
} | null {
  if (!cage) return null;
  const score = [cage.cutDown, cage.annoyed, cage.guilty, cage.eyeOpener].filter(Boolean).length;
  return { score, positive: score >= 2 };
}
```

Render live: `≈ 30 pack-years`, `CAGE 3/4 · screen positive`. When inputs incomplete, show
hint (`add /day & years for pack-years`).

## P1-04 · Serializer output (TEXT, for display/carry-forward)

Deterministic, `·`-joined, dimensions in fixed order, e.g.:

```
Smoking: Ex-smoker (cigarette, 10/day × 20 yr ≈ 10 pack-yrs, quit 2 yr ago) · Smokeless: Gutka/Khaini, 4/day × 8 yr · Alcohol: Current (spirits, 14 units/wk, daily; CAGE 3/4 positive) · <notes>
```

Rules: omit empty dimensions; `never` renders compact (`Smoking: Non-smoker`); indices only
when computable.

## P1-05 · UI — `SocialHistoryField.tsx` (rewrite, Phase-1 sections)

Inside the existing `CollapsibleContainer` ("Social / personal history"):

- **Smoking** — status chips (`Never / Current / Ex`). On `current`/`ex` reveal:
  type chips (multi: cigarette/beedi/hookah/cigar/vape) · `/day` stepper · `years` stepper ·
  (`quit yrs ago` if ex) · live **pack-years** badge.
- **Smokeless tobacco** — same pattern (types: gutka/khaini/paan/zarda/mishri); no index.
- **Alcohol** — status chips. On `current`/`ex` reveal: type chips · `units/week` ·
  pattern chips (`Occasional / Weekend / Daily / Binge`) · **CAGE** 4-toggle mini-form
  (labels: `Cut down? · Annoyed? · Guilty? · Eye-opener?`) → live **score + positive flag**.
- **Additional notes** — `NoteFavoritesChipStrip` + textarea → `notes`.
- Conditional reveal keeps the card compact when status = `never`.

Reuse `RX_FIELD_INPUT_CLASS`, chip styles, and `useNoteFavorites` (field key
`socialHistory`) from v1.

## P1-06 · Backend wiring

- `backend/src/types/prescription.ts` — add `SocialHistoryStructured` interface +
  `socialHistoryStructured` on the create/update DTOs and `social_history_structured` on
  the row type.
- `backend/src/utils/validation.ts` — zod schema for `socialHistoryStructured` (status
  enums, bounded numbers `perDay 0–200`, `years 0–100`, `unitsPerWeek 0–200`, CAGE
  booleans, `notes` ≤ `PRESCRIPTION_HISTORY_MAX`) on **create** (L1317 area) and **update**
  (L1522 area). Keep existing `socialHistory` TEXT validation.
- `backend/src/services/prescription-service.ts`:
  - insert block (~L99–102): add `social_history_structured: data.socialHistoryStructured ?? null`.
  - update path: same passthrough.
  - last-subjective select (~L591) + return (~L628–632): include
    `social_history_structured` for carry-forward.
- Audit list at `validation.ts:2441` — add `'social_history_structured'` if that array
  governs PHI field tracking (verify before editing).

## P1-07 · Frontend form plumbing

- `RxFormContext.tsx` — add `socialHistoryStructured: SocialHistoryStructured` to
  `RxFormFields`; reducer action `SET_SOCIAL_HISTORY_STRUCTURED`; hydrate from API
  (prefer `social_history_structured`; else parse legacy `social_history` TEXT).
- `buildRxPayload` — send both `socialHistoryStructured` (JSONB) **and**
  `socialHistory = serialize(structured)` (derived TEXT).
- Carry-forward / subjective presets — copy the structured object (not the TEXT).

## P1-08 · Tests

- `social-history-indices.test.ts` — pack-years (incl. missing inputs → null, rounding),
  CAGE score + positive threshold.
- `social-history.test.ts` — structured serialize round-trip; legacy TEXT → structured
  fallback; replace-within-dimension; clear dimension.
- `SocialHistoryField.test.tsx` — conditional reveal on status, index badges update,
  CAGE toggles, notes/favorites.
- Backend: validation accept/reject cases + service passthrough (insert + last-subjective).

---

# Phase 2 — Remaining dimensions

Additive on top of Phase 1: extend the same `SocialHistoryStructured` object, serializer,
parser, backend zod schema, and `SocialHistoryField` with nine more dimensions. Same chip +
number + serializer pattern; **no new clinical indices**.

> **No migration needed.** `social_history_structured` JSONB is flexible and validated
> app-side (the column comment already says "JSONB stays flexible for Phase 2 dimensions").
> Phase 2 is purely additive code — new keys + zod sections + UI sections.

## P2 data model (appended to `SocialHistoryStructured`)

```ts
interface SocialHistoryStructured {
  // Phase 1 (shipped): smoking, smokeless, alcohol, notes
  substances?: {
    uses: string[];                 // cannabis | opioids | sedatives | stimulants | other
    route?: "oral" | "inhaled" | "iv";   // iv → infection-risk flag in serializer
  };
  diet?: {
    type?: "vegetarian" | "non-vegetarian" | "eggetarian" | "vegan";
    caffeineCupsPerDay?: number;
  };
  activity?: {
    level?: "sedentary" | "light" | "moderate" | "vigorous";
    daysPerWeek?: number;
  };
  occupation?: {
    text?: string;
    exposures: string[];            // dust/silica | chemicals | heat | heavy-lifting | screen
  };
  living?: {
    situation?: "alone" | "with-family" | "institutional";
    notes?: string;
  };
  travel?: {
    recent?: boolean;
    place?: string;
    sickContacts?: boolean;
  };
  sleep?: {
    hoursPerNight?: number;
    quality?: "good" | "fair" | "poor";
  };
  stress?: {
    level?: "low" | "moderate" | "high";
    support?: "good" | "limited" | "none";
  };
  sexual?: {                        // gated — off by default
    enabled: boolean;               // the "Add if relevant" toggle
    active?: boolean;
    partners?: "single" | "multiple";
    protection?: "always" | "sometimes" | "never";
  };
}
```

## P2 decisions (frozen)

- **SHv2-D6 — No migration.** New dimensions ride the existing flexible JSONB; validated
  app-side only.
- **SHv2-D7 — Legacy `notes` promotion.** Diet/activity/occupation that Phase 1 hydration
  dumped into `notes` (the `V1_PHASE2_DIMENSIONS` path in `social-history.ts`) are parsed
  **back out** into their structured fields; truly free-text remainder stays in `notes`.
- **SHv2-D8 — Sexual history is gated + discreet.** Hidden behind an off-by-default
  "Add if relevant" toggle; only serialized when `enabled` and a sub-field is set.
- **SHv2-D9 — No new indices.** Chips + numbers only (substances `iv` route shows an
  infection-risk hint, not a score).

## P2 serializer additions (derived TEXT)

Appended after the Phase-1 sections, fixed order, e.g.:

```
… · Substances: Cannabis (inhaled) · Diet: Vegetarian, 2 cups caffeine/day · Activity: Moderate, 3 days/wk · Occupation: Farmer (dust, heat) · Living: With family · Travel: Mumbai (sick contacts) · Sleep: 6 h, poor · Stress: High, limited support · Sexual: active, protection sometimes · <notes>
```

## P2 UI (extend `SocialHistoryField`)

Reuse the shipped `StatusChipRow` / `MultiTypeChipRow` / `NumberField` helpers + single-select
chip rows. Grouped into clusters to keep the card scannable:
- **Lifestyle:** Substances · Diet · Activity
- **Context:** Occupation (+exposures) · Living · Travel
- **Wellbeing:** Sleep · Stress
- **Sensitive:** Sexual history behind an "Add if relevant" toggle (collapsed; discreet copy).

---

## Execution order (Phase 1)

1. **P1-01** migration `125`
2. **P1-02 / P1-03 / P1-04** model + indices + serializer (pure, test-first)
3. **P1-06** backend types + validation + service
4. **P1-07** form plumbing
5. **P1-05** UI rewrite
6. **P1-08** tests throughout

---

## Risks / notes

- **Migration number:** `125` is free (ceiling = `124`). Re-confirm before creating — there
  are unstaged `122–124` locally.
- **Legacy hydration:** old rows have only `social_history` TEXT in v1 token form. The
  fallback parser must not lose data — anything unmatched goes to `notes`.
- **No PDF coupling today**, but keep the serializer PDF-ready (plain text, no markup) for
  when Objective/PDF surfaces it.
- **CAGE is a screen, not a diagnosis** — label the positive flag as "screen positive" to
  avoid over-reading.

---

## Refinement log

| Date | Item | Change summary |
|------|------|----------------|
| 2026-06-07 | — | Plan drafted (Phase 1 detailed, Phase 2 outlined) |
| 2026-06-07 | Phase 1 | **Shipped** — migration 125, structured smoking/smokeless/alcohol + pack-years + CAGE, backend types/zod, service + template passthrough, `SocialHistoryField` rewrite |
| 2026-06-07 | Phase 2 | Spec fleshed out (9 dims, no migration, legacy-notes promotion, gated sexual history); task batch `p2-remaining-dimensions` drafted |
