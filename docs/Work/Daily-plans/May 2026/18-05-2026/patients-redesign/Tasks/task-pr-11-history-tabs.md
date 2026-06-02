# Task pr-11: History tabs — `VisitsTab` + `ConversationsTab` + `RxTab`

## 18 May 2026 — Batch [Patients tab redesign — Phase 1](../plan-patients-redesign-batch.md) — Wave 5, Lane β — **M, ~4h**

---

## Task overview

Land the three history-axis tabs on the patient detail page: **Visits** (expandable timeline replacing the v1 `PatientVisitsTimeline.tsx`), **Conversations** (grouped by channel — WhatsApp, IG DM, web chat, in-app — replacing the v1 `PatientConversationsList.tsx`), and **Rx** (lifetime prescriptions grouped by date with Reissue + PDF actions). All three consume the existing `getAppointments` + `listPrescriptions` paths but with a per-patient filter (pr-02 extended the list endpoint with `?patient_id=` query param; this task either uses that or adds a dedicated `/api/v1/patients/:id/appointments` endpoint — task picks based on which is cleaner).

This is Lane β of Wave 5 — runs in parallel with pr-10 / pr-12 (Lane α) since the three tabs live entirely under `frontend/components/patients-v2/tabs/` and the only shared file (`PatientV2Shell.tsx`'s `renderTabContent` switch) is modified additively (each lane adds one or more `case` branches; no two lanes touch the same line).

**Estimated time:** ~4h (1h Visits + 1h Conversations + 1h Rx + 30min per-patient filter discovery + endpoint + 30min wiring + verification).

**Status:** Done.

**Hard deps:** pr-09 (the tab framework + `renderTabContent` switch).

**Source:** [plan-patients-redesign-batch.md § Wave 5](../plan-patients-redesign-batch.md#wave-5--tabs-content-3-tasks-9h-with-parallelism--2-parallel-lanes-after-pr-09) + DL-3.

---

## Model & execution guidance

**Recommended model:** Auto. Three sibling tabs sharing a fetch + render pattern. The v1 components are the visual reference (do not import — they live behind the ESLint zone fence).

**Per-message escalation rule:** Escalate to Opus only if the per-patient appointment filter requires a non-trivial backend change. The task spec gives two paths (extend the list endpoint with `?patient_id=` OR add a dedicated `/api/v1/patients/:id/appointments` endpoint); both are bounded.

**New chat?** Yes — fresh Auto chat. Pre-load:

- This task file.
- `frontend/components/patients/PatientVisitsTimeline.tsx` (v1 — visual reference).
- `frontend/components/patients/PatientConversationsList.tsx` (v1 — visual reference).
- `frontend/lib/api/index.ts` (`getAppointments` signature + any per-patient variant).
- `frontend/lib/api/prescriptions.ts` (`listPrescriptions` / `getPatientPrescriptions` — task identifies the exact name).
- `frontend/components/patients-v2/PatientV2Shell.tsx` (post-pr-09 + post-pr-10 (Lane α may modify first; merge cleanly) — the tab-content switch).
- `frontend/components/ui/collapsible.tsx`.
- Source plan §DL-3.

**Estimated turns:** 4–6 turns.

---

## Acceptance criteria

### Step 1 — Per-patient fetch path (discovery + wire)

- [x] **Discovery:** `rg "getAppointments\b" frontend/lib/api` + `rg "patient_id" backend/src/controllers/appointment-controller.ts` to check whether the appointments list endpoint already accepts a `?patient_id=` filter.
- [x] **If yes:** use `getAppointments(token, { patientId })`.
- [x] **If no (most likely):** ship a thin extension in `backend/src/controllers/appointment-controller.ts` + `appointment-service.ts` that accepts `?patient_id=` (optional). Frontend wrapper `getAppointmentsForPatient(token, patientId)` added to `frontend/lib/api/index.ts` (or `frontend/lib/api/appointments.ts` if it exists; task picks). Similarly for prescriptions: confirm or add a `getPrescriptionsForPatient(token, patientId)` client wrapper.
- [x] **RLS** — verify the existing `appointments` and `prescriptions` RLS predicates cover the `auth.uid() = doctor_id` scope; the new filter is additive within that scope. No RLS shape change.

### Step 2 — `<VisitsTab>`

- [x] **New file** `frontend/components/patients-v2/tabs/VisitsTab.tsx` (~250 LOC). Props: `{ patientId: string; token: string; initialVisitFocus?: string }` (the optional `initialVisitFocus` comes from the URL `?visit=` set by pr-09's dot breadcrumb).

- [x] **Fetch** `getAppointmentsForPatient(token, patientId)` on mount + on `patientId` change. Sort newest first.

- [x] **In-tab filter row** — modality (`All / Video / Voice / Text / In-clinic`) + status (`All / Completed / Cancelled / No-show / Scheduled`) + date range (last 90d / 1y / All time / Custom — Phase 1 ships only the three preset spans, Custom is Phase 2).

- [x] **Timeline rendering** — vertical list grouped by month (Month YYYY header). Each row = collapsible:
  - Collapsed header (always visible): date + modality icon + status badge + chief complaint (truncated 80 chars).
  - Expanded body (toggle via row click): diagnosis (from the appointment's prescription record), Rx issued summary (medicine count + a "View Rx" link), attachments count, notes. If a prescription_draft snapshot exists, show its summary instead.

- [x] **`initialVisitFocus` behaviour** — if set, scroll the matching row into view + auto-expand it on mount. URL stays as `?tab=visits&visit=<id>` to remain shareable.

- [x] **Empty state** — "No visits recorded for this patient yet."

### Step 3 — `<ConversationsTab>`

- [x] **New file** `frontend/components/patients-v2/tabs/ConversationsTab.tsx` (~200 LOC). Props: `{ patientId: string; token: string }`.

- [x] **Fetch path** — the v1 component derives conversations from `getAppointments` filtering for those with `consultation_session` set. Preserve this behaviour for Phase 1; a dedicated conversations endpoint is Phase 2.

- [x] **Group by channel** — top-level sections: WhatsApp / Instagram DM / Web chat / In-app. Each section's header has a count badge.

- [x] **Row layout** — within each section, list conversations newest first:
  - Date + relative time
  - Preview (first 80 chars of the conversation's last message)
  - Unread indicator (small dot) if the last reply was from the patient and a doctor-side read marker hasn't fired (Phase 1 fudges this — read markers don't exist yet; Phase 2 wires real read state)
  - Last-replied-by ("You · 2h" or "Patient · 5min")
  - Click row → `<Link href="/chat?conversation_id=…">` (the existing chat surface).

- [x] **Empty state** per section — section is hidden if empty.
- [x] **All-empty state** — single "No conversations recorded yet" with a hint about how conversations get created.

### Step 4 — `<RxTab>`

- [x] **New file** `frontend/components/patients-v2/tabs/RxTab.tsx` (~200 LOC). Props: `{ patientId: string; token: string }`.

- [x] **Fetch** `getPrescriptionsForPatient(token, patientId)` (or equivalent). Each prescription has its medicines as nested rows.

- [x] **List rendering** — grouped by year. Each prescription row:
  - Date + a small "Issued during {appointment_date}" link
  - List of medicines: drug name + dose + frequency + duration
  - Footer actions: **Reissue** (opens the cockpit-v2 `<RxFormContext>` pre-populated with this Rx's medicines — Phase 1 wires this as a toast "Coming soon" if cv2-05 hasn't merged yet; Phase 2 fully wires) · **View PDF** (opens the existing PDF view at `/dashboard/prescriptions/:id/pdf` or similar — task confirms the existing path) · **Copy summary** (copies a plain-text block to clipboard).

- [x] **Empty state** — "No prescriptions issued yet."

### Step 5 — Tab-switch wiring in `PatientV2Shell`

- [x] **Modify** `renderTabContent` in `PatientV2Shell.tsx`. After pr-10 modifies, the switch should now include:
  ```ts
  switch (tabId) {
    case 'overview':      return <OverviewTab patientId={…} token={…} />;
    case 'visits':        return <VisitsTab patientId={…} token={…} initialVisitFocus={searchParams.get('visit') ?? undefined} />;
    case 'conversations': return <ConversationsTab patientId={…} token={…} />;
    case 'rx':            return <RxTab patientId={…} token={…} />;
    default:              return <TabPlaceholder name={tabId} />;
  }
  ```
  pr-12 fills the remaining cases (vitals, files).

  **Merge note:** both this task (Lane β) and pr-10 / pr-12 (Lane α) modify this switch. The agents working in parallel each add their case branches; the merge conflict (if any) is mechanical and easy.

### Step 6 — Telemetry + verification

- [x] Each tab fires `patients_v2.tab_opened` with `{tab_id: 'visits' | 'conversations' | 'rx', patient_id}` once per first render.
- [x] `pnpm --filter frontend tsc --noEmit` clean.
- [x] `pnpm --filter frontend lint` clean (including the v2 zone — no v1 imports leak in).
- [x] Switching to each tab on a patient with seeded data renders the expected content.
- [x] Visits tab in-tab filters work (toggle modality, see list update without a refetch — filter is client-side over the fetched data).
- [x] Visits tab `?visit=<id>` scrolls to + expands the matching row.
- [x] Conversations tab groups by channel; rows link to `/chat?...`.
- [x] Rx tab Reissue button shows the appropriate toast in Phase 1.
- [x] Empty states render for tabs with no data.

---

## Out of scope

- **Real read-state for conversations.** Phase 2.
- **Dedicated conversations endpoint.** Phase 2.
- **Custom date-range picker in Visits tab.** Phase 2.
- **Rx Reissue full wiring.** Phase 2 (depends on cv2-05's `<RxFormContext>` to accept seed data).
- **Conversation composer inline.** Phase 2.
- **Bulk-Rx export.** Phase 2.

---

## Files expected to touch

**New:**

- `frontend/components/patients-v2/tabs/VisitsTab.tsx` (~250 LOC).
- `frontend/components/patients-v2/tabs/ConversationsTab.tsx` (~200 LOC).
- `frontend/components/patients-v2/tabs/RxTab.tsx` (~200 LOC).

**Modified:**

- `frontend/components/patients-v2/PatientV2Shell.tsx` (~15 LOC delta — three new `case` branches in `renderTabContent`).
- `frontend/lib/api/index.ts` or `frontend/lib/api/appointments.ts` (~25 LOC delta — `getAppointmentsForPatient` wrapper).
- `frontend/lib/api/prescriptions.ts` (~25 LOC delta — `getPrescriptionsForPatient` wrapper, conditional).
- Conditionally: `backend/src/controllers/appointment-controller.ts` + `appointment-service.ts` (~40 LOC delta — `?patient_id=` query-param filter, only if not already present).

**Read but do not modify:**

- `frontend/components/patients/PatientVisitsTimeline.tsx`, `PatientConversationsList.tsx` (v1 visual references).

---

## Notes / open decisions

1. **Why client-side filter Visits inside the tab instead of server-side?** Filter combinatorics (modality x status x date) are small; client-side over ≤ 100 visits per patient is responsive. Server-side would require N more endpoints.

2. **Why no in-tab search inside Conversations?** Phase 1 cap. Most patients have < 5 channels; finding a conversation is straightforward.

3. **What if `prescriptions.investigations` field gets renamed by cv2-04 mid-batch?** The Rx tab reads from the `prescriptions` table; if cv2-04 renames the column to `investigations_orders`, this task's display logic needs to read either field. Defensive: try the new name first, fall back to the old name.

4. **Why is the Reissue toast "Coming soon" instead of opening a stub form?** A stub form invites the doctor to fill it and have nothing happen. A toast says "we're aware, not ready yet" honestly.

5. **Should the Conversations tab show real-time updates?** Phase 2. Real-time would require Supabase real-time subscriptions on the conversation tables. Phase 1 = fetch-on-mount + manual refresh.

---

## References

- **Affected files:** see "Files expected to touch".
- **Source decisions:** [§DL-3 (tab inventory)](../plan-patients-redesign-batch.md#decision-lock-frozen-for-batch-duration).
- **Wave gate:** [`EXECUTION-ORDER-patients-redesign.md` § Wave 5 gate](./EXECUTION-ORDER-patients-redesign.md#wave-5-gate-after-pr-10--pr-11--pr-12).
- **Parallel tasks in Lane α:** [`task-pr-10-patient-overview-tab.md`](./task-pr-10-patient-overview-tab.md), [`task-pr-12-vitals-and-files-tabs.md`](./task-pr-12-vitals-and-files-tabs.md).

---

**Owner:** TBD
**Created:** 2026-05-18
**Status:** Pending
