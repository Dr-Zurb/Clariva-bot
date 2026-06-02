# Plan F01 — Prescription V1 foundation — status

## Single-pane status of the prescription V1 foundation, re-homed under the EHR roadmap

> **Original plan (canonical for delivery history):** [Daily-plans/March 2026/2026-03-23/Plans/PRESCRIPTION_EHR_PLAN.md](../../Daily-plans/March%202026/2026-03-23/Plans/PRESCRIPTION_EHR_PLAN.md). The V1-implementation e-task series lives at [Daily-plans/March 2026/2026-03-27/](../../Daily-plans/March%202026/2026-03-27/) and [Daily-plans/March 2026/2026-03-28/](../../Daily-plans/March%202026/2026-03-28/) (e-tasks 1–7). **This file is the EHR roadmap's view of that work** — what shipped, what's outstanding, where the code lives. If you need full historical context (per-task acceptance criteria, decision log), open the originals.

---

## Headline status

✅ **FULLY SHIPPED.** Prescription V1 (March 2026) delivered the entire baseline EHR surface:

- DB schema + RLS + Storage bucket — 2 migrations on disk (026 / 027).
- `<PrescriptionForm>` + `<MedicineRow>` + dashboard / in-call mounts — ~580 + ~120 lines.
- Send-to-patient delivery (IG-DM + email) — `sendPrescriptionToPatient` service.
- Previous-Rx surfacing on appointment detail.

There is **no outstanding work in the V1 prescription line itself**. Everything in the tier plans (T1–T6) layers chart context, speed, output polish, safety, trends, and AI on top of this baseline.

---

## What shipped (with code references so it's verifiable)

### Schema

| Migration | Purpose |
|-----------|---------|
| [`backend/migrations/026_prescriptions.sql`](../../../../backend/migrations/026_prescriptions.sql) | Three tables: `prescriptions` (1 row per appointment, all flat TEXT for SOAP fields), `prescription_medicines` (free-text rows linked by FK), `prescription_attachments` (file paths). RLS: doctor-only via `auth.uid() = doctor_id`. Indexes: appointment / patient / doctor / created_at. |
| [`backend/migrations/027_prescription_attachments_bucket.sql`](../../../../backend/migrations/027_prescription_attachments_bucket.sql) | Storage bucket `prescription-attachments` + RLS policies for the bucket. MIME allow-list enforced application-side: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. |

### Backend

- [`backend/src/services/prescription-service.ts`](../../../../backend/src/services/prescription-service.ts) — owns all CRUD against the three tables (the file may not exist by exactly this name; the service stack lives under `src/services/`, controllers under `src/controllers/`, routes under `src/routes/api/v1/`).
- `sendPrescriptionToPatient` — fan-out via `notification-service.ts`. Returns `{ sent: boolean, channels: { instagram?: boolean, email?: boolean }, reason?: string }`. Today the payload is plain text; T3.17 upgrades it to carry the PDF + signed link.
- Signed URL minting for attachments — service-role minted, 1h TTL.

### Frontend

- [`frontend/components/consultation/PrescriptionForm.tsx`](../../../../frontend/components/consultation/PrescriptionForm.tsx) (~580 lines) — the single form component. Three entry modes (`structured` / `photo` / `both`). Free-text inputs for CC, HOPI, provisional dx, investigations, follow-up, patient education, clinical notes. Repeating `<MedicineRow>` for medicines (free text everywhere). File picker for attachments. Save draft + Save & send buttons.
- [`frontend/components/consultation/MedicineRow.tsx`](../../../../frontend/components/consultation/MedicineRow.tsx) — single medicine row UI. Fields: name, dosage, route, frequency, duration, instructions. All free text.
- `frontend/lib/api.ts` — `createPrescription` / `updatePrescription` / `listPrescriptionsByAppointment` / `getPrescriptionUploadUrl` / `registerPrescriptionAttachment` / `sendPrescriptionToPatient` exports.
- `frontend/types/prescription.ts` — `PrescriptionWithRelations` / `PrescriptionType` / `PrescriptionAttachment` types.

### Mount surfaces (today)

