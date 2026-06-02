# Plan 00 — EHR roadmap (master index for tiers T1–T6)

## Make the prescription / EHR surface the part of Clariva doctors prefer over every other EHR they've used

> **Foundation reference:** [plan-f01-prescription-foundation-status.md](./plan-f01-prescription-foundation-status.md) — what the current `<PrescriptionForm>` + migrations 026 / 027 actually ship today, and what the gaps are. **This roadmap is everything that comes after** that V1 baseline.
>
> **Modality-agnostic:** every tier item ships once and surfaces from three mount surfaces simultaneously — appointment-detail (full), in-call quick-action panel (narrower; right column hidden), post-call summary (read-only) — without per-host branching. That's a hard invariant.
>
> **Cross-folder relationship:** the consult-channel roadmaps ([text-consult/](../text-consult/), [voice-consult/](../voice-consult/), [video-consult/](../video-consult/)) own the conversation; this folder owns the clinical artifact. T1's chart panel and T2's templates hang off the doctor surface in all three.

---

## Goal

Take `frontend/components/consultation/PrescriptionForm.tsx` from "7-stacked-textarea form that works" to **"doctor opens it, taps two chips, sends in 30 seconds, and the patient gets a properly branded PDF in their inbox"**.

The make-or-break framing:

> Every minute a doctor spends typing is a minute they can't spend with the patient. The best EHR is the one where the doctor types least and the chart is still complete.

EHRs don't fail because they're missing fields. They fail because filling the fields takes 7 minutes when it should take 60 seconds. So the bias of this roadmap is **fewer keystrokes per filled field**, not more fields.

---

## Decisions LOCKED 2026-05-03

These are scoping decisions agreed at roadmap creation. Tier plans MUST respect them; if any tier needs to revisit one, it has to surface that explicitly in its own decisions block.

| ID | Decision | Implication |
|----|----------|-------------|
| **E1** | **Generalist-first.** No specialty-specific fields in V1 (no growth charts, no body mapping, no OB-LMP/EDD, no ECG attach-and-interpret). | Schema stays generalist; specialty modules are a v2 line item, not a v1 tier. |
| **E2** | **Both desktop AND mobile must feel native.** Single responsive `<PrescriptionForm>` reused in three mount surfaces (appointment-detail full / in-call panel narrow / post-call read-only). | Layout is responsive Tailwind breakpoints + a `mode` prop. No separate mobile component. Templates → bottom-sheet on `<lg`, side-panel on `lg+`. |
| **E3** | **AI auto-draft DEFERRED to T6 (parked).** T1–T5 ship without any LLM calls. | The structured form must stand on its own. AI is the cherry; if T1–T5 are great, AI is a clear win later. If T1–T5 are mid, AI won't save them. |
| **E4** | **Generic / global market.** No India-NMC e-prescription format encoding, no US-DEA controlled-substance handling, no ABDM / FHIR export in V1. | Letterhead carries doctor regn # + signature string from existing `doctor_settings`, but nothing else regulator-specific. ICD-10 / SNOMED stay free-text in V1; revisit when billing/insurance arrives. |
| **E5** | **Auto-save by default everywhere.** No "Save draft" button anywhere in the v2 surface. 1.5s debounced PATCH after each edit. | T2.13 owns the implementation; every other tier inherits the contract — no tier may add a "Save" button. |
| **E6** | **Three-mount-surface invariant.** Same `<PrescriptionForm>` mounts in appointment-detail / in-call-panel / post-call-summary (read-only) without per-host branching. | Tier items that touch layout MUST verify all three surfaces. T6 (AI auto-draft) inherits this — the AI-fill action mounts in all three. |

---

## What's already shipped (so the tier plans don't re-propose it)

Pulled from `frontend/components/consultation/PrescriptionForm.tsx` (~580 lines), `MedicineRow.tsx`, `backend/migrations/026_prescriptions.sql`, `backend/migrations/027_prescription_attachments_bucket.sql`, and the e-task 1–7 series in `Daily-plans/March 2026/2026-03-27/` + `2026-03-28/`:

| Capability | Where | Notes |
|------------|-------|-------|
| Single-row Rx per appointment | migration 026 `prescriptions` | Columns: `cc / hopi / provisional_diagnosis / investigations / follow_up / patient_education / clinical_notes` (all free TEXT, all nullable). |
| Type discriminator (structured / photo / both) | `prescriptions.type` CHECK | Drives which sections of `<PrescriptionForm>` render. |
| Medicines list | migration 026 `prescription_medicines` | Free-text `medicine_name / dosage / route / frequency / duration / instructions` + `sort_order`. |
| Photo / PDF attachments | migration 026 `prescription_attachments` + migration 027 Storage bucket `prescription-attachments` | MIME allow-list: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. 10MB cap, 5 attachments per Rx. |
| Save draft / Save & send buttons | `<PrescriptionForm>` handlers | `saveDraft` / `handleSaveAndSend`. T2.13 will replace these with auto-save. |
| Send to patient via IG-DM + email | `sendPrescriptionToPatient` (backend) | Returns `{ sent, channels: { instagram, email } }`. T3 upgrades the payload to carry the PDF + secure link. |
| Doctor-only RLS | migration 026 §4 | All four CRUD policies key on `auth.uid() = doctor_id`. T1's three new tables MUST mirror this shape. |
| In-call mount in `<VideoRoom>` quick-actions | `InCallActionPanel.tsx` + `InCallQuickActions.tsx` | Doctor opens the Rx form during the call without losing the video tile. |
| `'rx_sent'` system banner in chat on send | `onSent` callback wired through `<VideoRoom>` → `consultation-quick-actions-service` | Posts a system message into the consultation chat when the doctor sends. |
| Previous Rx visible on appointment detail | e-task-6 (March 2026) | Inline read-only view of the most-recent Rx for this appointment. T1.6 extends this to "last 3 visits, expandable" inside the chart panel. |

**Anything outside this table is fair game for a tier below.** The tier plans assume this baseline and will not re-propose any of it.

---

## Tier overview

| Tier | Theme | Items | Effort (rough) | Schema work | AI dep? | Status |
|------|-------|-------|----------------|-------------|---------|--------|
| [T1 — Foundation](./plan-t1-ehr-foundation.md) | Patient chart context spine — allergies, chronic conditions, vitals tables; `<PatientChartPanel>` mounted alongside `<PrescriptionForm>`; previous-Rx inline expand. | 6 | ~3 days | 1 migration (3 tables) | No | `Drafted` |
| [T2 — Speed](./plan-t2-ehr-speed.md) | Drug-name autocomplete (`drug_master`); structured frequency / duration enums; per-doctor templates / favorites; copy-from-last-visit; auto-save replacing manual draft button. | 7 | ~4 days | 2 migrations | No | `Drafted` |
| [T3 — Output](./plan-t3-ehr-output.md) | Branded server-side PDF; storage bucket for PDFs; patient-facing Rx page (signed link); send-pipeline upgrade to carry PDF + link; "Patient view" preview before send. | 5 | ~3 days | None (Storage bucket only) | No | `Drafted` |
| [T4 — Safety](./plan-t4-ehr-safety.md) | Allergy clash banner during drug entry; drug-drug interaction warnings (seeded rules); pre-send soft guards (no diagnosis, empty Rx). | 4 | ~2 days | 1 migration (`drug_interactions`) | No | `Drafted` |
| [T5 — Vitals & trends](./plan-t5-ehr-vitals-trends.md) | `<VitalsCapture>` widget; trend sparklines for vitals with 3+ readings; `prescriptions.episode_id` linkage to existing `care_episodes`; problem-list view aggregating chronic conditions + recurring diagnoses + active episodes. | 4 | ~2 days | 1 column add + 1 view | No | `Drafted` |
| [T6 — AI assist](./plan-t6-ehr-ai-assist.md) | AI auto-draft from `consultation_messages` + `consultation_transcripts`; drug recommendation hints; allergy/condition extraction; patient-facing Rx explanation in plain language; ICD-10 coding assist (when ICD ships). | 5 | ~3 days | None | **Yes** | ⏸ **Deferred** (parked on V1 GA + AI budget approval per Decision E3) |

