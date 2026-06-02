# Task cp-09: `<CockpitHeader>` — two-row patient identity layout

## 09 May 2026 — Batch [Cockpit polish](../plan-cockpit-polish-batch.md) — Phase 4, Lane ε step 0 — **M, ~4h**

---

## Task overview

The current `<CockpitHeader>` renders patient name, MRN, phone, modality, scheduled time, and OPD token all on a single visual row in similar weight. The doctor wastes scan-time finding the name; demographics (age/sex) are missing entirely.

This task restructures the header into a **two-row patient identity block** that matches the `OpdQueueDenseRow` style precedent from the 08-05-2026 batch:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ [< Back]  Ravi Sharma   42 / M                                          [CTA]   │  ← Row 1: name + age/sex (prominent)
│           MRN-00123 · +91 98765 43210 · Video · 10:30 AM · #4                   │  ← Row 2: secondary metadata (small/muted)
│           [Mark no-show]  ← cp-05 lands here when state === ready                │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Row 1** carries the doctor's primary scan target: who is this patient, what's their broad demographic context. **Row 2** carries the operational metadata the doctor occasionally needs: the chart link (MRN), the way to reach the patient if disconnected (phone), the modality + scheduled time + token for queue context. Below `lg` breakpoint, row 2 collapses to a single truncated line with overflow tooltip.

This task also cleans up the dead `case "draft-followup":` arm that cp-04 left behind in `handlePrimaryClick` (cp-04 noted this as deferred-to-cp-09 cleanup).

**Estimated time:** ~4h. The biggest task in the batch — full layout rewrite + responsive design + the integration point for cp-05.

**Status:** Pending.

**Hard deps:** none. **Soft dep:** cp-08 — once that ships, the graceful-fallback `appt.patient_age && \`/${appt.patient_sex}\`` displays real data. Until then, row 1 just renders name without the demographics chip, which is fine.