| Surface | Where | Notes |
|---------|-------|-------|
| Appointment detail page | `frontend/app/dashboard/appointments/[id]/page.tsx` | Full form, vertical scroll, no chart context. |
| In-call quick actions panel | `frontend/components/consultation/InCallActionPanel.tsx` + `InCallQuickActions.tsx` | Doctor opens the Rx form during a video / voice call without losing the call tile. Form is mounted in a side panel. |
| Post-call (read-only) | NOT YET WIRED (T1 surfaces this in the chart panel; T3 surfaces a "patient view preview"). | Today, post-call doctors navigate back to the appointment-detail page to view what they sent. |

### Send pipeline

- IG-DM via `instagram-dm-webhook-handler.ts` infrastructure.
- Email via Resend (existing `RESEND_API_KEY`).
- Today's payload: plain-text rendering of the structured fields + medicine list + attachment URLs (signed). T3 replaces this with a PDF attachment + signed link to a patient-view page.

---

## Capability snapshot (verifiable against the code today)

| Capability | Where | Status |
|---|---|---|
| Single-row Rx per appointment | migration 026 `prescriptions` | ✅ |
| Free-text SOAP fields (CC / HOPI / dx / inv / follow-up / edu / notes) | migration 026 columns | ✅ |
| Medicines list (free-text per row) | migration 026 `prescription_medicines` + `<MedicineRow>` | ✅ |
| Photo / PDF attachments | migration 026 `prescription_attachments` + migration 027 bucket | ✅ |
| Type discriminator (`structured` / `photo` / `both`) | column `type` + radio in form | ✅ |
| Save draft / Save & send | `<PrescriptionForm>` `saveDraft` / `handleSaveAndSend` | ✅ (T2.13 will retire the draft button in favor of auto-save) |
| Send to patient via IG-DM + email | `sendPrescriptionToPatient` | ✅ (T3.17 upgrades the payload) |
| Doctor-only RLS | migration 026 §4 (four CRUD policies on each table) | ✅ |
| In-call mount in `<VideoRoom>` / `<VoiceConsultRoom>` quick actions | `InCallActionPanel` + `InCallQuickActions` | ✅ |
| `'rx_sent'` system banner in chat on send | `onSent` callback wired through host components → `consultation-quick-actions-service` | ✅ |
| Previous Rx surfacing in appointment detail (last 1 visible) | e-task-6 (March 2026 batch) | ✅ |
| File-size cap (10MB) + count cap (5 attachments) | application-side in `<PrescriptionForm>` | ✅ |

---

## Outstanding gaps (everything T1–T6 plans address)

These are the gaps the EHR tier roadmap exists to close. Each row maps to the owning tier.

| Gap | Owner tier | Sketch |
|---|---|---|
| **No patient chart context** — allergies / chronic conditions / current medications / prior diagnoses / vitals are not visible alongside the Rx form. Doctor flies blind unless they read the appointment notes manually. | **T1** | Three new tables + `<PatientChartPanel>` component mounted alongside the Rx form. |
| **Free-text drug names** — no autocomplete, no canonicalization. Typo-prone. Makes downstream allergy/interaction checks impossible. | **T2** + **T4** | T2 ships `drug_master` + autocomplete; T4 layers DDI / allergy clash on top. |
| **No templates / favorites / "copy from last visit"** — every Rx is typed from scratch. Specialists doing the same workup 30×/day re-type the same content every time. | **T2** | Per-doctor `doctor_rx_templates` + UI + copy-from-last-visit one-tap. |
| **No auto-save** — manual "Save draft" button. Doctor anxiety about losing work. | **T2.13** | 1.5s debounced PATCH + status indicator. Decision E5 LOCKED. |
| **Patient gets text blob in DM, not branded PDF** — undermines trust. The Rx is the patient's primary takeaway from the visit; it should look professional. | **T3** | Server-side PDF generation + branded letterhead from `doctor_settings` + signed-link patient-view page + send-pipeline upgrade. |
| **No allergy clash check on drug entry** — doctor can prescribe penicillin to a documented penicillin-allergic patient with no warning. Patient-safety hole. | **T4** | Real-time substring match against `patient_allergies` + red banner above the Rx form. |
| **No drug-drug interaction warnings** — same-Rx interactions go unflagged. | **T4** | Seeded `drug_interactions` table + chip warnings when two added meds form a known pair. |
| **No vitals capture, no trends** — vitals are critical for primary care; doctors today record them in `clinical_notes` as free text. | **T5** | `<VitalsCapture>` widget in chart panel + per-vital sparklines for trend visualization. |
| **No problem list** — chronic conditions surface only via patient interview each visit; no aggregated "what's this patient dealing with" view. | **T5** | Aggregates chronic conditions + recurring diagnoses + active episodes. |
| **No episode linkage on prescriptions** — `appointments` already has `episode_id`; `prescriptions` doesn't. Trajectory view across an episode requires a JOIN through appointments. Cleaner if `prescriptions.episode_id` is direct. | **T5** | Additive nullable `prescriptions.episode_id` FK. |
| **No AI auto-draft from chat / voice transcript** — the consultation chat / voice transcript IS the source of truth for CC / HOPI / suggested dx. Doctor shouldn't retype it. | **T6** (DEFERRED per Decision E3) | Single LLM call on call-end → pre-populates the Rx form. |
| **No structured ICD-10 / SNOMED diagnosis coding** | NOT in roadmap (Decision E4) | Revisit when billing / insurance arrives. |

