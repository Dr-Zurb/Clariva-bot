# Plan — Cockpit-v3 "Subjective" tab

## Complaint cards + patient history, engineered so doctors *tap* instead of *type*

> **Read-order:** [README.md](./README.md) → **plan-subjective-tab.md (this file)**. Sits beside the [EHR roadmap](../README.md); reuses T2 speed infra (autocomplete, favorites, templates, autosave) and T1 chart tables.
>
> **Status:** `Drafted` 2026-06-03.
>
> **Depends on:** Cockpit-v3 (shipped — `SubjectivePane` / `SubjectiveSection` / `RxFormContext`), T1 (`patient_allergies` / `patient_chronic_conditions` — shipped, migration 087), T2 (`drug_master`, `doctor_rx_templates`, `doctor_drug_favorites`, `useAutoSave` — shipped).
>
> **Effort:** ~6–8 dev-days across 10 items (v1 ≈ 3–4 days).
>
> **Schema:** 3 additive migrations — `prescriptions` subjective expansion (`complaints` JSONB + 3 history columns), `complaint_master` (+ seed), `doctor_note_favorites`. No destructive changes; `cc` / `hopi` stay (become derived).

---

## Why this tab matters

The Subjective tab is where the consultation *starts* and where the doctor types the
most. Today it is two raw fields — a Chief-complaint `<input>` and an HPI `<textarea>`:

```24:57:frontend/components/cockpit/rx/sections/SubjectiveSection.tsx
    <section id="rx-symptoms" aria-label="Subjective" className="space-y-3">
      ...
        <label htmlFor="cc" ...>Chief complaint (CC)</label>
        <input id="cc" ... value={fields.cc} ... />
      ...
        <label htmlFor="hopi" ...>History of present illness (HOPI)</label>
        <textarea id="hopi" rows={3} value={fields.hopi} ... />
```

Two problems:

1. **No structure.** A patient with "headache, leg pain, body ache" is three complaints,
   each with its own onset/severity/character — but today it's one blob of prose.
2. **It's all typing.** Every visit the doctor re-types the same story. For follow-ups
   and common presentations that is pure waste.

This plan turns Subjective into **structured complaint cards + the relevant patient
history**, and wires every field to the fast-entry stack the codebase already ships.

---

## Scope — what the tab owns vs. what it links

The SOAP "Subjective" = everything the patient *tells* you (vs. Objective = what you
measure/examine, which lives in the Objective tab). That is CC + HPI **plus the
histories**. But several histories already have patient-level homes shipped in T1, so we
**link** them rather than re-enter them.

| Subjective component | Disposition | Backed by |
|---|---|---|
| Chief complaint(s) | **Own** (per-visit) | new `complaints` JSONB → derives `cc` |
| History of present illness (HPI / OLDCARTS) | **Own** (per-visit) | the complaint cards → derives `hopi` |
| Family history (FH) | **Own** (new field) | new `prescriptions.family_history` |
| Social / personal history (SH) | **Own** (new field) | new `prescriptions.social_history` |
| Past surgical history (PSH) | **Own** (new field) | new `prescriptions.past_surgical_history` |
| Past medical history / chronic conditions (PMH) | **Link** | `patient_chronic_conditions` (`ChronicConditionsSection`, shipped) |
| Allergies | **Link** | `patient_allergies` (`AllergiesSection`, shipped) |
| Current medications | **Link** | prior `prescriptions` / problem list (`ProblemListSection`) |
| Review of systems (ROS) | **Defer** | later collapsible |
| Ideas / concerns / expectations (ICE) | **Defer** | later collapsible |
| Menstrual / obstetric, immunization, developmental | **Conditional** (later) | patient-context aware; out of v1 |

**Decision rationale (own vs. link):** PMH / allergies / current-meds are *patient-level,
longitudinal* facts that persist across visits — they already live in doctor-scoped
patient tables (migration 087) with shipped add/archive UIs. Re-entering them in every
note would double-key data and drift. FH / SH / PSH have **no** home yet and are captured
as part of the note narrative, so the tab owns them.

---

## Field inventory (the locked recap)

### Zone A — This visit (owned by the note)

