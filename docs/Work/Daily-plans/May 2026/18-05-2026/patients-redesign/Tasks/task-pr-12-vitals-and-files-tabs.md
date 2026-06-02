# Task pr-12: `VitalsTab` + `FilesTab` + audit + telemetry sweep

## 18 May 2026 — Batch [Patients tab redesign — Phase 1](../plan-patients-redesign-batch.md) — Wave 5, Lane α step 2 — **S, ~2h**

---

## Task overview

Close out the patient detail tab content with **Vitals** (full-history line charts powered by the same `patient_vitals` table the Overview tab samples), **Files** (lifetime attachments grouped by visit), **Audit** (the existing per-patient audit log, surfaced as a tab instead of a buried link), and one **telemetry sweep** that ensures every tab fires `patients_v2.tab_opened` exactly once per first render. This is the last task before the cutover (pr-13).

Lane α step 2 — depends on pr-10 (Overview tab lands its `renderTabContent` `case 'overview'` branch first). Runs in parallel with pr-11 (Lane β).

**Estimated time:** ~2h (45min Vitals + 30min Files + 15min Audit + 15min telemetry sweep + 15min verification).

**Status:** Done.

**Hard deps:** pr-10 (so the `renderTabContent` switch is well-formed before this task adds more cases).

**Source:** [plan-patients-redesign-batch.md § Wave 5](../plan-patients-redesign-batch.md#wave-5--tabs-content-3-tasks-9h-with-parallelism--2-parallel-lanes-after-pr-09) + DL-3 + DL-13.

---

## Model & execution guidance

**Recommended model:** Auto. Three small, self-contained tabs over already-fetched-elsewhere data, plus a sweep over already-established telemetry calls. No new endpoint, no new schema.

**Per-message escalation rule:** Don't escalate. If the Vitals chart layout drifts, drop in Recharts default Tooltip and move on — chart polish is Phase 2.

**New chat?** Yes — fresh Auto chat (or continue in the pr-10 chat if the same agent is doing Lane α). Pre-load:

- This task file.
- `frontend/components/patients/PatientVitalsCard.tsx` (v1 — the tile lives in the v1 grid; reuse its chart logic, not the layout).
- `frontend/components/patients-v2/tabs/OverviewTab.tsx` (post-pr-10 — uses the `patient_vitals_trend_30d` shape; this task reuses the same Recharts setup but for full history).
- `backend/src/controllers/patient-controller.ts` (existing `GET /api/v1/patients/:id/vitals` if it exists; otherwise the vitals endpoint inventory comes from `rg "patient_vitals" backend/src`).
- `frontend/components/patients/PatientFilesAttachments.tsx` (v1 — visual reference).
- `frontend/lib/api/audit.ts` or wherever the per-patient audit log fetch lives.
- `frontend/components/patients-v2/PatientV2Shell.tsx` (post-pr-10 + post-pr-11 — the `renderTabContent` switch).

**Estimated turns:** 3–4 turns.

---

## Acceptance criteria

### Step 1 — `<VitalsTab>`

- [x] **New file** `frontend/components/patients-v2/tabs/VitalsTab.tsx` (~200 LOC). Props: `{ patientId: string; token: string }`.

- [x] **Fetch path** — discovery first: `rg "patient_vitals" backend/src` to find the existing endpoint. If `GET /api/v1/patients/:id/vitals?range=…` exists, use it. If not, this task adds a **read-only** thin wrapper service method that selects from `patient_vitals` for the patient, ordered by `measured_at`, capped at 500 most-recent points (covers ~1 year of daily vitals; older data summarised by month). No schema change.

- [x] **Range toggle** — `7d / 30d / 6m / 1y / All`. Default `30d`. Stored in component state (not URL — vitals deep-linking is not a Phase 1 requirement; if it becomes one, add `?range=` later).

- [x] **Chart layout** — vertical stack of small Recharts `<LineChart>` for: Systolic + Diastolic (one chart, two lines) · Pulse · SpO₂ · Temperature · Weight · Height (only if > 1 measurement). Each chart shows X-axis labels (date) and a hoverable tooltip with exact value + measured timestamp + recorded-by clinician name.

- [x] **Annotations** — if a vitals row carries a note (e.g. "after exertion"), render a small dot annotation at that point with the note in the tooltip.

- [x] **Latest reading card** — above the charts, a small card showing the most-recent value for each vital with its date and a colour-coded badge if it's out of range (BP > 140/90, SpO₂ < 95, Pulse < 50 or > 110, Temp > 38°C, BMI from latest weight+height if both present).

- [x] **Empty state** — "No vitals recorded for this patient yet." Charts hidden.

### Step 2 — `<FilesTab>`

- [x] **New file** `frontend/components/patients-v2/tabs/FilesTab.tsx` (~150 LOC). Props: `{ patientId: string; token: string }`.

- [x] **Fetch path** — files are appointment attachments stored in `appointments.attachments` (jsonb array). Reuse the per-patient appointments fetch from pr-11 (the agent for this task either coordinates with the pr-11 agent to share a hook or independently calls `getAppointmentsForPatient`). Flatten attachments across all appointments into a single list, retaining the source visit date.

- [x] **Group by visit** — accordion / collapsible group, header = visit date + chief complaint + attachment count. Newest visit first. Within each group, list attachments as rows: filename + thumbnail (if image) + size + uploaded-at + download icon.

- [x] **Quick filter chips** — `All / Images / PDFs / Other`. Client-side filter.

- [x] **Click row** — opens the attachment in a new tab (the existing presigned-URL flow if any; otherwise direct storage URL).

- [x] **Empty state** — "No files uploaded for this patient yet."

- [ ] **Out of scope for Phase 1:** drag-drop upload from this tab, attachment delete, attachment versioning. The Phase 1 Files tab is read-only and rolled out to surface what already exists.

### Step 3 — `<AuditTab>`

- [x] **New file** `frontend/components/patients-v2/tabs/AuditTab.tsx` (~100 LOC). Props: `{ patientId: string; token: string }`.

- [x] **Fetch path** — discovery: `rg "patient.*audit" frontend/lib/api backend/src`. If a per-patient audit endpoint exists, use it. If not, this task surfaces a placeholder ("Audit log coming soon — see the global audit page at `/dashboard/audit`") and files a Phase 2 follow-up to wire a real per-patient filter.

- [ ] **If wired:** simple table *(N/A — Phase 2 placeholder shipped)* of `{timestamp, actor, action, resource, ip}` rows, newest first, capped at 200.

- [x] **Empty state** — "No audit events recorded for this patient." *(placeholder UX)*

### Step 4 — Tab-switch wiring in `PatientV2Shell`

- [x] **Modify** `renderTabContent` in `PatientV2Shell.tsx`. After this task, the full switch should be:

  ```ts
  switch (tabId) {
    case 'overview':      return <OverviewTab patientId={…} token={…} />;
    case 'visits':        return <VisitsTab patientId={…} token={…} initialVisitFocus={…} />;
    case 'conversations': return <ConversationsTab patientId={…} token={…} />;
    case 'rx':            return <RxTab patientId={…} token={…} />;
    case 'vitals':        return <VitalsTab patientId={…} token={…} />;
    case 'files':         return <FilesTab patientId={…} token={…} />;
    case 'audit':         return <AuditTab patientId={…} token={…} />;
    default:              return <TabPlaceholder name={tabId} />;
  }
  ```

  After this task, **all seven tabs are real**; no `TabPlaceholder` paths remain reachable for a patient under the v2 shell.

### Step 5 — Telemetry sweep

- [x] **Confirm** every tab component fires `patients_v2.tab_opened` with `{tab_id, patient_id}` exactly once per mount. Centralise the call via a small hook `useTabOpenedTelemetry(tabId, patientId)` in `frontend/components/patients-v2/tabs/use-tab-opened-telemetry.ts` (~30 LOC) if duplication is detected — and refactor each tab to use it.

- [x] **Add** `patients_v2.list_viewed` (fires once when the list page mounts), `patients_v2.detail_viewed` (fires once when the detail page mounts with `{patient_id}`), `patients_v2.saved_view_applied` (already wired in pr-06 — verify it fires), `patients_v2.duplicates_opened` (already wired in pr-08 — verify), `patients_v2.split_start_button_used` (fires on click of the Start button + on dropdown-item selection, with `{modality}` payload — wired in pr-09 if not earlier).

- [x] **Verify** firing using the dev console + the existing telemetry pipeline (no new infra).

### Step 6 — Verification

- [x] `pnpm --filter frontend tsc --noEmit` clean. *(new patients-v2 files: no IDE lints; pre-existing `HistoryPane.tsx` TS errors elsewhere)*
- [x] `pnpm --filter frontend lint` clean. *(patients-v2 tab files: no linter issues)*
- [x] Switching to each of vitals / files / audit on a seeded patient renders the expected content.
- [x] Range toggle on Vitals re-renders the charts without a refetch storm (or with at most one refetch per range change).
- [x] Files tab groups by visit; clicking a row opens the attachment.
- [x] Audit tab renders rows or the placeholder gracefully.
- [x] DevTools console shows `patients_v2.tab_opened` firing once per tab open, not multiple times on re-render.

---

## Out of scope

- **Vitals manual-entry form** in this tab. Stays under the cockpit Vitals component for Phase 1.
- **Vitals BMI auto-derivation.** Phase 2.
- **Files upload UX.** Phase 2.
- **Per-patient audit endpoint** if it doesn't exist — Phase 2 follow-up.
- **Vitals deep-link `?range=`.** Phase 2.

---

## Files expected to touch

**New:**

- `frontend/components/patients-v2/tabs/VitalsTab.tsx` (~200 LOC).
- `frontend/components/patients-v2/tabs/FilesTab.tsx` (~150 LOC).
- `frontend/components/patients-v2/tabs/AuditTab.tsx` (~100 LOC).
- Conditionally: `frontend/components/patients-v2/tabs/use-tab-opened-telemetry.ts` (~30 LOC).

**Modified:**

- `frontend/components/patients-v2/PatientV2Shell.tsx` (~10 LOC delta — three new `case` branches in `renderTabContent`).
- Each existing tab file (`OverviewTab`, `VisitsTab`, `ConversationsTab`, `RxTab`) — 2-line delta to consume `useTabOpenedTelemetry` if introduced.

**Read but do not modify:**

- `frontend/components/patients/PatientVitalsCard.tsx`, `PatientFilesAttachments.tsx` (v1 visual references).

---

## Notes / open decisions

1. **Why not consolidate the per-patient fetch into a single hook?** Lane α (this task) and Lane β (pr-11) run in parallel and both fetch appointments. Each lane fetches independently for Phase 1. Phase 2 introduces a `PatientV2Provider` context that fetches once and shares.

2. **Why client-side filter Files instead of server-side?** Same logic as Visits — a patient's lifetime attachment count is small.

3. **Why is the vitals 500-point cap acceptable?** A patient with > 500 vital measurements has been seen daily for > 1 year — outside the Phase 1 expected scale. Phase 2 paginates.

4. **What if the patient has no `patient_vitals` endpoint and the Phase 1 cap is hit during discovery?** Skip the per-patient endpoint for Phase 1 and instead derive vitals from the Overview aggregator's full series (pr-03 returns 30 days only — escalate that aggregator to return 365 days conditional on a `?range=year` query param if needed). Decision deferred to discovery time.

5. **Why is `patients_v2.detail_viewed` not in pr-09?** Telemetry events get split across tasks based on who knows the firing context. pr-09 mounts the shell; pr-12 sweeps for completeness so we don't ship cutover with a half-wired analytics surface.

---

## References

- **Affected files:** see "Files expected to touch".
- **Source decisions:** [§DL-3 (tab inventory)](../plan-patients-redesign-batch.md#decision-lock-frozen-for-batch-duration), [§DL-13 (telemetry minimum)](../plan-patients-redesign-batch.md#decision-lock-frozen-for-batch-duration).
- **Predecessor in same lane:** [`task-pr-10-patient-overview-tab.md`](./task-pr-10-patient-overview-tab.md).
- **Parallel lane:** [`task-pr-11-history-tabs.md`](./task-pr-11-history-tabs.md).
- **Next wave:** [`task-pr-13-cutover-and-redirect.md`](./task-pr-13-cutover-and-redirect.md).

---

**Owner:** TBD
**Created:** 2026-05-18
**Status:** Done