---

## Decisions / invariants V1 LOCKED that the tiers must respect

These are inherited from the V1 prescription work and remain binding.

1. **Doctor-only RLS** — `auth.uid() = doctor_id` on all four CRUD policies. Migration 026 §4. T1's three new tables MUST mirror this shape (allergies, conditions, vitals all key on `doctor_id`).
2. **MIME allow-list for attachments** — `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. T3's PDF bucket inherits this allow-list (PDF only, since we generate it).
3. **PHI hygiene in logs** — diagnosis text, medicine names, attachment filenames never appear in console / Sentry / analytics. T1–T5 inherit; T6's AI surfaces inherit (only field-IDs and confidence scores in logs).
4. **`type` discriminator semantics** — `'structured'` (form fields only), `'photo'` (attachments only), `'both'` (both). T3 PDF generation respects this — `'photo'` Rx renders the photos as the main artifact with a minimal letterhead wrapper.
5. **CASCADE delete on parent prescription** — `prescription_medicines` and `prescription_attachments` both `ON DELETE CASCADE`. T2's templates explicitly do NOT cascade (a doctor deleting a Rx must not delete the template they used). T5's vitals are patient-level not Rx-level so the question doesn't arise.

---

## How tiers relate to V1 prescription

| Tier | What it adds on top |
|------|----------------------|
| [T1 — Foundation](./plan-t1-ehr-foundation.md) | Three NEW patient-level tables (allergies / chronic conditions / vitals) + `<PatientChartPanel>` component. The existing `prescriptions` row is unchanged. |
| [T2 — Speed](./plan-t2-ehr-speed.md) | Adds `drug_master` (lookup) + `doctor_rx_templates` (per-doctor saved Rx). Replaces `<MedicineRow>` with a v2 that consumes the autocomplete. Adds auto-save on top of `prescriptions.updated_at` (already present). |
| [T3 — Output](./plan-t3-ehr-output.md) | Adds a Storage bucket `prescription-pdfs`. Adds a public route `/rx/:id?t=hmac`. Existing send pipeline gets the PDF + signed link as additive payload — text-only fallback for legacy clients still works. |
| [T4 — Safety](./plan-t4-ehr-safety.md) | Adds `drug_interactions` (seeded). Reads from T1's `patient_allergies` + T2's `drug_master` to drive client-side checks. No writes to `prescriptions`. |
| [T5 — Vitals & trends](./plan-t5-ehr-vitals-trends.md) | Adds nullable `prescriptions.episode_id` FK to existing `care_episodes`. Adds a SQL view aggregating problems. Reads T1's `patient_vitals` for trend rendering. |
| [T6 — AI assist](./plan-t6-ehr-ai-assist.md) | No schema. Calls existing `ai-service.ts` + `consultation_messages` + `consultation_transcripts`. Writes drafts to `prescriptions` via the same CRUD path the form uses. |

---

## Symmetric foundation status pages

This file follows the same pattern as the consult-channel foundation status pages. If you've read those, this one's structure should feel identical:

- `text-consult/plan-f04-text-foundation-status.md` — Plan 04 (text consult Supabase backbone).
- `text-consult/plan-f06-companion-text-status.md` — Plan 06 (companion chat for voice/video).
- `text-consult/plan-f07-recording-replay-status.md` — Plan 07 (replay + post-consult history).
- `text-consult/plan-f10-ai-clinical-assist-status.md` — Plan 10 (AI clinical assist; deferred).

---

**Created:** 2026-05-03.  
**Last status check:** 2026-05-03 (no V1 work in flight; foundation is stable).