**Source:** [plan-cockpit-polish-batch.md § CP-D7](../plan-cockpit-polish-batch.md#decision-lock-locked-2026-05-09-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh chat. Pre-load:
- This task file.
- `frontend/components/consultation/cockpit/CockpitHeader.tsx` (the file to rewrite).
- `frontend/components/opd/OpdQueueDenseRow.tsx` (read-only — the two-row pattern precedent from the OPD queue batch).
- `frontend/types/appointment.ts` (read-only — for the `patient_age` + `patient_sex` fields, with graceful fallback if cp-08 hasn't shipped).
- `frontend/lib/consultation/cockpit-state.ts` (read-only — for the CTA mapping after cp-04's edits).

**Estimated turns:** 3–4 turns (component scaffolding + responsive polish + lint cleanup).

---

## Acceptance criteria

### Layout structure

- [ ] The header renders **two rows** when `state !== "terminal"`. Terminal renders a single subdued row (no point in the prominent identity strip when the appointment is cancelled / no-show).
- [ ] **Row 1 (primary, ~16 px)**:
  - Optional back-button on the left (existing — keep the existing `<BackButton>` or equivalent).
  - **Patient name** (`<h1>` — `font-semibold`, `text-base`, `truncate`).
  - **Age/sex chip** to the right of the name — small inline label `"42 / M"` or `"42 / Female"` (full word for longer renders). `text-sm`, `text-muted-foreground`, `font-medium`. Hidden if both `patient_age` and `patient_sex` are null. Format helper:

    ```ts
    function formatDemographics(age: number | null, sex: PatientSex | null): string | null {
      const ageStr = age != null ? `${age} y` : null;
      const sexStr = sex ? sex[0].toUpperCase() : null;  // 'M', 'F', 'O'
      if (!ageStr && !sexStr) return null;
      if (ageStr && sexStr) return `${ageStr} / ${sexStr}`;
      return ageStr ?? sexStr!;
    }
    ```

    For `< 1 y` use `"< 1 y"`; for newborns specifically `"0 y"` is acceptable. Render as `<span className="ml-2 text-sm text-muted-foreground">{demographics}</span>`.
  - **Primary CTA on the far right** — keep the existing `<Button>` that calls `handlePrimaryClick`. Conditional rendering on `cta` (after cp-04 makes it nullable for `ended`, the button doesn't render in that branch — the `<NextPatientCountdown>` takes over downstream).

- [ ] **Row 2 (secondary, ~12 px)**:
  - `MRN-00123 · +91 98765 43210 · Video · 10:30 AM · #4`
  - Each segment separated by `·` with `mx-1.5 text-muted-foreground/50` between them.
  - Each segment is `text-xs text-muted-foreground`.
  - **MRN segment** is a clickable link to `/dashboard/patients/{patient_id}` (when `patient_id` is non-null). Hover shows full chart-link tooltip.
  - **Phone segment** is a `<a href={`tel:${phone}`}>` (when `phone` is present).
  - **Modality segment** shows the existing `<ConsultationTypeIcon>` + label (e.g. `Video`, `Voice`, `Text`, `In-clinic`).
  - **Scheduled time segment** uses the existing time-formatter helper (e.g. `formatTimeShort(appt.appointment_date)` → `"10:30 AM"`).
  - **OPD token segment** renders `#NN` only when `appt.opd_event_type` is present (queue mode); hidden otherwise.
  - Below `lg` breakpoint: row 2 collapses to a single line. The whole concatenated string truncates with `text-ellipsis`; on hover (or focus), a `<Tooltip>` shows the full unabbreviated content.

### Demographics graceful fallback

- [ ] If `appt.patient_age` and `appt.patient_sex` are both `undefined` or `null` (e.g. backend hasn't shipped cp-07 yet, or the row is a guest appointment), the age/sex chip in row 1 simply doesn't render. Row 1 stays balanced; row 2 isn't affected.
- [ ] After cp-08 ships, the type allows `null | undefined` access to compile; before it ships, use `(appt as any).patient_age` with an inline `// CP-D6: backend ships in cp-07 / types in cp-08` comment **only if** the type doesn't yet have the field. Once cp-08 lands within the same lane δ-BE, drop the cast.

### State-specific rendering rules

- [ ] **`ready`** state: full two-row layout. cp-05 will add a Mark-no-show ghost link to row 2's right end (only when overdue) — leave a `{/* cp-05 mark-no-show ghost link slots in here */}` placeholder comment so cp-05 has a clear landing site.
- [ ] **`live`** state: full two-row layout. Existing in-call-aware widgets (e.g. session timer, mute / camera indicator) render in row 2 alongside the metadata, mirroring today's layout.
- [ ] **`wrap_up`** state: full two-row layout. Primary CTA = `Done with patient` (calls `onFinishVisit`, set up by the WrapUpDialog elimination work earlier today). No demographics change.
- [ ] **`ended`** state: full two-row layout, but **no primary CTA** (cp-04 removed the `Send follow-up Rx` CTA). The right end of row 1 is empty (or hosts a subdued status pill: `<Badge variant="muted">Completed</Badge>`).
- [ ] **`terminal`** state: single subdued row — name + status pill (`Cancelled` / `No-show`). No demographics chip; no row 2.

### Cleanup of cp-04 leftover

- [ ] In `handlePrimaryClick`, the `case "draft-followup":` arm should already be removed by cp-04. Confirm and, if any orphaned code remains, sweep it now.
- [ ] Remove any `import` lines that are no longer needed after cp-04's removals (e.g. `draft-followup` icon import, if any).

### Responsive design

- [ ] **`lg` and up (≥1024 px)**: full two-row layout as described.
- [ ] **`md` (≥768 px, < 1024 px)**: two rows; row 2 truncates with tooltip; modality icon-only (no label).
- [ ] **Below `md` (mobile)**: two rows compress; row 1 keeps name + age/sex chip; row 2 reduces to MRN + token only (drops phone, modality, scheduled — those are on the appointment detail page if needed). Primary CTA may stack below row 1 if there's no horizontal room.
- [ ] Row 2's tooltip is keyboard-focusable for a11y (use the `<Tooltip>` component's keyboard support).

### Tests

- [ ] Add or update snapshot tests for `CockpitHeader` covering each cockpit state. The snapshot bundle should include:
  - `ready` state with full demographics.
  - `ready` state without demographics (null fallback).
  - `live` state.
  - `wrap_up` state.
  - `ended` state (no primary CTA).
  - `terminal` state (single-row subdued layout).
- [ ] Add a unit test for `formatDemographics` covering each combination (both null, age-only, sex-only, both present, age=0).

### Type-check + lint

- [ ] Clean.
- [ ] Visual smoke at the cockpit's three primary breakpoints (`lg` / `md` / mobile) — capture screenshots for the close-gate.

---

## Out of scope

- **Mark-no-show ghost link in `ready` state** — that's `cp-05` (sequenced after this task in lane ε).
- **Two-step `Done with patient` confirm** — already shipped in the WrapUpDialog elimination work earlier today (`handleFinishVisit` + `finishBusy`). This task preserves the existing wiring.
- **Patient detail page redesign** — different surface; out of scope.
- **Backend changes** — `cp-07` owns the demographics widening.
- **Removing the OPD token chip** — keep showing it (queue mode is becoming the dominant flow per the 08-05-2026 batch decisions).

---

## Files expected to touch

**Modified:**
- `frontend/components/consultation/cockpit/CockpitHeader.tsx` (~250 LOC delta — full layout rewrite, two-row composition, responsive breakpoints, demographics formatter, cp-04 leftover cleanup)
- `frontend/components/consultation/cockpit/__tests__/CockpitHeader.test.tsx` (or new test file — ~150 LOC: 6 snapshot test cases + `formatDemographics` unit tests)

**New:** possibly `frontend/lib/consultation/format-demographics.ts` (helper extraction — only if you reuse it elsewhere; otherwise inline).

---

## Notes / open decisions

1. **Why `42 / M` over `42M` or `42-M`?** The `/` separator matches the OpdQueueDenseRow precedent in the 08-05-2026 batch and is the standard medical-chart shorthand. `42M` is too dense; `42-M` reads as a hyphenated word.
2. **What if the patient's age is 0 (newborn)?** Render `0 y` (with the trailing space + unit so it doesn't render as just `0`). For age `< 1`, optionally `< 1 y`. For age `> 100`, render the literal number — supercentenarians exist and "100+ y" is awkward.
3. **What if the gender enum has additional values like `'prefer_not_to_say'`?** Render the first letter or a quiet `—` placeholder. The format helper handles both via the `sex[0].toUpperCase()` / null branch.
4. **Why no avatar / patient photo on the header?** Out of scope. Most clinics don't capture photos at intake; if/when they do, the header will need an additional row layer. Don't pre-empt.
5. **Why have row 2 not just be a long string?** Each segment is interactive (MRN clicks to chart, phone calls). Concatenating into a single string loses that semantic. Use distinct `<span>`s with the `·` separators rendered as inline divs.
6. **Why does `ended` lose the primary CTA but not the layout?** Because the cockpit *body* shows `NextPatientCountdown` in `ended` — the action's already there, just lower in the visual hierarchy. The header is for *identity*, not *action*, in this state.
7. **What about a `Re-open Rx` quiet link in `ended` to satisfy the rare "I need to amend the Rx" case?** Out of scope. cp-04 removed all follow-up-Rx surfaces and the user direction was to keep that surface gone.

---

## References

- **File to rewrite:** `frontend/components/consultation/cockpit/CockpitHeader.tsx`
- **Style precedent (two-row pattern):** `frontend/components/opd/OpdQueueDenseRow.tsx` (after 08-05-2026 batch ships)
- **Demographics fields:** `frontend/types/appointment.ts § Appointment` (after cp-08 ships)
- **CTA mapping (read-only):** `frontend/lib/consultation/cockpit-state.ts § ctaForState` (after cp-04 ships)
- **WrapUpDialog elimination context:** [Daily-plans/May 2026/06-05-2026/Tasks/task-cockpit-4-header.md](../../../06-05-2026/Tasks/task-cockpit-4-header.md) — initial header design (this task supersedes the single-row layout that batch shipped).
- **Counterpart task in lane ε:** [task-cp-05-mark-no-show-ready-header.md](./task-cp-05-mark-no-show-ready-header.md) — adds the Mark-no-show ghost link into the new layout's row 2.

---

**Owner:** TBD
**Created:** 2026-05-09
**Status:** Pending