**Totals:** 31 items, ~17 dev-days, 5 small additive migrations + 1 column add + 1 view.

---

## Sequencing recommendation

```
Now              Next                After V1 GA
 │                │                       │
 ▼                ▼                       ▼
T1            T2 + T3 (parallel)      T4 → T5         (then) T6
(foundation)  T2: doctor-side love    T4: needs T1+T2  (deferred per E3)
              T3: patient-side trust  T5: vitals + episode linkage
```

Rationale:

- **T1 first** — every tier above this needs the chart-context tables. T4 needs `patient_allergies`. T5 needs `patient_vitals`. T2's "copy from last visit" needs the previous-Rx surface T1.6 builds out. There is no shipping order in which T1 isn't first.
- **T2 + T3 in parallel** — they're independent code paths and address two different stakeholders:
  - **T2 = doctor-side love** (autocomplete + templates + autosave). This is the retention lever — doctors come back because writing Rx is fast.
  - **T3 = patient-side trust** (branded PDF + signed link + delivery polish). This is the word-of-mouth lever — patients show their Rx to family / employer / pharmacy and Clariva looks professional.
  - Two devs can split T2 and T3 the day T1 lands. They share `<PrescriptionForm>` only at the top — internal sub-trees diverge.
- **T4 third** — needs T1's `patient_allergies` table for the clash banner AND T2's structured drug names (free-text "paracetomol" vs structured `paracetamol` autocomplete result is the difference between matching the allergen and missing it). Cheap once T1 + T2 ship.
- **T5 fourth** — vitals + trends are easy and high-value but not the bottleneck. Slot after T4 so safety guards exist before doctors start filling more.
- **T6 deferred** — wait for V1 GA usage data so we know which fields the AI should prioritize filling. The structured form must be production-validated before we layer AI on top.

---

## Cross-cutting principles (apply to every tier)

These flow from the LOCKED decisions above. Tier plans don't restate them; they reference this section.

1. **Auto-save by default (Decision E5).** No "Save draft" button anywhere in the post-T2 surface. Status indicator next to form title: `Saving…` (spinner) / `Saved 3s ago` (check) / `Save failed — retry` (red, retry button). T2.13 owns the implementation.
2. **Three-mount-surface invariant (Decision E6).** Every tier item that touches the form layout MUST verify it renders cleanly in all three: `appointment-detail` (full layout, three columns on `lg+`), `in-call-panel` (right column hidden, narrower center), `post-call-summary` (read-only — composer/edit affordances DOM-removed, watermark visible).
3. **Structured > free-text wherever choices are bounded.** Frequency, route, duration unit, severity → enums. Drug name, strength → autocomplete from `drug_master`. Diagnosis stays free-text in V1 (Decision E4 defers ICD-10).
4. **Every doctor-side speed feature has a mobile equivalent.** Templates → bottom-sheet picker on mobile, side-panel on desktop. Drug autocomplete → touch-friendly dropdown with 44px min hit target. Save-as-favorite → long-press a saved Rx on mobile, kebab-menu on desktop.
5. **Patient-facing artifacts must look professional from V1.** A blob of text in IG-DM erodes trust; a branded PDF builds it. T3 ships PDF before T4 / T5 ship safety / trends — trust > polish in early word-of-mouth.
6. **PHI hygiene in logs.** Diagnosis, medicine names, attachment filenames, vitals values never reach console / Sentry / analytics. Existing `consultation_messages` doctrine extends — only IDs, status, counts.
7. **RLS uses doctor-ownership (Decision E4 + existing migration 026).** All new tables follow the same shape: `doctor_id UUID NOT NULL REFERENCES auth.users(id)` + four CRUD policies keyed on `auth.uid() = doctor_id`. Patient-facing reads (T3.16 patient-view page) authenticate via HMAC tokens minted server-side, NOT via Supabase patient JWTs (no RLS branch needed for prescriptions today).

---