**A1. Complaint cards** — a reorderable list; each card = one complaint:

| Field | Type | Fast entry |
|---|---|---|
| Complaint name | text | autocomplete (`complaint_master`) + favorite chips |
| Onset | short text / chip | "2 days ago" |
| Duration | chip | `[Today][2d][1wk][>1mo]` + custom |
| Location / site | short text / chip | "frontal", "both calves" |
| Character | chips | `[throbbing][dull][sharp][cramping]` |
| Radiation | short text | |
| Severity | segmented / 0–10 | `[mild][mod][severe]` |
| Timing | chips | `[constant][intermittent][morning][night]` |
| Aggravating | chip / text | |
| Relieving | chip / text | |
| Associated symptoms | chips (multi) | nausea, photophobia… |
| Notes | free text | per-complaint catch-all |

Card mechanics: number/order = clinical priority (drag to reorder), collapse/expand,
remove. The visible attribute set is **complaint-type aware** (see ST.3).

**A2. Owned history fields** (new): Family history, Social/Personal history, Past surgical
history — each a chip-assisted free-text field.

**A3. Free-text fallback** — the existing `hopi` textarea, kept (collapsed) for anything
non-chippable or for dictation.

### Zone B — Patient background (linked, read + quick-edit)

- **PMH / chronic conditions** — `ChronicConditionsSection`
- **Allergies** — `AllergiesSection` (also feeds the safety strip)
- **Current medications / problem list** — `ProblemListSection` + prior Rx

### Derived (never hand-entered)

- `cc` = joined complaint names (primary first).
- `hopi` = formatted multi-complaint OLDCARTS summary.

→ keeps the PDF (`PrescriptionDocument.tsx`), SMS summary, snapshot, and `buildRxPayload`
working with zero downstream change.

---

## Decisions — LOCKED 2026-06-03

| ID | Decision | Implication |
|----|----------|-------------|
| **ST-D1** | **Complaints are a structured JSONB array on `prescriptions`** (`complaints`), mirroring the `medicines` array pattern — not packed into `hopi`. | One additive column; reducer actions mirror `ADD/UPDATE/REMOVE_MEDICINE`; queryable for future analytics. |
| **ST-D2** | **`cc` / `hopi` become derived** from `complaints` in `buildRxPayload`; columns stay. | Zero change to PDF / SMS / snapshot / public-prescription reads. A doctor may still hand-edit the free-text fallback. |
| **ST-D3** | **Own = FH / SH / PSH; link = PMH / allergies / current meds.** | FH/SH/PSH get new `prescriptions` columns; PMH/allergies are embedded via the shipped chart sections, never re-keyed. |
| **ST-D4** | **Per-complaint attributes are complaint-type aware** (pain → SOCRATES, fever → pattern/max-temp/chills, default → OLDCARTS) via a frontend schema registry. | New `complaint-schema.ts`; default OLDCARTS fallback so unknown complaints still work. |
| **ST-D5** | **Every owned field gets the full fast-entry stack** (favorites chips, autocomplete where a master exists, copy-forward, presets, autosave) — typing is the escape hatch, not the default. | New `complaint_master` + `doctor_note_favorites`; reuse `useAutoSave` (1.5s) + `DrugAutocomplete` pattern. |
| **ST-D6** | **Social/personal history is free-text + chips in v1**; structured columns (smoking/alcohol/occupation/diet) are deferred. | `social_history TEXT`; optional structured JSONB is a v2 line item. |
| **ST-D7** | **ROS + ICE are deferred** to a later collapsible; v1 ships complaint cards + owned histories + linked sections. | Keeps v1 shippable in ~3–4 days. |

---

## Data model

### What exists today (migration 103)

`prescriptions` already owns the SOAP columns: `cc`, `hopi`, `provisional_diagnosis`,
`investigations_orders`, vitals (7), `examination_findings`, `differential_diagnosis`
(`TEXT[]`), `advice`, `follow_up_value/unit`, `referral`, `test_results`,
`patient_education`, `clinical_notes`. **Subjective owns only `cc` + `hopi`.**

