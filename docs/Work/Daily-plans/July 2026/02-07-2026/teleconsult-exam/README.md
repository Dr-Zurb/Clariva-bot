# Teleconsult-aware examination — 02 Jul 2026 program

> **Why this exists.** The platform's primary use is **teleconsultation** (video / voice / text), not in-clinic visits. Vitals already carry measurement provenance that **defaults to teleconsult** (`measuredBy: patient`, `setting: home` — see `frontend/lib/cockpit/measurement-context.ts`), so the doctor can record home-device / self-reported values honestly. **Examination** has no such adaptation: all five system cards (General, CVS, Respiratory, Abdomen, CNS) present the full **IPPA** surface (Inspection · Palpation · Percussion · Auscultation) exactly as in clinic, even though **auscultation, palpation, and percussion cannot be performed over video**. This program makes the examination section **teleconsult-aware** without forking the data model.
>
> **Core stance (the "display, don't hide" decision).** In teleconsult we do **not** silently hide the un-performable parts — a note that omits them *looks* like a complete exam and is a medico-legal trap (India Telemedicine Practice Guidelines 2020 require documenting the assessment's limitations). Instead: **assessable** subsections (Inspection + video-observable signs) are foregrounded; **in-person-only** subsections (Auscultation / Palpation / Percussion) still render but **de-emphasised, collapsed, and tagged "In-person only"**, opt-in to expand if the doctor genuinely did a remote workaround (digital stethoscope, patient-assisted self-palpation). A visit-level caveat line is auto-added to the derived exam text.

---

## The one-sentence goal

> **When the appointment is a teleconsultation, the examination section reorders to show remotely-assessable findings first, renders the un-performable IPPA subsections greyed / collapsed / tagged "In-person only" (opt-in expandable, never auto-normal), scopes "Mark normal" to what was actually assessable, and appends a "physical examination limited — teleconsultation" caveat to the derived `examination_findings` — all as a view/derivation preset over the existing schema, with in-clinic output byte-identical to today.**

---

## Decision lock (freezes on promotion)

- **TC-D1 — View/preset, no migration, no data-contract change.** Teleconsult is a **render + derivation** adaptation over the existing exam schema. Findings entered during a teleconsult store exactly as today (flat `findings[]` / structured `ExamFindingEntry` rows). The limitation caveat is **derived, never stored**. No new table / column / migration. (Truest to the byte-parity architecture that `obj-30` and the SOAP-placement program preserved.)
- **TC-D2 — Per-subsection remote-feasibility flag.** Each rendered subsection carries `remote: "assessable" | "in_person_only"`. Inspection + video-observable signs = `assessable`; Auscultation / Palpation / Percussion = `in_person_only`. The flag is **UI/derivation guidance only** — obj-01 Zod does not enforce it, chip vocabulary is unchanged.
- **TC-D3 — Display, de-emphasised, opt-in (NOT hidden).** In teleconsult, `in_person_only` subsections render below the assessable ones, **greyed + collapsed + tagged "In-person only"**. Tapping expands them (opt-in); once a doctor records data there, the tag flips to **"Patient-assisted"** and the finding is stored normally. They are **never auto-expanded and never auto-marked normal**.
- **TC-D4 — "Mark normal" is scoped in teleconsult.** A system marked normal on a teleconsult asserts only the assessable scope and derives a **teleconsult-specific WNL line** (e.g. Respiratory → *"No respiratory distress on inspection"* instead of *"Bilateral air entry normal, no added sounds"*). In-clinic normal lines are unchanged.
- **TC-D5 — Auto limitation caveat in derivation.** On teleconsult, `examination_findings` gains a visit-level suffix: *"Assessment via teleconsultation; physical examination limited to inspection and patient-reported data."* In-clinic derivation is **byte-identical** to today (parity gate). The caveat is editable/removable once the doctor manually overrides the derived text (same escape hatch as every other derived field).
- **TC-D6 — Modality comes from `consultationType`, surfaced as first-class form state.** The exam layer must key off the appointment's `consultation_type`, **not** the vitals `measurementContext` (which the doctor edits per-vital). Today `consultationType` is loaded (`loadConsultationType`) and consumed only at **seed-time** for vitals defaults; this program surfaces it as a readable value on the RX form context.

---

## What this program does NOT do (deferred)

| Item | Why / where it lands |
|---|---|
| New table / column / migration | TC-D1 — view + derivation only. |
| Storing "not assessed remotely" as data | TC-D5 — the caveat is derived; absence still means absence. |
| Digital-stethoscope / device audio capture | Out of scope; the opt-in expand covers manual entry of any workaround finding. |
| New teleconsult-only exam systems (Derm / MSK ROM / ENT photo) | Genuinely strong remotely, but additive scope — a follow-up program, not this one. |
| Patient pre-visit vitals/photo intake | Separate workflow program (references the media plans under `soap-data-placement`). |
| Any change to in-clinic behaviour or output | Explicitly a parity gate (TC-D5). |

---

## Phase / batch

Single batch — [`plan-teleconsult-exam-batch.md`](./plan-teleconsult-exam-batch.md) · exec order [`Tasks/EXECUTION-ORDER-teleconsult-exam.md`](./Tasks/EXECUTION-ORDER-teleconsult-exam.md).

| Task | Title | Size | Model |
|---|---|---|---|
| `tc-01` | Remote-feasibility schema + `consultationType` surfaced as form state | S–M | Sonnet |
| `tc-02` | Teleconsult exam UI preset across the 5 system bodies (reorder + greyed/collapsed/tagged in-person-only + opt-in) | M–L | **Opus** (5+ files + new UX semantics) |
| `tc-03` | Scoped teleconsult normal line + auto limitation caveat in `examination_findings` derivation | M | **Opus** (touches locked derived-text contract) |
| `tc-04` | Close gate: in-clinic byte-parity + teleconsult behaviours + a11y + verification | S–M | Sonnet |

**Model note (agent contract):** `tc-02` trips the "5+ file refactor" rule and `tc-03` the derived-text-contract rule → both **Opus**. There is **no migration** in this program, so that particular escalation does not apply. ≤1 Opus per wave (they run in separate waves).

---

## Where it will be built (current code)

- **Exam bodies (render target):** `frontend/components/cockpit/rx/inputs/ExamCvsSystemBody.tsx`, `ExamRespSystemBody.tsx`, `ExamAbdSystemBody.tsx`, `ExamCnsSystemBody.tsx`, `ExamGeneralSystemBody.tsx` — all already render subsections through the shared `ExamSubsectionCollapsible.tsx` (the "In-person only" tag slots into its header).
- **Subsection schemas (flag home):** `frontend/lib/cockpit/cvs-exam-finding-schema.ts`, `resp-exam-finding-schema.ts`, `abd-exam-finding-schema.ts`, `cns-exam-finding-schema.ts`, `general-exam-finding-schema.ts`; plus `exam-schema.ts` for the generic fallback + WNL lines.
- **Derivation:** `frontend/lib/cockpit/exam-finding-utils.ts` + the exam-derivation path in `RxFormContext.tsx` (`deriveExaminationFindingsFromExam`).
- **Modality:** `consultationType` via `RxFormContext.tsx` / `useRxFormProviderSetup.ts` (`loadConsultationType`).
- **Provenance precedent (do not fork):** `frontend/lib/cockpit/measurement-context.ts` — teleconsult defaults already modelled here.

---

## Promotion note

If promoted to a formal program, register it under `docs/Work/Product plans/ehr/` (a `plan-teleconsult-exam.md`) alongside the objective-tab plan, and cross-link from `plan-objective-tab.md`. Until then this daily-plan batch is the source of truth.

---

**Created:** 2026-07-02. **Status:** Committed — not yet implemented. **Pattern:** view/derivation preset over the existing exam schema (mirrors `obj-30` flat-findings + `measurement-context` teleconsult defaults).
