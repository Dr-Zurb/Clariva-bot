# Plan — Cockpit-v3 "Objective" tab

## Structured physical exam + Vitals 2.0, engineered so doctors *tap* instead of *type*

> **Read-order:** [README.md](./README.md) → **plan-objective-tab.md (this file)**. Sits beside the [EHR roadmap](../README.md) and is the Objective sibling of [`../subjective-tab/plan-subjective-tab.md`](../subjective-tab/plan-subjective-tab.md). Reuses the subjective tab's shipped engines (derived-text contract, fast-entry chips, section reorder/collapse/visibility, scoped templates, custom sections).
>
> **Status:** `Drafted` 2026-06-18.
>
> **Depends on:** Cockpit-v3 (shipped — `ObjectiveSection` / `VitalsGrid` / `RxFormContext`), migration 103 (`prescriptions` SOAP columns incl. `examination_findings`, `test_results`, 7 `vitals_*` columns), and the Subjective-tab program (shipped — the derived-text + fast-entry + layout-engine patterns this plan ports).
>
> **Effort:** ~7–9 dev-days across 6 phases (P1 ≈ 2–3 days).
>
> **Schema:** additive only. P1 adds one JSONB column (`prescriptions.examination_json`); P2 adds extended-vitals columns; P3 adds `doctor_settings` config columns (clones of the subjective ones). No destructive changes — `examination_findings` / `test_results` / `vitals_*` stay and become **derived mirrors**.

---

## Why this tab matters

The Subjective tab is now a structured, fast-entry, template-aware surface. **Objective is
still v1 rough.** Today it is a 7-field numeric vitals grid plus three free-text areas:

```42:94:frontend/components/cockpit/rx/sections/ObjectiveSection.tsx
      <div className="rounded-md border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
          <User className="h-4 w-4 text-muted-foreground" aria-hidden />
          <label htmlFor="exam-general" ...>General Examination</label>
        </div>
        <textarea id="exam-general" rows={3} value={exam.general} ... />
        ...
        <textarea id="exam-systemic" rows={4} value={exam.systemic} ... />
      </div>
```

The "General" + "Systemic" textareas are **packed into one `examination_findings`
column** via a `--- SYSTEMIC ---` delimiter (`lib/cockpit/exam-findings.ts`). Three problems:

1. **No structure.** "Chest clear, HS S1+S2 normal, abdomen soft" is three system findings
   in one blob — not queryable, not chip-able, not template-able.
2. **It's all typing.** Every visit the doctor re-types "within normal limits" for each
   system. For routine exams that is pure waste.
3. **None of the subjective engines reach it** — no reorder, no collapse memory, no
   visibility manager, no templates, no carry-forward. Objective is the one SOAP tab the
   doctor still hand-types.

This plan turns Objective into **structured system-wise exam cards + Vitals 2.0**, ports the
subjective layout engines, and keeps `examination_findings` as a **derived mirror** so the
PDF / SMS / snapshot break by zero bytes.

---

## Scope — what the tab owns vs. what it links

The SOAP "Objective" = everything the clinician *measures or examines* (vs. Subjective =
what the patient tells you). That is **vitals + physical examination + objective test
results the clinician reviewed**.

| Objective component | Disposition | Backed by |
|---|---|---|
| Vitals (BP, HR, temp, SpO₂, weight, height, BMI) | **Own** (shipped) | `vitals_*` columns (migration 103) |
| Vitals 2.0 (RR, pain, glucose, GCS, peds HC/MUAC, posture, units, range flags) | **Own** (P2) | extended `vitals_*` columns |
| System-wise physical exam (general, CVS, resp, abd, CNS) | **Own** (P1, structured) | new `examination_json` JSONB → derives `examination_findings` |
| Specialty / long-tail exam systems (gynae P/V·P/S, ortho ROM, derm lesion, MSE…) | **Own via templates + custom sections** (P3/P4) | `objective_full`/per-system template scopes + custom objective sections |
| Point-of-care / bedside results (dipstick, glucometer, ECG note) | **Own** (P5) | structured rows (split from `test_results`) |
| Patient-brought reports / media (uploads, ECG image, wound photo) | **Own** (P5) | `test_results` text + storage attachments |
| Investigations *ordered* (pending results) | **Link / defer** | lives in the Plan pane; "pending results" surfacing is a P5 open question |
| Mental state exam (psych) | **Defer** | may belong to Assessment, not Objective — open question |