Patient-level history tables exist (migration 087): `patient_allergies`,
`patient_chronic_conditions`, `patient_vitals` — doctor-scoped, soft-deletable.

### What's new (3 additive migrations — suggested 116 / 117 / 118)

**1. `prescriptions` subjective expansion (≈116).**

```sql
ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS complaints              JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS family_history          TEXT  NULL,
  ADD COLUMN IF NOT EXISTS social_history          TEXT  NULL,
  ADD COLUMN IF NOT EXISTS past_surgical_history   TEXT  NULL;

-- complaints[] element shape (validated app-side; JSONB stays flexible):
--   { id, name, onset?, duration?, location?, character?, radiation?,
--     severity?, timing?, aggravating?, relieving?,
--     associated?: string[], notes? }
COMMENT ON COLUMN prescriptions.complaints IS
  'PHI: structured chief-complaint + HPI cards (OLDCARTS). cc/hopi are derived from this on save.';
```

RLS unchanged (migration 026 `auth.uid() = doctor_id` covers new columns). Follows the
103 idempotency pattern (`ADD COLUMN IF NOT EXISTS`).

**2. `complaint_master` lookup + seed (≈117)** — mirrors `drug_master` (088/089).

```sql
CREATE TABLE IF NOT EXISTS complaint_master (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,                 -- "Headache"
  synonyms      TEXT[] NOT NULL DEFAULT '{}',  -- ["cephalalgia"]
  category      TEXT NULL,                     -- "pain" | "fever" | "cough" | ...
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_complaint_master_name_trgm
  ON complaint_master USING gin (name gin_trgm_ops);
ALTER TABLE complaint_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY complaint_master_read_all ON complaint_master FOR SELECT USING (true);
```

`category` powers the complaint-type-aware schema (ST-D4). Seed ~150 common presentations.

**3. `doctor_note_favorites` (≈118)** — generic per-doctor chip favorites for subjective
text fields; mirrors `doctor_drug_favorites` (109).

```sql
CREATE TABLE IF NOT EXISTS doctor_note_favorites (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  field_key     TEXT NOT NULL,   -- 'complaint' | 'family_history' | 'social_history' | 'past_surgical_history' | 'associated'
  value         TEXT NOT NULL,
  use_count     INTEGER NOT NULL DEFAULT 0,
  last_used_at  TIMESTAMPTZ NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (doctor_id, field_key, value)
);
CREATE INDEX IF NOT EXISTS idx_doctor_note_favorites_lookup
  ON doctor_note_favorites (doctor_id, field_key, use_count DESC);
ALTER TABLE doctor_note_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY dnf_select_own ON doctor_note_favorites FOR SELECT USING (auth.uid() = doctor_id);
CREATE POLICY dnf_insert_own ON doctor_note_favorites FOR INSERT WITH CHECK (auth.uid() = doctor_id);
CREATE POLICY dnf_update_own ON doctor_note_favorites FOR UPDATE USING (auth.uid() = doctor_id) WITH CHECK (auth.uid() = doctor_id);
CREATE POLICY dnf_delete_own ON doctor_note_favorites FOR DELETE USING (auth.uid() = doctor_id);
```

### `RxFormFields` additions

```ts
// frontend/components/cockpit/rx/RxFormContext.tsx
interface Complaint {
  id: string;
  name: string;
  onset?: string; duration?: string; location?: string; character?: string;
  radiation?: string; severity?: "mild" | "moderate" | "severe" | number | null;
  timing?: string; aggravating?: string; relieving?: string;
  associated?: string[]; notes?: string;
}
// new on RxFormFields:
complaints: Complaint[];
familyHistory: string;
socialHistory: string;
pastSurgicalHistory: string;
```

New reducer actions: `ADD_COMPLAINT` / `UPDATE_COMPLAINT` / `REMOVE_COMPLAINT` /
`REORDER_COMPLAINTS` (mirror the medicine actions at
`RxFormContext.tsx` L293–L325). `buildRxPayload` derives `cc` + `hopi` from `complaints`.

---

## Fast-entry strategy (the whole point)

Map every owned field to a reuse of existing infra:

| Field | Mechanism | Reuses |
|---|---|---|
| Complaint name | autocomplete + favorite chips | `DrugAutocomplete` pattern, `FavoritesChipStrip` |
| OLDCARTS attributes | type-aware chip palettes | `DdxChipList` chip pattern + `complaint-schema.ts` |
| Family / Social / Surgical hx | favorite chips + free text | `doctor_note_favorites`, `FavoritesChipStrip` |
| Whole tab | carry-forward from last visit | `PreviousRxPopover` / `getLastPrescriptionInEpisode` |
| Whole tab | subjective presets | extend `doctor_rx_templates` (already has `cc`/`hopi`) |
| Whole tab | smart-confirm defaults | most-common attribute pre-select (per `use_count`) |
| Everything | autosave (no save button) | `useAutoSave` (1.5s, Decision E5/T2-D3) |
| Everything | free-text escape hatch | the kept `hopi` fallback |

**The happy path:** focus complaint box → tap a favorite chip (or type → autocomplete →
Enter) → card auto-expands with type-relevant chips pre-selected to the doctor's usual
values → tap to adjust → repeat. Three complaints in ~10 taps, zero sentences.

---

## Items

### ST.1 — Data model + state: complaints array & owned history fields
**Status:** `Drafted`. **Effort:** 1 day. **Files:**
- `backend/migrations/116_prescriptions_subjective_expansion.sql` (new).
- `backend/src/services/prescription-service.ts`, `backend/src/types/*`, PDF/notification mappers — plumb `complaints` + 3 history fields (read/write).
- `frontend/components/cockpit/rx/RxFormContext.tsx` — add fields, `Complaint` type, reducer actions, derive `cc`/`hopi` in `buildRxPayload`.

**Acceptance.** Migration idempotent; existing rows unaffected. New fields round-trip
through create/update/autosave. `cc`/`hopi` derived from `complaints` on save; a manual
`hopi` edit (fallback) is preserved. `tsc` + unit tests for the reducer + derivation green.

---

### ST.2 — `ComplaintCard` + complaint list UI
**Status:** `Drafted`. **Effort:** 1.5 days. **Files:**
- `frontend/components/cockpit/rx/subjective/ComplaintCard.tsx` (new) — modeled line-for-line on `MedicineRow.tsx` (collapsed summary vs. editor, drag handle, remove).
- `frontend/components/cockpit/rx/subjective/ComplaintList.tsx` (new) — add row + ordered cards + "+ Add complaint".
- `frontend/components/cockpit/rx/sections/SubjectiveSection.tsx` — replace the raw CC/HPI inputs with `<ComplaintList>` + collapsed free-text fallback.

**Acceptance.** Add/edit/remove/reorder works; collapsed card shows the auto-summary
line; expanded shows attribute inputs; narrow-rail friendly (single column); autosaves;
existing `SubjectivePane` test updated; a11y (labels, focus order, 44px targets) holds.

---

### ST.3 — Complaint-type attribute schema registry
**Status:** `Drafted`. **Effort:** 0.5 day. **Files:**
- `frontend/lib/cockpit/complaint-schema.ts` (new) — `Record<category, AttributeFieldDef[]>` + keyword→category resolver, default = OLDCARTS.

**Spec.** Picking a complaint (or its `complaint_master.category`) resolves which attribute
rows + chip vocabularies the card renders: **pain** → SOCRATES; **fever** → pattern /
max-temp / chills / duration; **cough** → dry-or-productive / sputum / duration; **default**
→ OLDCARTS. **Acceptance.** Unknown complaint falls back to OLDCARTS; switching the
complaint name re-resolves the card without losing already-entered shared fields.

---

### ST.4 — Owned history fields (Family / Social / Past surgical)
**Status:** `Drafted`. **Effort:** 0.5 day. **Files:**
- `frontend/components/cockpit/rx/subjective/HistoryFields.tsx` (new) — three chip-assisted free-text fields, collapsible.

**Acceptance.** Each field saves to its column; chip favorites insert text; collapsible to
keep the rail compact; autosaves.

---

