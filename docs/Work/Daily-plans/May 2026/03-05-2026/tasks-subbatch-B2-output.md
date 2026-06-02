# Sub-batch B2 — Output (T3) — execution checklist

## Patient-side trust: branded PDF + patient-facing page + send-pipeline upgrade

> **Source plan:** [plan-t3-ehr-output.md](../../../Product%20plans/ehr/plan-t3-ehr-output.md).
>
> **Master batch:** [plan-ehr-implementation-batch.md](./plan-ehr-implementation-batch.md).
>
> **Status:** `Drafted` — start AFTER Sub-batch A merges. Runs in parallel with Sub-batch B1 (different files; same `<PrescriptionForm>` only at the top).
>
> **Effort:** ~3 dev-days. **Items:** 5. **Migrations:** 0 (one Storage bucket only).
>
> **Hard prerequisite:** Sub-batch A complete. Soft dependency on B1 — PDF / patient page render structured medicine fields more cleanly when B1's structured columns exist, but legacy free-text rows still render correctly.
>
> **Dev DB (Storage):** `092_prescription_pdfs_bucket.sql` applied Supabase dev **2026-05-04**.

---

## Pre-batch checklist

- [ ] Sub-batch A merged + post-batch validation green.
- [ ] Decisions 13–18 in [§ Cross-cutting decisions / Before Sub-batch B2 starts](./plan-ehr-implementation-batch.md#before-sub-batch-b2-starts) of the master batch confirmed.
- [ ] Generate `RX_SHARE_TOKEN_SECRET` for **all 3 environments** (dev / staging / prod) using `openssl rand -hex 32`. Add to `.env` files. Confirm with ops before merging Task 3 (the patient page won't work without this).
- [ ] Confirm `@react-pdf/renderer` install size on the deployment target. On Vercel/Render serverless, it's typically ~150KB gz extra to the function bundle. If size budget is tight, check whether deployment can tolerate it BEFORE starting Task 1.
- [ ] Review existing `doctor_settings` schema — confirm fields `full_name`, `registration_number`, `signature_string` (or similar), `clinic_name`, `clinic_address`, `logo_url` are present. If a field is missing, file a follow-up; PDF gracefully degrades but T3.15 specs the fallbacks.
- [ ] Verify `notification-service.ts` IG-DM path supports media attachments (Instagram Graph API `attachment.payload.url`). If not, T3.17 plan needs to add a `prescription-pdfs` public-temp signed URL flow.

---

## Task 1 — PDF generation service + bucket migration (T3.15)

**Effort:** 1 day · **Source:** [T3 §T3.15](../../../Product%20plans/ehr/plan-t3-ehr-output.md)

### Steps

1. Add `@react-pdf/renderer` to `backend/package.json`. Run `npm install` and check the bundle size impact on the build pipeline.
2. Create `backend/migrations/0XX_prescription_pdfs_bucket.sql` per source-plan §T3.15 SQL block. Bucket `prescription-pdfs`, private, RLS on `storage.objects` allowing doctors to read their own folder.
3. Create `backend/src/templates/prescription-pdf/PrescriptionDocument.tsx` — root React component using `@react-pdf/renderer`'s `<Document>` + `<Page>` primitives.
4. Create sub-components in `backend/src/templates/prescription-pdf/`:
   - `Header.tsx` — logo (with text-only fallback) + doctor name + reg # + clinic name + address.
   - `Footer.tsx` — signature line + Clariva attribution + share-link short id + generated-at timestamp.
   - `MedicineTable.tsx` — table rendering medicines from structured columns when available, else free-text. Reuse the display helpers from B1 / T2.10 (`medicine-display.ts`) when available; copy minimal versions to backend if cross-package import is hard.
   - `SectionBlock.tsx` — labeled wrapper for CC / HOPI / Dx / Investigations / Follow-up / Patient education sections.
5. Create `backend/src/services/prescription-pdf-service.ts` with `generatePrescriptionPdf(prescriptionId)` per source-plan signature:
   - Loads prescription with relations (medicines, attachments, doctor_settings, patient).
   - Renders `<PrescriptionDocument>` to a Buffer via `@react-pdf/renderer`'s `renderToBuffer`.
   - Uploads to `prescription-pdfs/<doctor_id>/<prescription_id>.pdf` via the Supabase service-role client (overwrites if exists — regenerable per Decision T3-D2).
   - Mints a 24h-TTL signed URL.
   - Returns `{ storagePath, signedUrl, generatedAt, byteCount }`.
6. Add a 5-minute in-memory cache (Map keyed by `prescriptionId`, value is `{ storagePath, signedUrl, generatedAt }`). Resends within 5 min reuse the PDF; beyond 5 min, regenerate. (Per master-batch decision 18.)
7. Letterhead fallbacks (per master-batch decision 16): missing logo → text-only header; missing signature image → typed name as signature.
8. Verify multi-page flow with a test Rx of 8+ medicines + long text fields — header/footer must repeat per page.

### Done when

- `generatePrescriptionPdf(<id>)` returns valid `{ storagePath, signedUrl, generatedAt, byteCount }` for a sample Rx.
- PDF renders correctly: header (or text-only), patient + visit metadata, all 7 SOAP sections present (skipped sections render as "—" or omitted entirely — pick a convention and document it in the helper), medicine table, footer.
- Multi-page Rx flows correctly with repeated header + footer.
- Doctor without `logo_url` gets a clean text-only header (no broken image marker).
- File size < 200 KB for a typical Rx; generation time < 1.5s p95 in dev.
- Cache hit on resend within 5 min < 50ms.

### Suggested PR

**PR #1 — PDF service + bucket + templates.** Big PR; consider splitting into `PR #1a: bucket migration + service skeleton` and `PR #1b: templates + multi-page` if review feels heavy.

---

## Task 2 — "Patient view" preview before send (T3.18)

**Effort:** 0.5 day · **Source:** [T3 §T3.18](../../../Product%20plans/ehr/plan-t3-ehr-output.md). **Ships second so doctors see the output value before delivery upgrade lands.**

### Steps

1. Create `frontend/components/consultation/PrescriptionPatientPreview.tsx`. It renders the SAME React tree as the patient-facing page (Task 3 — `/r/[id]/page.tsx`), but takes `prescription` data as a prop instead of fetching by ID + token.
2. Refactor / extract `<PatientRxView>` into a shared component used by both `PrescriptionPatientPreview` (data via prop) and the public route (data via fetch). Lives at `frontend/components/ehr/PatientRxView.tsx`.
3. Modify `frontend/components/consultation/PrescriptionForm.tsx`:
   - Add a "Preview as patient" button next to "Send to patient".
   - On click, open a modal containing `<PrescriptionPatientPreview prescription={formStateToPrescription(formState)} />`.
4. Note: in this task we don't have the public route or the actual PDF download yet. The preview shows the page UI; the "Download PDF" button in the preview is disabled with a tooltip "Available after Send" (or fakes a download via a sample PDF — pick the simpler path).

### Done when

- "Preview as patient" button visible in form header.
- Clicking opens a modal showing the patient page.
- Preview reflects unsaved form edits (verify by typing then clicking preview within debounce window).
- Modal closes cleanly; doesn't lose form state.
- Available in all three mount surfaces (in read-only, the button works but everything inside is the same render).

### Suggested PR

**PR #2 — Patient view component + preview modal.** Independent of PR #1's PDF backend — preview is HTML/React only.

---

## Task 3 — Patient-facing route + token service (T3.16)

**Effort:** 0.75 day · **Source:** [T3 §T3.16](../../../Product%20plans/ehr/plan-t3-ehr-output.md)

### Steps

1. Create `backend/src/services/prescription-token-service.ts`:
   - `mintRxToken(prescriptionId: string, ttlSeconds: number = 86400): string` — HMAC-SHA256 over `prescriptionId + ':' + expiresAt`. Returns base64url string.
   - `verifyRxToken(token: string, prescriptionId: string): { ok: boolean; reason?: 'expired' | 'invalid' }`.
   - Reads `RX_SHARE_TOKEN_SECRET` from env. Throws on startup if missing in non-test env.
2. Create `backend/src/controllers/public-prescription-controller.ts`:
   - `GET /api/v1/public/prescriptions/:id?t=<token>` — verifies token, returns `{ prescription, doctor: { name, clinic_name }, signedPdfUrl, signedAttachmentUrls: [] }`. Mints fresh signed URLs on every call (avoids stale URL on revisit).
3. Create `backend/src/routes/api/v1/public-prescription-routes.ts`. Mount under `/api/v1/public/prescriptions`. **No auth middleware** on this route.
4. Mount the new router in `backend/src/index.ts`.
5. Create `frontend/app/r/[id]/page.tsx`:
   - Reads `[id]` from params and `t` from search params.
   - Fetches via the public endpoint.
   - Mounts `<PatientRxView prescription={...} signedPdfUrl={...} />` (the shared component from Task 2).
   - On token failure, shows "Link expired — request a new link" with a contact CTA (links to the doctor's booking page or chat URL).
6. Page is mobile-first; no auth flow; renders cleanly without JS (SSR happy path).

### Done when

- Page loads without auth at `clariva.health/r/<id>?t=<token>`.
- Expired or invalid tokens show friendly "Link expired" with a CTA.
- "Download PDF" button works (mints fresh signed URL via the public endpoint on click — the URL passed in initial fetch may be ~24h old when patient revisits).
- Page is screenshot-friendly (the patient screenshotting for their pharmacy still looks great).
- No PHI of OTHER patients leaks (token verification confirms `prescription_id` matches the URL param).
- Loads in < 1s on 4G simulation.

### Suggested PR

**PR #3 — Token service + public route + patient page.** Depends on PR #1 (signedPdfUrl needs the bucket) AND PR #2 (shared `<PatientRxView>` component).

---

## Task 4 — Send-pipeline upgrade (T3.17)

**Effort:** 0.5 day · **Source:** [T3 §T3.17](../../../Product%20plans/ehr/plan-t3-ehr-output.md)

### Steps

1. In `backend/src/services/notification-service.ts`, modify `sendPrescriptionToPatient(prescriptionId)`:
   - Call `generatePrescriptionPdf(prescriptionId)` to get the signed URL + storage path. Use the 5-min cache.
   - Call `mintRxToken(prescriptionId, 24 * 3600)` for the share-page token.
   - Build the share URL: `${APP_BASE_URL}/r/${prescriptionId}?t=${token}`.
   - Email payload:
     - Body: existing structured rendering + appended "View online: <share-url>".
     - Attachment: the PDF (download from signed URL into a Buffer, attach via Resend API).
   - IG-DM payload:
     - Text: "Your prescription from Dr. <name> is ready. View: <share-url>".
     - Media attachment: PDF via `attachment.payload.url` set to the public signed URL (Instagram fetches it server-side).
   - Each channel succeeds or fails INDEPENDENTLY (per master-batch decision 17). Aggregate result `{ sent: bool, channels: { instagram?: bool, email?: bool }, pdfStoragePath, publicLink, reason? }`.
2. In `backend/src/utils/dm-copy.ts`, verify `buildPrescriptionReadyDm` accepts the share URL + PDF URL params; extend if needed.
3. In `frontend/components/consultation/PrescriptionForm.tsx`, the "Send to patient" handler is unchanged — backwards-compatible.
4. Failure of one channel does NOT fail the other (try/catch each independently). Failure of PDF generation logs an error and falls back to text-only send (existing behavior preserved).
5. Toast / banner copy: success "Sent to patient (email + DM)" / partial "Sent to patient (email only)" / failure "Failed — Retry".

### Done when

- Patient receives email with the PDF attached + link in body.
- Patient receives IG-DM with the PDF attached (when IG conversation_id is on file) + link in body.
- IG failure (e.g. expired 24h conversation window) doesn't fail email; aggregate result reflects which channels succeeded.
- Existing legacy flow remains backwards-compatible — if PDF generation fails (e.g. service down), text-only send still goes through.
- 5-min cache hit on rapid resend (verify with two clicks within 30s — second is instant).

### Suggested PR

**PR #4 — Send-pipeline upgrade.** Depends on PRs #1 + #3 (PDF + token service).

---

## Task 5 — Resend / Regenerate PDF / Copy share link (T3.19)

**Effort:** 0.25 day · **Source:** [T3 §T3.19](../../../Product%20plans/ehr/plan-t3-ehr-output.md)

### Steps

1. In `frontend/app/dashboard/appointments/[id]/page.tsx`, on previously-sent Rx, add a kebab menu with three actions:
   - **Resend to patient** — calls `sendPrescriptionToPatient` again (which will hit the 5-min cache or regenerate). Confirmation modal before firing.
   - **Regenerate PDF** — calls a new endpoint `POST /api/v1/prescriptions/:id/regenerate-pdf` that forces a fresh `generatePrescriptionPdf` (bypasses the 5-min cache). Confirmation modal — explain "Use this if your letterhead has changed".
   - **Copy share link** — calls `POST /api/v1/prescriptions/:id/share-link` which mints a fresh 24h token and returns the URL. Copy to clipboard via `navigator.clipboard.writeText`. Toast confirms.
2. Backend new endpoints in `prescription-controller.ts`:
   - `POST /:id/regenerate-pdf` — bypasses cache, returns `{ storagePath, signedUrl }`.
   - `POST /:id/share-link` — mints a new token, returns `{ url, expiresAt }`. No side effects (silent share).
3. All three actions are idempotent — calling N times produces N+1 fresh tokens but doesn't duplicate the Rx record. Resend re-fires both channels; "Copy share link" doesn't fire any channel.

### Done when

- All three actions visible in a kebab menu on past Rx.
- Resend triggers a fresh delivery; toast confirms "Sent to patient (email + DM)".
- "Copy share link" puts a working URL in the clipboard; pasting into a new browser opens the patient page.
- "Regenerate PDF" produces a new PDF reflecting current `doctor_settings` (test by editing the doctor's `clinic_name` between sends).

### Suggested PR

**PR #5 — Past-Rx actions kebab.** Depends on PRs #1 + #3 + #4.

---

## Post-batch validation

Once Tasks 1–5 are merged:

- [ ] **All 5 source-plan acceptance criteria** pass.
- [ ] **End-to-end smoke**: doctor creates Rx → sends → patient gets email + IG-DM with PDF attached → patient opens share link → patient downloads PDF → all looks like a single coherent artifact.
- [ ] **Multi-page Rx** renders correctly with 10+ medicines (header + footer repeat per page).
- [ ] **Letterhead fallback** — temporarily blank `doctor_settings.logo_url` → PDF still generates with text-only header.
- [ ] **Token expiry** — manually mint a token with TTL = 1 second; wait 2s; visit URL → "Link expired" page renders.
- [ ] **Token tampering** — change one char in the token → "Invalid link" page renders.
- [ ] **Cross-prescription leak** — visit `/r/<other-prescription-id>?t=<my-token>` → "Invalid link" (HMAC binds token to prescription_id).
- [ ] **PDF cache** — resend within 5 min returns cached file (network tab on backend logs shows no regen); resend after 6 min regenerates.
- [ ] **Type check + lint clean** for both backend + frontend.
- [ ] **Unit tests** added for `mintRxToken` / `verifyRxToken` (round-trip, expiry, tamper).
- [ ] **Update tracking** — mark T3.15–T3.19 as ✓ in [plan-ehr-implementation-batch.md](./plan-ehr-implementation-batch.md); tag `[SHIPPED YYYY-MM-DD]` on each item in [plan-t3-ehr-output.md](../../../Product%20plans/ehr/plan-t3-ehr-output.md).

---

## Suggested PR ordering (solo dev)

```
PR #1: PDF service + bucket + templates              (Task 1)
PR #2: PrescriptionPatientPreview + shared view      (Task 2)
PR #3: token service + public route + patient page   (Task 3)  ← needs #1 + #2
PR #4: send-pipeline upgrade                         (Task 4)  ← needs #1 + #3
PR #5: past-Rx actions kebab                         (Task 5)  ← needs #1 + #3 + #4
```

---

## Risks (per source plan §T3)

- `@react-pdf/renderer` layout breaks on long medicine lists / huge text fields → multi-page flow tested explicitly; text fields have `wordBreak: break-word`.
- `doctor_settings` incomplete → graceful degradation (text-only header, typed signature).
- IG-DM 24-hour conversation window expired → email is primary channel; IG failure logs + continues.
- Signed URLs leak via screenshots → 24h TTL caps exposure; share-link in email/DM is the canonical "open Rx" path that mints fresh URLs.
- PDF gen latency spikes during heavy usage → 5-min cache; if load grows, move to BullMQ / pg_boss in T3-v2.
- Anyone with the URL can view → acceptable for V1 (link already went over IG-DM / email which aren't perfectly secure either); future "revoke link" action.

---

**Owner:** TBD (separate dev from B1, ideally). **Created:** 2026-05-03. **Status:** Drafted; start after Sub-batch A merges.