**Decision rationale (own vs. link):** vitals + physical exam are produced *at this visit by
the clinician* and have no patient-level longitudinal home, so the note owns them (mirrors the
subjective FH/SH/PSH rationale). Investigations *ordered* are a Plan-pane concern; only their
*results* surface here.

---

## Field inventory (the locked recap)

### Zone A — Vitals (owned, shipped + P2 additions)

Shipped grid: BP sys/dia, HR, temp °C, SpO₂, weight kg, height cm, auto-BMI badge
(`VitalsGrid`, migration 103). P2 adds RR, pain (0–10), random/fasting glucose, GCS,
BP posture/limb, peds HC/MUAC, waist; unit toggles (°C/°F, kg/lb, cm/in — store canonical);
out-of-range flags; derived MAP/BSA/percentiles; last-visit ghost values.

### Zone B — Structured physical examination (owned; **P1 is the headline**)

A reorderable list of **system cards** — the Objective analog of subjective complaint
cards. Each card = one body system, **tri-state** (not examined / normal / abnormal):

| Field | Type | Fast entry |
|---|---|---|
| System status | tri-state toggle | not-examined · `[Normal]` · `[Abnormal]` |
| "Within normal limits" | one-tap | fills the system's normal one-liner |
| Findings (when abnormal) | chips + free text | type-aware abnormal chip palette per system |
| Notes | free text | per-system catch-all |

P1 ships **5 core systems** (general, CVS, resp, abdomen, CNS — the `OBJ-D3` C3 set) plus a
**"Mark entire exam normal"** express action and the kept legacy free-text exam as the
escape hatch. Specialty systems arrive via templates + custom sections (P3/P4).

### Zone C — Test results / point-of-care (owned; split in P5)

Today one `test_results` textarea. P5 splits patient-brought reports vs. in-clinic POC
(dipstick/glucometer/ECG) and adds media attachments.

### Derived (never hand-entered)

- `examination_findings` = formatted text rendered from `examination_json` (+ legacy
  free-text fallback) → keeps the PDF (`PrescriptionDocument.tsx`), SMS summary, snapshot,
  and `buildRxPayload` working with **zero downstream change**.

---

## Decisions — LOCKED 2026-06-18

| ID | Decision | Implication |
|----|----------|-------------|
| **OBJ-D1** | **Structured exam is a typed JSONB column on `prescriptions`** (`examination_json`), mirroring the `complaints` / `medicines` array pattern — not packed into `examination_findings` text. | One additive migration (150); reducer actions mirror complaints; queryable for future analytics. |
| **OBJ-D2** | **`examination_findings` becomes a derived mirror** of `examination_json` in `buildRxPayload`; the column stays. **Legacy rows (empty `examination_json`) derive byte-identically** — the existing `parseExam`/`serializeExam` text passes through unchanged. | Zero change to PDF / SMS / snapshot / public-prescription reads. Close-gate (obj-04) proves byte-parity. |
| **OBJ-D3** | **C3 hybrid scope.** Typed cards for **5 core systems** (general, CVS, resp, abdomen, CNS) + typed vitals (P2). Specialty / long-tail systems (gynae P/V·P/S, ortho ROM, derm lesion, ENT, MSE…) ship via **templates + custom objective sections**, not typed schema, until demand proves the schema. | Two patterns, but the heavy-traffic systems are structured and the long tail stays cheap. |
| **OBJ-D4** | **Each system card is tri-state** (not examined / normal / abnormal). One-tap "within normal limits" fills the normal one-liner; "abnormal" reveals the chip palette + free text. A **frontend schema registry** (`exam-schema.ts`) holds the per-system normal line + abnormal chips, with an OLDCARTS-style default fallback for unknown systems. | New `exam-schema.ts` (mirrors `complaint-schema.ts`); unknown/custom systems still render. |
| **OBJ-D5** | **Every system + vital gets the fast-entry stack** (chip palettes, "mark whole exam normal", carry-forward, templates, autosave). Typing is the escape hatch — the legacy free-text exam stays (collapsed). | Reuse `useAutoSave` (1.5s), `FavoritesChipStrip`/chip patterns, `CarryForwardButton` (P-later). |
| **OBJ-D6** | **Modality-aware + specialty defaults are deferred to the layout-engine phase (P3).** P1 ships all 5 cards visible with vitals open by default; per-consult-type and per-specialty default visibility ride the ported visibility/hidden-set engine. | Keeps P1 shippable; no consult-type branching in P1. |
| **OBJ-D7** | **Legacy `vitalsText` + free-text exam stay as the escape hatch; sunset is parked.** No removal of the deprecated free-text vitals input or the general/systemic textareas in this program — they become the unstructured fallback path that the derived contract round-trips. | Removal is a separate decision once structured coverage is proven (tracked in backlog). |

