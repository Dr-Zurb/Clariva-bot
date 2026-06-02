# Task cockpit-8: Patient page mirrors the cockpit pattern

## 06 May 2026 — Batch [Cockpit redesign](../plan-cockpit-redesign-batch.md) — Lane δ (parallel after cockpit-1) — **M, ~5h**

---

## Task overview

`/dashboard/patients/[id]` is the **history surface** — review past visits, conversations, files, chart. `/dashboard/appointments/[id]` is the **work surface** — actively consulting + writing Rx. Doctors confuse the two today because both look like generic admin pages.

This task gives the patient page a 3-zone layout that mirrors the cockpit visually but optimises for read-mostly history:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ← back · Patient name · age · phone · [Book consult] [⋯ kebab]              │
├────────────┬───────────────────────────────────────────┬─────────────────────┤
│  CHART     │   Tabs:                                   │   RIGHT RAIL        │
│  (3)       │   Visits · Conversations · Files          │   (3)               │
│            │   ── content ──                           │                     │
│ Allergies  │                                            │ Latest visit card   │
│ Problems   │                                            │ Open episodes       │
│ Vitals     │                                            │ Allergy clash       │
│ Prev Rx    │                                            │ banner (if any)     │
└────────────┴────────────────────────────────────────────┴─────────────────────┘
```

The patient page **does NOT** have an Rx workspace — Rx happens within an active appointment. The right rail is curated read-only summaries.

Lane δ is **independent** — it touches the patient page tree only.

**Estimated time:** ~5h.

**Status:** Shipped (2026-05-06).

**Hard deps:** [cockpit-1](./task-cockpit-1-state-machine.md) shipped (the page reuses `shouldShowChartRail` and may import `CockpitState` for future cross-references). cockpit-2 design **read** (not impl) for visual consistency.

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**. Pattern is established by cockpit-2; this is reuse + the existing patient-page data integration.

**No Opus design call.** The 3-zone layout decision is locked at the batch level.

**New chat?** **Yes — own chat for lane δ.** Pre-load: this task file + cockpit-2's task file (for the layout pattern) + the existing `frontend/app/dashboard/patients/[id]/page.tsx` + the new components in the unstaged tree (`PatientDetailWorkArea.tsx`, `PatientDetailRail.tsx`, `PatientVisitsTimeline.tsx`, `PatientConversationsList.tsx`).

**Multi-chat coordination:** none. δ is fully independent. Can run **in parallel** with α / β / γ. The only shared file across batches is `lib/consultation/cockpit-state.ts` (cockpit-1) — read-only here.

**Lane-δ ground rule for the agent's first prompt:** *"This is lane δ — patient page. I am only allowed to edit `frontend/app/dashboard/patients/[id]/page.tsx` and create new files under `frontend/components/patients/`. I must NOT touch any file in lanes α / β / γ."*

---

## Acceptance criteria

### Layout

- [ ] **At `xl+` (≥1280px):** 12-col grid `chart 3 / tabs 6 / rail 3`. Chart and rail sticky.
- [ ] **At `lg` (1024–1279px):** `chart 3 / tabs 9` — rail content moves to the bottom of the active tab.
- [ ] **At `<lg`:** stacked: chart accordion → tabs → rail content. (No bottom-pill UX here — the patient page isn't a real-time work surface; scroll is fine.)

### Header

- [ ] New `PatientCockpitHeader` (or just inline the markup if simple). Fields:
  - Back link `← Back to patients`.
  - `<h1>` patient name.
  - Meta strip: `age · sex · phone · DOB · linked IG handle (if any)`.
  - Right side: `<Button>Book consult</Button>` + `⋯ kebab`.
- [ ] **Book consult CTA:** opens existing book flow with patient pre-filled. (If the existing flow is at `/dashboard/appointments/new`, link there with `?patient=<id>`.)
- [ ] **Kebab:** `Edit patient` (links to existing settings flow), `Merge patient` (V2 — disabled), `View audit log` (when audit access).

### Tabs

- [ ] `<Tabs>` (A2 primitive) with three triggers:
  - **Visits** — chronological list of appointments + their session statuses + Rx links. Reuse `PatientVisitsTimeline.tsx` if it exists in the unstaged tree.
  - **Conversations** — chat history across all visits. Reuse `PatientConversationsList.tsx` if it exists.
  - **Files** — uploaded attachments / downloaded Rx PDFs / replay artifacts.
- [ ] Deep-linkable: `?tab=visits|conversations|files`. Default `visits`.
- [ ] Tab change uses `router.replace({ scroll: false })`.

### Chart pane

- [ ] Mounts `<PatientChartPanel patientId={...} doctorId={doctorId} token={token} layout="desktop">` — same as the appointment cockpit. Walk-in handling is N/A here (the page doesn't render for a non-existent patient).

### Right rail

- [ ] **Latest visit card:** shows date + modality + status + a "Open visit" link to the appointment cockpit.
- [ ] **Open episodes:** if the patient has chronic-condition episodes / open follow-ups.
- [ ] **Allergy clash banner:** if any allergy could clash with the latest sent Rx (use existing `AllergyClashBanner` data path).
- [ ] **Quick actions:** `Send a message`, `Schedule follow-up`.

### Behavior preservation

- [ ] Existing patient-list deep-links continue to work.
- [ ] Auth + 401/403/404 error states preserved verbatim from the existing page.
- [ ] No regression in patient lookup.

### General

- [ ] Type-check + lint clean.
- [ ] No console errors.
- [ ] Mobile breakpoints verified.
- [ ] Token-only colors.

---

## Out of scope

- **Rx writing on the patient page.** Per K3 — Rx is appointment-bound. The page can have a "Latest sent Rx" read-only summary; new Rx requires opening an appointment.
- **Cross-patient bulk operations.** Out of this batch.
- **Patient merge.** V2; kebab item shows disabled.
- **Audit log viewer.** Kebab links to existing surface; no new viewer.
- **Mobile bottom-pill UX.** Patient page doesn't need it (no active room running).

---

## Files expected to touch

**New (lane δ):**
- `frontend/components/patients/PatientCockpit.tsx` — the client island that owns the 3-zone layout + tabs + rail. (~250 LOC)
- Possibly `frontend/components/patients/PatientCockpitHeader.tsx` if the markup is large enough to extract.

**Modified:**
- `frontend/app/dashboard/patients/[id]/page.tsx` — strip the existing layout; mount `<PatientCockpit>`.

**Reuse from unstaged tree (already in your `?? frontend/components/patients/...` block):**
- `PatientDetailRail.tsx`, `PatientVisitsTimeline.tsx`, `PatientConversationsList.tsx`. If these already exist, mount them inside the new tabs / rail. **Verify before re-implementing**: `ls frontend/components/patients/`.

**Deleted:** none.

**Backend / migrations:** none.

---

## Notes / open decisions

1. **Why mirror visually but diverge functionally.** Same chart rail + 3-zone grid means the doctor's spatial memory transfers. But the right column is a passive summary — not an Rx editor — because there's no active appointment.
2. **Why tabs here but not on the appointment cockpit.** The patient page IS navigation between three read-mostly surfaces (visits / conversations / files). The appointment cockpit is one workflow at a time. Different content shapes, different IA.
3. **Should the patient page have a state machine?** No. There's no consultation in progress; states like `live / lobby` don't apply.
4. **What if `patient_id` doesn't exist?** Existing 404 from `getPatientById` — preserve.

---

## References

- **Batch plan:** [plan-cockpit-redesign-batch.md § Lane δ](../plan-cockpit-redesign-batch.md#lane-δ--patient-page-1-task-5h-parallel-after-cockpit-1)
- **Hard dep:** [task-cockpit-1-state-machine.md](./task-cockpit-1-state-machine.md) (read-only consumer)
- **Visual pattern source:** [task-cockpit-2-shell.md](./task-cockpit-2-shell.md)
- **Reuses:** `PatientChartPanel`, components in unstaged `frontend/components/patients/` if present.
- **Sibling batch's surface this complements:** the now-cockpit appointment page.

---

**Owner:** TBD  
**Created:** 2026-05-06  
**Status:** Shipped (2026-05-06).