### ST.5 — Linked chart sections embedded in the tab
**Status:** `Drafted`. **Effort:** 0.75 day. **Files:**
- `frontend/components/patient-profile/panes/SubjectivePane.tsx` — mount `ChronicConditionsSection` (PMH), `AllergiesSection`, and a current-meds/problem strip in a "Patient background" zone, passing `patientId`/`token`.

**Spec.** Read + quick-add against the existing patient-level tables — **no re-entry** into
the note. Compact, collapsible, below the owned zone. **Acceptance.** Sections render with
real data, add/archive still work, allergies continue to feed the safety strip; no
duplicate writes; read-only mounts hide add affordances.

---

### ST.6 — Fast entry: complaint master + favorites chips
**Status:** `Drafted`. **Effort:** 1 day. **Files:**
- `backend/migrations/117_complaint_master.sql` + seed (~150 presentations).
- `backend/migrations/118_doctor_note_favorites.sql` + `backend/src/services/note-favorites-service.ts` + controller/route.
- `frontend/lib/api/complaint-master.ts`, `frontend/lib/api/note-favorites.ts` (new clients).
- `frontend/components/cockpit/rx/subjective/ComplaintAutocomplete.tsx` (new, `DrugAutocomplete` clone) + favorite-chip strip wired into ST.2/ST.4.

**Acceptance.** Typing "head" surfaces "Headache" < 250ms; selecting sets name + category
(drives ST.3); favorites are per-doctor, ranked by `use_count`, one-tap insert, "save
current" adds a favorite; free-text still allowed.

---

### ST.7 — Carry-forward Subjective from last visit
**Status:** `Drafted`. **Effort:** 0.5 day. **Files:**
- `backend/src/services/prescription-service.ts` — `getLastSubjectiveForPatient(patientId, beforeAppointmentId)` (returns `complaints` + histories).
- `frontend/components/cockpit/rx/subjective/CarryForwardButton.tsx` (new).

**Spec.** One tap "Same as last visit" hydrates complaint cards + owned histories from the
prior Rx; doctor edits the delta. Scoped to subjective fields only (reuses the
`PreviousRxPopover` surface pattern). **Acceptance.** Appears only when a prior Rx exists;
"copy all" + "pick fields" both work; autosaves after copy.

---

### ST.8 — Subjective presets (templates)
**Status:** `Drafted`. **Effort:** 0.75 day. **Files:**
- `backend/migrations/` (optional) — extend `doctor_rx_templates` payload to carry `complaints` + histories (column already has `cc`/`hopi`).
- `frontend/components/ehr/TemplatePicker.tsx` — add a "Subjective only" apply mode.