---

## Data model

### What exists today (migration 103)

`prescriptions` owns the SOAP columns incl. `examination_findings TEXT`, `test_results TEXT`,
and 7 `vitals_*` columns (BP sys/dia, HR, temp, SpO₂, weight, height) with CHECK ranges.
The General + Systemic textareas are delimited inside `examination_findings`
(`lib/cockpit/exam-findings.ts`). **No structured exam exists.**

### What's new

**P1 — `prescriptions.examination_json` (≈150, additive).** Mirrors the `complaints`
expansion (ST-D1):

```sql
ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS examination_json JSONB NOT NULL DEFAULT '[]'::jsonb;

-- examination_json[] element shape (validated app-side; JSONB stays flexible):
--   { systemId, status: 'normal'|'abnormal',  -- absent system = not examined
--     findings?: string[],  -- chip values when abnormal
--     notes? }
COMMENT ON COLUMN prescriptions.examination_json IS
  'PHI: structured system-wise physical examination. examination_findings text is derived from this on save (legacy rows pass through).';
```

RLS unchanged (migration 026 `auth.uid() = doctor_id` covers new columns); follows the 103
idempotency pattern.

**P2 — extended vitals columns** (additive `vitals_*`): RR, pain score, glucose, GCS, HC,
MUAC, waist, BP posture/limb. (Specified in the P2 batch plan when promoted.)

**P3 — `doctor_settings` config columns** (clones of the subjective P8–P10 columns):
`objective_section_order`, `objective_section_collapsed`, `objective_section_hidden`,
`objective_custom_sections`. Config, not PHI.

### `RxFormFields` additions (P1)

```ts
// frontend/components/cockpit/rx/RxFormContext.tsx
interface ExamSystemFinding {
  systemId: string;                  // 'general' | 'cvs' | 'resp' | 'abd' | 'cns' | <custom>
  status: "normal" | "abnormal";
  findings?: string[];               // abnormal chip values
  notes?: string;
}
// new on RxFormFields:
examFindings: ExamSystemFinding[];
```

New reducer actions mirror the medicine/complaint actions (`SET_EXAM_SYSTEM` /
`CLEAR_EXAM_SYSTEM` / `MARK_ALL_EXAM_NORMAL` — exact set finalised in obj-01).
`buildRxPayload` writes `examination_json` **and** derives `examination_findings`
(version-tagged text; legacy free-text rows pass through unchanged).

---

## Fast-entry strategy (the whole point)

| Field | Mechanism | Reuses |
|---|---|---|
| System status | tri-state toggle + one-tap WNL | new `ExamSystemCard` (clone `MedicineRow`/`ComplaintCard`) |
| Abnormal findings | type-aware chip palette | `DdxChipList` chip pattern + `exam-schema.ts` |
| Whole exam | "mark entire exam normal" macro | one action fills all 5 systems normal |
| Whole tab | carry-forward last visit exam | `CarryForwardButton` / `getLastPrescriptionInEpisode` (P-later) |
| Whole tab | objective presets + per-system templates | extend `doctor_rx_templates` scopes (P4) |
| Everything | autosave (no save button) | `useAutoSave` (1.5s) |
| Everything | free-text escape hatch | the kept general/systemic textareas (`OBJ-D7`) |

---

## Phases (the roadmap)

> Promotion is **one phase at a time** ([`PHASED-PLANS-GUIDE.md`](../../../process/PHASED-PLANS-GUIDE.md) §6): each phase freezes what the next inherits. Only **Phase 1** is promoted to dated task files today. P2–P6 are drafted here and promote as sibling `pN-` folders under the **same** program folder when their R-items are decided.

