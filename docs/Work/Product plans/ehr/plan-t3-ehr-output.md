# Plan T3 — EHR output (patient-side trust)

## Make every Rx the patient receives feel professional, brandable, and unmistakably "from a real doctor"

> **Read-order:** [README.md](./README.md) → [plan-f01](./plan-f01-prescription-foundation-status.md) → [plan-00](./plan-00-ehr-roadmap.md) → **plan-t3 (this file)**.
>
> **Status:** `Drafted` 2026-05-03. **Depends on:** none structurally; depends on T2 only for richer structured medicine data (PDF still works on free-text Rx, just less polished).
>
> **Effort:** ~3 dev-days for the 5 items.
>
> **Schema:** None. One new Storage bucket (`prescription-pdfs`).

---

## Why this tier matters for word-of-mouth

The patient's primary takeaway from the visit is the prescription. They:

- Show it to family ("Look, the doctor said it's just a viral fever").
- Show it to the pharmacy.
- File it for insurance / employer reimbursement.
- Re-read it later to remember dosing.

If we deliver this as plain text in IG-DM, every one of those moments is a missed marketing opportunity at best and an active trust-erosion at worst. A pharmacy taking a screenshot of an IG-DM is a credibility problem.

If we deliver it as a branded PDF on a doctor's letterhead — with their name, registration number, signature, and the patient's structured chart info — every one of those moments is a free billboard for both the doctor and Clariva.

T3 is the trust signal. T2 is what makes doctors love it; T3 is what makes patients keep coming back.

---

## Decisions LOCKED 2026-05-03