**Spec.** Save/apply a complaint+OLDCARTS+history bundle ("Migraine subjective", "URI
subjective") in one tap, reusing the existing template picker + usage ranking.
**Acceptance.** Apply fills only subjective fields; save-current snapshots them; usage
counter bumps.

---

### ST.9 — Smart-confirm defaults
**Status:** `Shipped` (2026-06-03 — subj-09). **Effort:** 0.5 day. **Files:**
- `frontend/lib/cockpit/complaint-defaults.ts` (new) — per-doctor most-common attribute values (derived from `doctor_note_favorites` / prior complaints).

**Spec.** Picking a complaint pre-selects its usual attribute values so the common case is
"pick → glance → done"; doctor edits only exceptions. **Acceptance.** Defaults are
suggestions (visually distinct until confirmed); never overwrite an explicit edit.

---

### ST.10 — Integration, a11y, autosave & phase gate
**Status:** `Shipped` (2026-06-03 — subj-10; close-gate PASSED). **Effort:** 0.5–1 day. **Files:** tests + a gate stamp.

**Spec.** Integration smoke (add 3 complaints → reorder → carry-forward → preset apply →
autosave → reload restores). a11y/contrast in light+dark; 44px targets; keyboard-only
flow (Tab/Enter add). Confirm zero regression to PDF/SMS/snapshot (derived `cc`/`hopi`).
`tsc`/lint/suites green. **Acceptance.** All the above + gate stamped.

---

## Phasing

```
v1 (ship first, ~3–4 days):  ST.1 → ST.2 → ST.3 → ST.4 → ST.5
   = structured complaint cards (type-aware) + owned histories + linked chart sections,
     cc/hopi derived. Already a huge UX jump over today's two boxes.

v2 (fast entry, ~2–3 days):  ST.6 → ST.7 → ST.8
   = complaint autocomplete + favorites, carry-forward, subjective presets.

v3 (polish, ~1 day):         ST.9 → ST.10
   = smart-confirm defaults, integration/a11y/gate.

Later / deferred:            ROS, ICE, structured social-history columns, AI/voice scribe.
```

**Recommended first build = v1.** It is shippable on its own and reuses only patterns that
already exist; the fast-entry layer (v2) layers on top without reshaping the data model.

### Promotion status (→ dated batches)

`Committed` 2026-06-03 — promoted to phased batches under
`Daily-plans/June 2026/03-06-2026/subjective-tab/` (prefix `subj`, items map 1:1 to `subj-01..10`):

| Slice | Phase folder | Items |
|---|---|---|
| v1 | [`p1-complaint-cards/`](../../../Daily-plans/June%202026/03-06-2026/subjective-tab/p1-complaint-cards/) | ST.1–ST.5 → subj-01..05 |
| v2 | [`p2-fast-entry/`](../../../Daily-plans/June%202026/03-06-2026/subjective-tab/p2-fast-entry/) | ST.6–ST.8 → subj-06..08 |
| v3 | [`p3-polish/`](../../../Daily-plans/June%202026/03-06-2026/subjective-tab/p3-polish/) | ST.9–ST.10 → subj-09..10 |

Program index: [`subjective-tab/README.md`](../../../Daily-plans/June%202026/03-06-2026/subjective-tab/README.md).

---

## Out of scope (this plan)

- **ROS** and **ICE** (deferred — ST-D7).
- **Structured social-history columns** (smoking/alcohol/occupation) — v2 line item (ST-D6).
- **Menstrual/obstetric, immunization, developmental** histories (patient-context aware) — later.
- **AI/voice scribe** drafting the note — separate AI line (`plan-t6-ehr-ai-assist`).
- Re-architecting the Objective/Assessment/Plan tabs (other tabs own their fields).
- Clinic-wide sharing of presets/favorites (per T2-D2; per-doctor only).

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| `cc`/`hopi` derivation breaks the PDF/SMS/snapshot | ST.1 keeps the columns + a deterministic derivation; ST.10 asserts byte-parity on a fixture; free-text fallback preserved. |
| Structured cards feel *slower* than a textarea for power users | Collapsed free-text fallback always available; chips + autocomplete target fewer taps than typing; keyboard-only flow (ST.10). |
| Complaint master seed is thin / wrong category | Start ~150 common presentations; free-text always allowed; "suggest missing" link; category defaults to OLDCARTS so a missing category never blocks. |
| Linked sections bloat the narrow rail | "Patient background" zone is collapsible and below the owned zone; reuses compact section UIs. |
| JSONB `complaints` drift / invalid shape | App-side validation on read/write; reducer is the only writer; migration default `'[]'`. |
| Scope creep into ROS/AI | ST-D7 hard-defers; v1 gate is complaint cards + owned + linked only. |

---

## Open questions

| # | Question | Default if unanswered |
|---|----------|-----------------------|
| ST-Q1 | Social history: free-text+chips now, or structured columns in v1? | **Free-text + chips** (ST-D6); structured deferred. |
| ST-Q2 | Should carry-forward pull from the *last visit* generally, or only within the same care **episode**? | Last visit for this patient; episode-aware is a refinement. |
| ST-Q3 | Severity scale: segmented mild/mod/severe, or 0–10 numeric? | **Segmented** (fastest); numeric optional per complaint type. |
| ST-Q4 | Do we seed `complaint_master` ourselves or reuse an existing symptom list? | Hand-curated ~150 to start (mirror `drug_master` approach). |

---

**Created:** 2026-06-03. **Status:** `Committed` (2026-06-03) — promoted to phased batches under [`Daily-plans/June 2026/03-06-2026/subjective-tab/`](../../../Daily-plans/June%202026/03-06-2026/subjective-tab/). **Owner:** TBD.