## Non-goals (explicitly NOT on the EHR roadmap)

- ICD-10 / SNOMED diagnosis coding (revisit when billing / insurance arrives)
- Lab order routing to external labs (revisit when partner labs sign on)
- Specialty modules — pediatric growth charts, derm body-mapping, OB LMP/EDD, ECG interpretation (V2 line; Decision E1 holds)
- Insurance pre-authorization flows
- Cryptographic e-signature with PKCS infrastructure (Decision E4 — letterhead carries a string, not a CMS-signed PDF)
- ABDM / NMC / FHIR R4 export (Decision E4)
- Multi-language doctor UI (separate plan; revisit at internationalization)
- Patient-portal login (read-only signed-link access in T3 is sufficient for V1)
- Drug-drug interaction across CHRONIC meds + NEW prescription (T4 covers within-Rx interactions only; chronic-vs-new is a T4-extension item if asked for)

---

## Open questions (asked of the owner before commit)

| # | Question | Default if unanswered |
|---|----------|----------------------|
| Q1 | Should the chart panel be COLLAPSIBLE on desktop (left rail can hide entirely) or always-visible? | Collapsible — saves screen space when doctor is mid-typing on a long Rx. |
| Q2 | Drug DB seed source? Open RxNorm / OpenFDA / Indian CDSCO? | Mixed — start with ~500 most-prescribed Indian generics + brand names hand-curated; switch to RxNorm import in T2 follow-up if quality issues appear. |
| Q3 | PDF generation runtime — Puppeteer (heavy, perfect HTML→PDF fidelity) or `@react-pdf/renderer` (light, declarative, no Chromium)? | `@react-pdf/renderer` — no Chromium dep, ships cleanly to Vercel/Render/serverless without a 200MB layer. |
| Q4 | Auto-save debounce window — 1s, 1.5s, 2s? | 1.5s — text-consult uses 1s for typing broadcast (different signal); 1.5s feels right for "I paused, save it". |
| Q5 | Allergy clash matching — substring or exact? | Substring on the canonical generic name from `drug_master` AND on the brand name. Doctor allergy free-text is also substring-matched (with normalization). |
| Q6 | Templates — per-doctor only, or sharable across the clinic? | Per-doctor in V1; clinic-wide sharing is a T2 follow-up. |
| Q7 | Vitals snapshot — one row per recording (history) or one row per patient updated each visit? | History (one row per recording). T1.1 schema already reflects this (`patient_vitals.recorded_at`). Trends only work with history. |

---

## Cross-folder symmetry table

How EHR work overlaps with the consult-channel roadmaps:

| Consult tier | EHR tier it pairs with | Why |
|---|---|---|
| video-consult / voice-consult **C6 (in-call quick actions)** | EHR T2 + T3 | Quick actions surface "Send Rx" — better Rx form (T2) and better delivery (T3) make C6 actually useful. |
| video-consult **D1 (post-call summary)** | EHR T1 + T5 | Post-call summary references vitals + chart context the doctor captured during the call. |
| text-consult **T3 (clinical workflow — DEFERRED on Plan 10)** | EHR T6 (also deferred) | Both deferred for the same reason: AI extraction is the gating dependency. When V1 GA stabilizes, both can advance together. |

---

## How to use this roadmap

If you're picking what to ship next:

1. Read `plan-f01` — confirm you understand what V1 already gives you.
2. Read this file (`plan-00`) end-to-end — at least the tier table + sequencing block + LOCKED decisions.
3. Open `plan-t1-ehr-foundation.md`. It's pre-approved and unblocked. Commit it.
4. After T1 ships, decide T2 vs T3 vs both based on team capacity. Both are ready.

If you want to argue with this roadmap:

- Add a discussion to the relevant tier plan, not to this file. This file is the rolled-up view; the tier plans are where item-level disagreements live.
- Decisions E1–E6 are LOCKED. To change one, raise it explicitly with the owner — don't sneak a change in via a tier plan PR.

---

**Created:** 2026-05-03.  
**Owner:** TBD.  
**Last reviewed:** 2026-05-03.
