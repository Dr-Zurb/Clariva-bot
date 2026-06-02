# Task ui-D2: Patient detail — header + Tabs (Chart / Visits / Prescriptions / Conversations) + right rail

## 06 May 2026 — Batch [UI system redesign](../plan-ui-system-redesign-batch.md) — Sub-batch D (Reference page redesigns) — **L item, ~6h**

---

## Task overview

[`frontend/app/dashboard/patients/[id]/page.tsx`](../../../../../frontend/app/dashboard/patients/%5Bid%5D/page.tsx) becomes the canonical "patient record" surface. Today, anything starting from a patient context (DM thread, search hit, walk-in, click-through from appointment) lands on a page that's a thin wrapper around a few stacked sections. This task gives it a coherent record-style layout that doctors expect from a patient view, while staying inside the workflow-cockpit philosophy (don't bury the things they came here to do).

D2 inherits the pattern set by D1: header + Tabs in the center + right rail for decision-support context. The right rail mounts allergy banners + DDI snippets + problem-list snapshot from the read-only [`patient_problem_list_v`](../../../../../backend/migrations/096_patient_problem_list_view.sql) view — these are persistent context the doctor wants visible across all tabs, not buried inside one.

**Estimated time:** ~6h.

**Status:** Drafted.

**Hard deps:** A2 close (`Tabs`, `Card`, `Badge`).

**Soft deps:** D1 (settles the tab pattern; D2 inherits styling decisions). [`PatientChartPanel`](../../../../../frontend/components/ehr/PatientChartPanel.tsx) and its sections (already shipped via EHR T1).

