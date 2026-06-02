# Task cockpit-4: Header redesign + modality split button + delete the 4 tabs

## 06 May 2026 — Batch [Cockpit redesign](../plan-cockpit-redesign-batch.md) — Lane α step 3 — **M, ~4h**

---

## Task overview

Replaces the current page header (back link + h1 + status badge + meta strip + duplicated "Visit details" right card) with a consolidated cockpit header. The header lives **inside** `ConsultationCockpit` from this task on (cockpit-2 left it in the server page; cockpit-4 absorbs it).

Header anatomy:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ← Back · Patient name · status · meta strip                                 │
│                                            [Modality CTA ▾]   [⋯ kebab]    │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Modality CTA** — state-driven label (`Start consult` / `Resend join link` / `End consult` / `Send follow-up Rx` / `Reschedule`). At `ready`, it's a `DropdownMenu` split button: clicking the main label uses booked modality; the chevron opens `Text / Voice / Video`.
- **Kebab** — `Mark completed`, `Cancel appointment`, `Reschedule`, `Copy patient phone`, `View conversation` (when session row exists). Today these are scattered across the Consult tab and the right Visit-details aside.

After this task, **`<AppointmentDetailWorkArea>` is deleted**. The 4 page-level tabs are gone for good.

**Estimated time:** ~4h. ~3.5h Sonnet impl, ~30min Composer for the file delete + import audit.

**Status:** Shipped (2026-05-06).

**Hard deps:** [cockpit-3](./task-cockpit-3-state-panes.md) shipped (state branches working; safe to delete the old work-area).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**. Pure UI replacement — pattern is now established.

**No Opus design call needed.** The state machine handles the CTA logic; the header is a styled flex container with a `DropdownMenu` and `Button`.

**New chat?** **Yes — fresh Sonnet chat.** Pre-load: this task file + cockpit-3's `ConsultationCockpit.tsx` + the existing page header in `app/dashboard/appointments/[id]/page.tsx`.

**Composer turn at the end:** the file delete + import audit (`<AppointmentDetailWorkArea>` no longer imported anywhere) is a Composer task. Cut the Sonnet chat after the header lands; open a Composer chat with: *"Delete `frontend/components/consultation/AppointmentDetailWorkArea.tsx`. Audit imports — there should be zero remaining. Run `cd frontend && npx tsc --noEmit` to confirm."*

**Multi-chat coordination:** none. By the time cockpit-4 runs, β / γ / δ are independent.

---

## Acceptance criteria

### Header structure