| ID | Decision | Implication |
|----|----------|-------------|
| **T3-D1** | **PDF runtime: `@react-pdf/renderer`.** Per Q3 in plan-00. | No Chromium dep; ships cleanly on Vercel/Render serverless. Layout is declarative React; designer can iterate without backend redeploy. |
| **T3-D2** | **PDFs stored in a new bucket `prescription-pdfs`, private with signed-URL access.** Distinct from the existing `prescription-attachments` bucket (which holds doctor-uploaded scans). | Generated PDFs need a different lifecycle — regenerable from data, longer retention, easier audit. |
| **T3-D3** | **Patient-facing route uses HMAC-signed tokens, NOT Supabase patient JWTs.** Same pattern as `/c/text/:sessionId?t=...`. | No RLS branch needed for `prescriptions` (Decision E4 in plan-00). Token is short-lived (24h on creation; refreshable from the IG-DM / email "Open Rx" link). |
| **T3-D4** | **Letterhead pulls from existing `doctor_settings`** (existing fields: full name, registration #, signature string, clinic name, address, logo URL). | T3 doesn't add doctor profile fields. If a field is missing, fall back gracefully (e.g. no logo → text-only header). |
| **T3-D5** | **Send pipeline upgrade is ADDITIVE.** Existing IG-DM / email payloads still work; PDFs are extra attachments + a "View online" link added to the body. | Backward-compatible. Old clients don't break; new clients get the upgrade. |

---

## Items

### T3.15 — PDF generation service (`prescription-pdf-service.ts`)

**Status:** `Drafted`. **Effort:** 1 day. **Files to create:**

- `backend/src/services/prescription-pdf-service.ts`.
- `backend/src/templates/prescription-pdf/PrescriptionDocument.tsx` (React component for `@react-pdf/renderer`).
- `backend/src/templates/prescription-pdf/Header.tsx`, `Footer.tsx`, `MedicineTable.tsx` (sub-components).
- `backend/migrations/0XX_prescription_pdfs_bucket.sql` (Storage bucket only; no DB table).

**Spec.** A single function:

```ts
export async function generatePrescriptionPdf(prescriptionId: string): Promise<{
  storagePath: string;       // 'prescription-pdfs/<doctor_id>/<prescription_id>.pdf'
  signedUrl: string;          // 24h-TTL signed URL
  generatedAt: Date;
  byteCount: number;
}> {
  // 1. Load prescription with relations (medicines, attachments, doctor_settings, patient).
  // 2. Render <PrescriptionDocument> via @react-pdf/renderer to a Buffer.
  // 3. Upload to bucket at `<doctor_id>/<prescription_id>.pdf` (overwrites if exists — regenerable).
  // 4. Mint a 24h signed URL.
  // 5. Return.
}
```

**Layout (one A4 page; flow to multiple pages if needed):**

```
┌──────────────────────────────────────────────────────────┐
│  [Logo]   Dr. Full Name, MBBS, MD                        │
│           Reg #: 12345                                    │
│           Clinic Name · Clinic Address                    │
│  ─────────────────────────────────────────────────────   │
│  Patient: <name>                       Date: 2026-05-03   │
│  Age/Sex: 34 / M                       Visit: Follow-up    │
│  ─────────────────────────────────────────────────────   │
│  Chief complaint                                          │
│   <cc text>                                               │
│                                                           │
│  History of present illness                               │
│   <hopi text>                                             │
│                                                           │
│  Diagnosis                                                │
│   <provisional_diagnosis text>                            │
│                                                           │
│  ┃ ℞                                                       │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ # │ Medicine        │ Dose   │ Route│ Freq    │ Dur │ │
│  │ 1 │ Paracetamol     │ 500mg  │ Oral │ TID     │ 5 d │ │
│  │ 2 │ Cetirizine      │ 10mg   │ Oral │ QHS     │ 3 d │ │
│  └─────────────────────────────────────────────────────┘ │
│   Instructions: After meals; complete the course.         │
│                                                           │
│  Investigations                                           │
│   <investigations text>                                   │
│                                                           │
│  Follow-up                                                │
│   <follow_up text>                                        │
│                                                           │
│  Patient education                                        │
│   <patient_education text>                                │
│                                                           │
│  ─────────────────────────────────────────────────────   │
│  [Signature image / typed name]                           │
│  Dr. Full Name — Reg #: 12345                              │
│                                                           │
│  Issued via Clariva · clariva.health/r/<short-id>          │
│  Generated 2026-05-03 16:42 IST                            │
└──────────────────────────────────────────────────────────┘
```

**Storage bucket migration:**

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('prescription-pdfs', 'prescription-pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: doctor can read their own; service-role bypass for write.
CREATE POLICY "doctors read own rx pdfs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'prescription-pdfs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
-- (no insert/update/delete from authenticated; backend always uses service role)
```

**Acceptance.**

- `generatePrescriptionPdf(prescriptionId)` produces a valid PDF stored under `prescription-pdfs/<doctor_id>/<prescription_id>.pdf`.
- PDF renders correctly with sample data (headers, footer, structured medicine table, all SOAP sections present).
- Multi-page Rx (8+ medicines) flows correctly across pages with header/footer repeated.
- Doctor without logo gets a text-only header (no broken image).
- File size < 200 KB for a typical Rx.
- Generation time < 1.5s p95.

---

### T3.16 — Patient-facing Rx page (`/r/[id]?t=hmac`)

**Status:** `Drafted`. **Effort:** 0.75 day. **Files to create:**

- `frontend/app/r/[id]/page.tsx` — public route (no auth required; HMAC token in querystring).
- `backend/src/controllers/public-prescription-controller.ts` — `GET /api/v1/public/prescriptions/:id?t=hmac` returns the Rx + signed URLs for PDF + attachments.
- `backend/src/services/prescription-token-service.ts` — `mintRxToken(prescriptionId, ttlSeconds)` and `verifyRxToken(token, prescriptionId)`. HMAC-SHA256 with `RX_SHARE_TOKEN_SECRET` env var.

**Spec.** Standalone, mobile-first page:

```
┌───────────────────────────────────────┐
│  ← Clariva                             │
│                                        │
│  Prescription                          │
│  Issued by Dr. <name> on <date>        │
│                                        │
│  [📄 Download PDF (240 KB)]            │
│                                        │
│  ─────────────────────────────────    │
│  Diagnosis                             │
│  <provisional_diagnosis>               │
│                                        │
│  Medicines                             │
│  ┌────────────────────────────────┐   │
│  │ Paracetamol 500mg              │   │
│  │ Take 1 tablet, oral, TID, 5 d  │   │
│  │ Notes: After meals             │   │
│  └────────────────────────────────┘   │
│  ┌────────────────────────────────┐   │
│  │ Cetirizine 10mg                │   │
│  │ Take 1 tablet, oral, QHS, 3 d  │   │
│  └────────────────────────────────┘   │
│                                        │
│  Instructions                          │
│  <patient_education>                   │
│                                        │
│  Follow-up                             │
│  <follow_up>                           │
│                                        │
│  ─────────────────────────────────    │
│  Need to talk to Dr. <name>?           │
│  [Open chat]   [Book appointment]      │
└───────────────────────────────────────┘
```

- Token verification on mount; on failure show "Link expired — request a new link" with a contact CTA.
- Download PDF button mints a fresh signed URL on click (avoids serving an expired link if the patient revisits).
- `Open chat` deep-links to the post-consult text channel (ties into text-consult Plan 07 history surface).
- `Book appointment` deep-links to the doctor's booking page.

**Acceptance.**

- Page loads without auth.
- Expired or invalid tokens show a friendly error.
- PDF downloads correctly on mobile and desktop.
- Page is screenshot-friendly (the patient screenshotting this for their pharmacy still looks great).
- No PHI of OTHER patients leaks (token verifies `prescription_id` matches the one in the URL).

---

### T3.17 — Send-pipeline upgrade (PDF + signed link in IG-DM + email)

**Status:** `Drafted`. **Effort:** 0.5 day. **Files to touch:**

- `backend/src/services/notification-service.ts` — `sendPrescriptionToPatient`:
  - Generate PDF via T3.15 (or load latest if already generated within 5 min).
  - Mint Rx share token via T3.16's service (24h TTL).
  - Email payload: existing structured body + PDF attachment + "View online: clariva.health/r/<id>?t=<token>".
  - IG-DM payload: short text ("Your prescription from Dr. <name> is ready 📄 View: <link>") + the PDF attached as a media message (Instagram Graph API supports `message.attachment.payload.url` for files).
- `backend/src/utils/dm-copy.ts` — `buildPrescriptionReadyDm` already exists for text-consult. Verify / extend it to take the share link + PDF URL.

**Spec.**

```ts
export async function sendPrescriptionToPatient(prescriptionId: string): Promise<{
  sent: boolean;
  channels: { instagram?: boolean; email?: boolean };
  pdfStoragePath: string;
  publicLink: string;          // clariva.health/r/<id>?t=<token>
  reason?: string;
}> {
  // 1. generatePrescriptionPdf(prescriptionId) → storagePath
  // 2. mintRxToken(prescriptionId, 24*3600) → token
  // 3. buildPrescriptionReadyDm(...) for IG body
  // 4. Send IG (with PDF media attachment if patient has IG conversation_id)
  // 5. Send email (with PDF attachment + body link)
  // 6. Return aggregated result.
}
```

**Acceptance.**

- Patient gets email with PDF attached + link in body.
- Patient gets IG-DM with PDF attached + link in body (when IG channel is available).
- Existing legacy "send" flow remains backwards-compatible (text-only fallback if PDF generation fails — log error, do not block the send).
- Failure of one channel doesn't fail the other.
- T3.15 PDF generation gets cached for 5 min to avoid regen on rapid resends.

---

### T3.18 — "Patient view" preview before send

**Status:** `Drafted`. **Effort:** 0.5 day. **Files to create / touch:**

- `frontend/components/consultation/PrescriptionPatientPreview.tsx` (new) — renders the same React tree as the patient-facing page (T3.16) but inline, with the form data, no token required.
- `frontend/components/consultation/PrescriptionForm.tsx` — add a "Preview as patient" button next to "Send to patient" that opens a modal showing the preview.

**Spec.** Doctor clicks "Preview as patient" → modal opens → renders the patient view with the current form snapshot (auto-saved or unsaved — preview reads from form state, not the database). Doctor can scroll through, see exactly what the patient will receive, then close + edit + send.

```tsx
// PrescriptionPatientPreview.tsx — same React tree as /r/[id]/page.tsx
//   but takes form snapshot as a prop and renders without any data fetch.
//   Reuse <PatientRxView> shared between this component and the public route.
```

**Acceptance.**

- Preview matches the actual patient view byte-for-byte (use same `<PatientRxView>` component).
- Preview reflects unsaved form edits (doctor can iterate without sending).
- Modal closes cleanly; doesn't lose form state.
- Available in all three mount surfaces (appointment-detail, in-call, post-call read-only — though in read-only the "Send" button is hidden; preview still useful for verifying what was sent).

---

### T3.19 — "Resend" + "Regenerate PDF" actions on past prescriptions

**Status:** `Drafted`. **Effort:** 0.25 day. **Files to touch:**

- `frontend/app/dashboard/appointments/[id]/page.tsx` — on previously-sent Rx, show a kebab menu with:
  - **Resend to patient** → calls `sendPrescriptionToPatient` again. Confirmation modal.
  - **Regenerate PDF** → forces fresh PDF generation (e.g. after `doctor_settings` letterhead changes). Confirmation modal.
  - **Copy share link** → mints a fresh 24h token + copies the URL to clipboard.
- `backend/src/controllers/prescription-controller.ts` — corresponding endpoints (or reuse `sendPrescriptionToPatient` with a `force_regenerate: true` flag).

**Spec.** All three actions are idempotent — calling them N times produces N+1 fresh tokens but doesn't duplicate the Rx record. Resend re-fires both channels; "Copy share link" doesn't fire any channel (silent share).

**Acceptance.**

- All three actions visible in the menu on past Rx.
- Resend triggers a fresh delivery; banner / toast confirms.
- "Copy share link" puts a working URL in the clipboard.
- "Regenerate PDF" produces a new PDF reflecting current `doctor_settings`.

---

## Out of scope for T3

- Patient-portal login (sign in to view all past Rx) — not in V1; signed-link access is sufficient.
- Push notifications when patient opens the link — telemetry could surface this later, not on T3.
- Multi-language PDF — Decision E4 defers internationalization.
- E-signature with PKCS / DSC / Aadhaar eSign infrastructure — Decision E4 (V1 carries a typed-name + image).
- Pharmacy fulfillment routing — separate roadmap.
- Patient marking "Picked up at pharmacy" / "Started medication" — not on EHR roadmap.
- Print-friendly Rx (the PDF IS the print artifact; no separate print stylesheet needed).
- IG Story / WhatsApp delivery channels (only IG-DM + email in V1; channel additions are operationally heavier than they look).

---

## Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| `@react-pdf/renderer` layout breaks for very long medicine lists or huge text fields | Multi-page flow tested explicitly. Text fields have CSS `wordBreak: break-word` and a max-height per section that flows. |
| Doctor's `doctor_settings` is incomplete (no logo, no signature) | Graceful degradation — text-only header, typed signature line. T3 does NOT block sending on missing letterhead fields. |
| Patient's IG conversation expired (24-hour rule) so IG-DM fails | Email is the primary trust channel; IG is convenience. Failure to send IG silently logs + continues with email. |
| Signed URLs leak via screenshots | URLs are 24h TTL by design. Patient regenerating the link from the email/DM works (the body has the share link, which mints a fresh download URL on click). |
| PDF generation latency spikes during heavy usage (synchronous on send) | Cache the PDF for 5 min after generation. If load grows, move PDF gen to a queue (BullMQ or pg_boss); SLO target is <3s end-to-end on send. |
| Copy of share link reveals to anyone who has the URL | Acceptable for V1 — the link ALREADY went over IG-DM / email which are not perfectly secure either. Token TTL caps exposure. Future: add a "revoke this link" action on Rx. |

---

## Sequencing inside T3

```
T3.15 (PDF gen + bucket)
  └→ T3.16 (patient page + token service)
       └→ T3.17 (send pipeline upgrade)
            ├→ T3.18 (preview as patient)         ← parallel
            └→ T3.19 (resend / regenerate)
```

T3.18 (preview) is the smallest and most user-visible; consider shipping it second after T3.15 so doctors get a sense of "what the patient sees" even before the full delivery upgrade lands.

---

**Created:** 2026-05-03. **Status:** `Drafted`. **Owner:** TBD.