**Source:** [U4.3](../../../../Product%20plans/plan-ui-system-redesign.md#u43--patient-detail-header--tabs) + [U4.4](../../../../Product%20plans/plan-ui-system-redesign.md#u44--patient-detail-right-rail).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium** (D1 already settled the tab pattern; D2 follows it).

**Why this tier:** Pattern is locked; D2 mostly composes existing chart sections + visit list + Rx list + chat-history links. Sonnet handles cleanly.

**New chat?** Yes — fresh chat. Do NOT carry over D1's chat — different page, different concerns.

**Pre-load (paste at start):**

- This task file (full).
- D1's resolved appointment-detail page (so the agent sees the matching tab pattern).
- Current `frontend/app/dashboard/patients/[id]/page.tsx`.
- The shape of `Patient` from `frontend/types/patient.ts`.
- One sentence: "PatientChartPanel and sections are already shipped — `frontend/components/ehr/PatientChartPanel.tsx` + `frontend/components/ehr/sections/*.tsx`."

**Estimated turns:** 2–3.

**Escalate to Opus if:** the right-rail responsive behavior surfaces a question (does it move to the bottom of the page on `<xl`, or attach to a tab? What about under each tab on mobile?). One Opus turn settles it; default is "right rail moves to top of page above tabs on `<xl`."

**Composer-OK sub-steps:** none.

---

## Acceptance criteria

### Layout

- [ ] **Page header** at top:
  - Back link "← Back to patients".
  - Patient name as `<h1>`.
  - Sub-line: age/sex (if available), phone (clickable `tel:`), IG handle (if present, clickable to IG profile).
  - Right side: `Merge` action (existing `MergePatientsModal` trigger). `Add appointment` secondary CTA → opens existing modal.
- [ ] **Below the header, 2-zone grid on `xl+`:**
  - Center work area (8/12): `<Tabs>` content.
  - Right rail (4/12): allergy banner + DDI hint + problem-list snapshot.
- [ ] **At `lg`:** drop right rail; mount its contents at the **top** of the page above the tabs (decision-support context first).
- [ ] **At `<lg`:** stack everything; right-rail content as a collapsible accordion above tabs.

### Tabs (4 tabs)

- [ ] **`Chart`** — reuses [`PatientChartPanel`](../../../../../frontend/components/ehr/PatientChartPanel.tsx) and its sections (Allergies / Chronic conditions / Vitals + sparklines / Previous Rx). The chart is V1's clinical core.
- [ ] **`Visits`** — vertical timeline of `appointments` for this patient (newest first). Each item: date, modality, status, link to `/dashboard/appointments/<id>`. Group by month if >12 entries.
- [ ] **`Prescriptions`** — mounts existing [`<PatientPrescriptions>`](../../../../../frontend/components/patients/PatientPrescriptions.tsx). No structural change to that component beyond token reskin.
- [ ] **`Conversations`** — list of consultation_sessions with chat history, one row per appointment with a session row. Click → chat-history page (`/dashboard/appointments/<id>/chat-history`). Empty state: "No conversations yet."

### Tab visibility / defaults

- [ ] **Default tab:** `Chart` (the most-asked-for thing on this page).
- [ ] **Deep-linkable:** `?tab=` search param (same pattern as D1).
- [ ] **All tabs always visible** — no conditional hiding (a patient always has a chart, even if empty; visits/Rx/conversations have empty states).

### Right rail content

- [ ] **Allergy banner:** if patient has allergies, show [`<AllergyClashBanner>`](../../../../../frontend/components/ehr/AllergyClashBanner.tsx)-style summary card listing top 3 allergens. Link "View all" → opens the Allergies section in the Chart tab.
- [ ] **Active problem snapshot:** read from [`patient_problem_list_v`](../../../../../backend/migrations/096_patient_problem_list_view.sql) via the existing patient-chart endpoint (`GET /patients/:id/chart/problems`). Show top 5 problems with a one-line label.
- [ ] **Recent vitals snapshot (optional):** the most recent BP / HR / Temp from `patient_vitals` if present, displayed as a tight 3-column grid.
- [ ] All three blocks render as `<Card>` items in the rail. If a block has no data, hide it (don't show empty cards in the rail — the right column should densify, not waste space).

### Behavior preservation

- [ ] Existing patient detail features still work: merge, add appointment, edit chart sections (writes go through `PatientChartPanel`).
- [ ] Patient delete (if exists) preserved.
- [ ] All existing fetches preserved.

### General

- [ ] Type-check + lint clean.
- [ ] No console errors.
- [ ] All raw color classes replaced with tokens.
- [ ] Mobile breakpoints verified at 375 / 768 / 1024 / 1440.
- [ ] **No PHI in telemetry** — fire `patient_detail.viewed`, `patient_detail.tab_changed` (counts only, no patient ID).

---

## Out of scope

- **Editing patient demographics in-place from the header.** That's a future settings/admin flow.
- **A separate "Notes" tab.** Notes live inside the Chart's clinical-notes section.
- **Cross-doctor referrals / sharing.** EHR T6 territory; deferred.
- **Documents tab** (uploaded files, lab reports as separate documents). Out of V1; attachments live with prescriptions.
- **Inline chart edits in the right rail.** Rail is read-only context; edits happen in the Chart tab.

---

## Files expected to touch

**Frontend:**
- `frontend/app/dashboard/patients/[id]/page.tsx` — **major edit** (~250 LOC; restructure to header + tabs + rail).
- `frontend/components/patients/PatientVisitsTimeline.tsx` — **new** (~100 LOC, the Visits tab body).
- `frontend/components/patients/PatientConversationsList.tsx` — **new** (~80 LOC, the Conversations tab body).
- `frontend/components/patients/PatientDetailRail.tsx` — **new** (~150 LOC, the right rail composition).
- `frontend/components/patients/PatientPrescriptions.tsx` — **possible token reskin only**.

**Backend / migrations / tests:** none. The `patient_problem_list_v` view ships in EHR migration 096; verify the patient-chart `GET /problems` endpoint already exists in [`patient-chart-routes.ts`](../../../../../backend/src/routes/api/v1/patient-chart-routes.ts).

---

## Notes / open decisions

1. **Why default to `Chart`.** Doctors come here to remember the patient's medical context, more often than to look up past visits. Chart-first matches the "EHR you actually want to use" framing.
2. **Why right rail moves to top on `<xl` (not bottom).** Decision-support context (allergies! DDIs!) should be visible BEFORE the doctor scrolls into the chart and starts adding things. Top placement on small screens.
3. **Visits as timeline vs list.** Timeline (vertical, dated) is more scannable for a clinical context than a flat list. Use a simple `<ol>` with date markers, not a fancy timeline component.
4. **Conversations as a tab vs as part of Visits.** Each conversation belongs to a specific session, which belongs to an appointment. We could merge into Visits with a "Has conversation" pill, but separating gives users a direct path to "show me all the chats" — sometimes a doctor wants that without rummaging through visit history. Keep separated for V1.
5. **Patient-detail telemetry.** Tab-change events are useful to see which tab gets picked first; informs V1.1 default.

---

## References

- **Batch plan:** [plan-ui-system-redesign-batch.md § Sub-batch D](../plan-ui-system-redesign-batch.md#sub-batch-d--reference-page-redesigns-3-items-15-days)
- **Source items:** [U4.3](../../../../Product%20plans/plan-ui-system-redesign.md#u43--patient-detail-header--tabs), [U4.4](../../../../Product%20plans/plan-ui-system-redesign.md#u44--patient-detail-right-rail)
- **Hard deps:** [task-ui-A2-shadcn-bootstrap.md](./task-ui-A2-shadcn-bootstrap.md)
- **Soft dep:** [task-ui-D1-appointment-detail-three-zone.md](./task-ui-D1-appointment-detail-three-zone.md) (settles the tab pattern)
- **Sibling task:** D3 (list-page pattern)
- **Reuses:** [`PatientChartPanel`](../../../../../frontend/components/ehr/PatientChartPanel.tsx), `frontend/components/ehr/sections/*.tsx`, [`PatientPrescriptions`](../../../../../frontend/components/patients/PatientPrescriptions.tsx), [`MergePatientsModal`](../../../../../frontend/components/patients/MergePatientsModal.tsx), [`AllergyClashBanner`](../../../../../frontend/components/ehr/AllergyClashBanner.tsx).
- **Backend view:** [`patient_problem_list_v`](../../../../../backend/migrations/096_patient_problem_list_view.sql).
- **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

**Owner:** TBD  
**Created:** 2026-05-06  
**Status:** Drafted; blocked on A2 close.