- [ ] New component `frontend/components/consultation/cockpit/CockpitHeader.tsx`. Mounts at the top of `ConsultationCockpit`, **above** the 3-column grid (full-width sticky header at `top-0` with `bg-background/80 backdrop-blur` for the cockpit; respects the global header's z-index).
- [ ] Left side:
  - `← Back to appointments` link (uses A1 token classes).
  - `<h1>` patient name (Link to `/dashboard/patients/<id>` if `patient_id`).
  - Status `<Badge>` (preserve the D1 status-class mapping).
  - Meta strip below: `phone · datetime · duration · modality icon` (small text, muted).

- [ ] Right side:
  - **Modality CTA** (state-aware, see table below).
  - **`⋯` kebab** with `<DropdownMenu>` (already in `components/ui/dropdown-menu.tsx`).

### Modality CTA — state-driven

| state | CTA label | onClick | Split? |
|---|---|---|---|
| `ready` | `Start consult` (default booked modality) | calls into the launcher's start handler for the picked modality | Yes — split button: chevron opens `{ Text, Voice, Video }`; picking changes booked modality + starts |
| `lobby` | `Resend join link` | calls launcher's `handleResendLink` | No |
| `live` | `End consult` | requires confirmation modal; calls existing end-call flow | No (red-destructive variant) |
| `ended` | `Send follow-up Rx` | scrolls focus to the Rx pane and starts a new draft | No |
| `terminal` | `Reschedule` | opens existing reschedule flow / book affordance | No |

- [ ] CTA derivation uses the `primaryCtaFor(state, modality)` helper from cockpit-1 — match the labels exactly.
- [ ] At `ready` with split button, the dropdown disables modalities the doctor can't actually use (e.g. text consult disabled if patient phone is missing — match existing `ConsultationLauncher` gating).
- [ ] At `live`, clicking `End consult` opens a confirm modal — reuse `EndCallConfirmModal` from `frontend/components/consultation/EndCallConfirmModal.tsx`.

### Kebab menu

- [ ] Reuses `<DropdownMenu>` primitive. Items:
  - `Mark completed` (when state ∈ `live | ended` AND not already `completed`) → mounts existing `<MarkCompletedForm>` in a `<Sheet>` (see Notes #2).
  - `Cancel appointment` (when state ∈ `ready | lobby`).
  - `Reschedule` (always — except `terminal` where it's the primary CTA).
  - `Copy patient phone` (always when phone known).
  - `View conversation` (when session row exists) → `/dashboard/appointments/<id>/chat-history`.
  - `View visit details` → opens a small popover with booking source / IG handle / reason text (replaces the deleted right "Visit details" card).

### Page edits

- [ ] `frontend/app/dashboard/appointments/[id]/page.tsx` — strip the page header markup (back link, h1, status badge, meta strip) since it now lives inside `ConsultationCockpit`. Page is reduced to: auth + fetch + error states + `<ConsultationCockpit>` mount. Should drop ~80 LOC.
- [ ] **Delete** `frontend/components/consultation/AppointmentDetailWorkArea.tsx`. Verify nothing imports it (`rg "AppointmentDetailWorkArea"`).

### Behavior preservation

- [ ] Every existing CTA still reachable: Start, Resend link, End call, Mark completed, Reschedule, Cancel, Copy phone, View conversation, View visit details.
- [ ] Status badge color mapping preserved.
- [ ] Page-level deep links (`/dashboard/appointments/<id>` with no tab param) still work — they always did; the cockpit doesn't use `?tab=`.
- [ ] D1's `?tab=consult` deep links from outside the app continue to work? **No — `?tab=` is dropped** since tabs are gone. The redirect strategy: if `?tab=` is present in the URL on first paint, strip it via `router.replace(pathname, { scroll: false })` to keep clean URLs. Add a TODO comment for the email-template / dashboard-event redirect audit.

### General

- [ ] Type-check + lint clean.
- [ ] Mobile breakpoints verified.
- [ ] No console errors.
- [ ] Token-only colors.

---

## Out of scope

- **Mobile bottom-pill UX.** That's cockpit-7.
- **Patient page header.** That's cockpit-8 (mirrors this pattern).
- **`PrescriptionPreSendCheck` integration.** Lives in lane β.
- **Modality switching mid-call.** Already covered by `ModalityChangeLauncher` inside `LiveConsultPanel`; cockpit-4 does NOT add a second switcher.
- **A "Send Rx" button in the header.** Per K1 — Rx send happens from the Rx pane's sticky action bar (cockpit-5), not from the header.

---

## Files expected to touch

**New:**
- `frontend/components/consultation/cockpit/CockpitHeader.tsx` (~200 LOC)

**Modified:**
- `frontend/app/dashboard/appointments/[id]/page.tsx` — strip page header, mount cockpit only.
- `frontend/components/consultation/ConsultationCockpit.tsx` — wire `<CockpitHeader>` above the grid.

**Deleted:**
- `frontend/components/consultation/AppointmentDetailWorkArea.tsx` (after import audit).

**Backend / migrations:** none.

---

## Notes / open decisions

1. **Sticky header positioning.** The dashboard shell already has its own top header (search bar, profile bell). Cockpit header is a **second sticky** below it — at `top-14` with the global header at `top-0`. Verify no z-index fight; both header layers should use the same `z-30 / z-40` convention from A1.
2. **`<MarkCompletedForm>` lives in a Sheet from this task on.** Today it's a card inside the Consult tab. Moving it into a kebab → sheet keeps the cockpit clean. The form component itself is unchanged.
3. **Why "End consult" instead of "Mark completed" at `live`.** Two different actions: ending the call hangs up the room; marking completed transitions the appointment to `completed`. The kebab keeps both visible; the primary CTA prefers `End consult` (the thing the doctor needs in the moment).
4. **Why the kebab over a row of icon buttons.** Doctors will use Mark completed / Reschedule / Cancel rarely. Hiding them in the kebab keeps the header readable. Add tooltips on the kebab so the affordance is discoverable.

---

## References

- **Batch plan:** [plan-cockpit-redesign-batch.md § Lane α](../plan-cockpit-redesign-batch.md#lane-α--cockpit-core-4-tasks-14h-sequential)
- **Hard dep:** [task-cockpit-3-state-panes.md](./task-cockpit-3-state-panes.md)
- **State helper:** `frontend/lib/consultation/cockpit-state.ts` (cockpit-1)
- **Existing surfaces reused:** `MarkCompletedForm`, `EndCallConfirmModal`, kebab uses `DropdownMenu` primitive.

---

**Owner:** TBD  
**Created:** 2026-05-06  
**Status:** Shipped (2026-05-06).