| Phase | Theme | Items | Schema | Status |
|---|---|---|---|---|
| **P1** | Structured system-wise exam cards + derived-text contract | `obj-01..04` | 1 migration (`examination_json`) | **Committed** 2026-06-18 → [`Daily-plans/.../objective-tab/p1-structured-exam/`](../../../Daily-plans/June%202026/18-06-2026/objective-tab/p1-structured-exam/) |
| **P2** | Vitals 2.0 (RR, pain, glucose, GCS, peds, units, range flags, MAP/BSA/percentiles, ghost values) | `obj-05..` | extended `vitals_*` columns | `Drafted` |
| **P3** | Reuse subjective layout engines (reorder · collapse · visibility/hidden · custom objective sections) + **modality/specialty default visibility** (OBJ-D6) | TBD | `doctor_settings` config columns (clones) | `Drafted` |
| **P4** | Exam templates + specialty packs (scoped `doctor_rx_templates`: `objective_full`, `vitals`, per-system, `custom_block`) | TBD | none (reuse template scopes) | `Drafted` |
| **P5** | Point-of-care results + media (split `test_results`; structured POC rows; report/ECG/wound attachments) | TBD | structured rows + storage | `Drafted` |
| **P6** | Trends (vital sparklines; BMI / pediatric growth charts) | TBD | reuse `episode_id` view (T5) | `Drafted` |

**Phase detail** for P2–P6 lives in the capture catalog
[`../../../capture/features/objective-tab/exam-catalog.md`](../../../capture/features/objective-tab/exam-catalog.md) §B/§D/§E/§F/§G/§B3 until each is promoted.

---

## What this program does NOT do (deferred)

| Item | Why / lands |
|---|---|
| Typed schema for every specialty system | `OBJ-D3` — long tail ships via templates + custom sections; typed only when demand proves it. |
| Removing legacy `vitalsText` / free-text exam | `OBJ-D7` — kept as escape hatch; sunset is a separate decision (backlog). |
| AI free-text parse of dictated exam | Same compliance gate as subjective subj-14 §4 (parked). |
| Mental state exam (psych) placement | Open question — Objective vs. Assessment; not in this program yet. |
| "Pending results" surfacing from the Plan pane | P5 open question; investigations *ordered* stay Plan-owned. |

---

## Plan rules

- **Status legend:** `Drafted` / `Committed` / `Shipped` / `Deferred` / `Killed`.
- **Item IDs / task prefix:** `obj`, numbered continuously across phases (P1 = `obj-01..04`).
- **Decision IDs:** prefix `OBJ-` to stay distinct from the subjective `ST-` and EHR `E` locks.
- **Promotion path:** when all of a phase's R-items have a `Decision:` ticked, this plan promotes that phase to a dated batch under `docs/Work/Daily-plans/<Month>/18-06-2026/objective-tab/p{N}-<slug>/plan-p{N}-objective-tab-<slug>-batch.md` and marks it `Committed`. **Later phases promote as sibling subfolders under the same `objective-tab/` plan folder** (created 18-06-2026), not under the later day's date.
- **Binding inheritance:** every phase inherits `OBJ-D1..OBJ-D7`. Especially binding: **OBJ-D2** (`examination_findings` derived — zero downstream change) and **OBJ-D3** (C3 hybrid scope).

---

## Reference

- **Subjective sibling** (the patterns this ports): [`../subjective-tab/plan-subjective-tab.md`](../subjective-tab/plan-subjective-tab.md) + [`../../../Daily-plans/June 2026/03-06-2026/subjective-tab/`](../../../Daily-plans/June%202026/03-06-2026/subjective-tab/).
- **Capture catalog** (full exam/vitals/specialty detail): [`../../../capture/features/objective-tab/exam-catalog.md`](../../../capture/features/objective-tab/exam-catalog.md) · [`backlog.md`](../../../capture/features/objective-tab/backlog.md).
- **Process:** [`PHASED-PLANS-GUIDE.md`](../../../process/PHASED-PLANS-GUIDE.md) · [`TASK_MANAGEMENT_GUIDE.md`](../../../process/TASK_MANAGEMENT_GUIDE.md).
- **EHR roadmap:** [`../README.md`](../README.md) · [`../plan-00-ehr-roadmap.md`](../plan-00-ehr-roadmap.md).

---

**Created:** 2026-06-18.  
**Owner:** TBD (picks at P1 commit).  
**Predecessor pattern:** Subjective-tab program (shipped) — engines reused, not re-derived.
