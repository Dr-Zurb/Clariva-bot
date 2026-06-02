# Task csf-05: Add `?v1=1` kill-switch to revert to legacy 3-pane layout

## 19 May 2026 — Batch [Cockpit shell flip — Phase 2 foothold](../plan-cockpit-shell-flip-batch.md) — Wave 3, Lane α step 1 — **XS, ~45min**

---

## Task overview

The Strangler Fig pattern (DL-1) needs a fallback path. After csf-04 ships, doctors who hit a regression in the new 8-pane layout need a way to revert to the legacy 3-pane layout without a deploy. `?v1=1` on the URL is the kill-switch.

This task wires:

1. Server component reads `searchParams.v1`; when `=== '1'`, passes `legacyShape={true}` to `<PatientProfilePage>`.
2. `<PatientProfilePage>` accepts a new optional prop `legacyShape?: boolean` (default `false`); when `true`, the factory hook is short-circuited and `legacyBuiltInPanes` (kept around by csf-04) is mounted instead.
3. A capture-inbox line for Phase 3 close-out: "delete `legacyBuiltInPanes` and the `?v1=1` reader after the 4-week soak (promoted from csf-05, 2026-05-19)".

After this task:

- `/dashboard/appointments/[id]` → 8-pane layout.
- `/dashboard/appointments/[id]?v1=1` → legacy 3-pane layout.
- Removing `?v1=1` and refreshing returns to the 8-pane.
- The `docs/Work/capture/inbox.md` follow-up exists for Phase 3 cleanup.

This task is the predecessor pattern from ppr-14 — same shape, same 4-week soak window.

**Estimated time:** ~45min (15min for the server component param read, 15min for the prop wiring + short-circuit, 15min for the capture-inbox + smoke).

**Status:** Done.

**Hard deps:** csf-04 (the legacy array is named `legacyBuiltInPanes`; the factory hook exists).

**Source:** [plan-cockpit-shell-flip-batch.md § DL-1 + Wave 3](../plan-cockpit-shell-flip-batch.md#decision-lock-frozen-for-batch-duration), ppr-14's `?v1=1` precedent.

---

## Model & execution guidance

**Recommended model:** **Composer 2 Fast**. This is the canonical Composer task: 3 small file edits (server component, page component, capture-inbox), zero novel patterns, zero AI judgement calls.

**New chat?** **No** — Composer 2 Fast can run in the same chat as csf-04 if csf-04's chat is still active. Otherwise yes (fresh).

**Pre-load (if fresh chat):**

- This task file.
- `frontend/app/dashboard/appointments/[id]/page.tsx` (the route that gains the `searchParams.v1` reader).
- post-csf-04 — `frontend/components/patient-profile/PatientProfilePage.tsx` (the consumer that gains `legacyShape`).
- `docs/Work/capture/inbox.md` (the follow-up file).
- The ppr-14 task file for the `?v1=1` precedent (browse `docs/Work/Daily-plans/May 2026/13-05-2026/patient-profile-shell-rebuild/Tasks/` for the matching task).

**Estimated turns:** 1–2 turns.

---

## Acceptance criteria

### Step 1 — Server component reads `searchParams.v1`

- [x] In `frontend/app/dashboard/appointments/[id]/page.tsx`, update the page component's signature to accept `searchParams: { v1?: string }` (or whatever Next.js 15 type the file already uses for searchParams).
- [x] Compute `const legacyShape = searchParams?.v1 === '1';`.
- [x] Pass `legacyShape={legacyShape}` to `<PatientProfilePage>`.

### Step 2 — Page component accepts `legacyShape` prop

- [x] In `frontend/components/patient-profile/PatientProfilePage.tsx`, add `legacyShape?: boolean` (default `false`) to the component's props interface.
- [x] In the `panesToMount` `useMemo` (added by csf-04), add a short-circuit at the top:
  ```tsx
  const panesToMount = useMemo(() => {
    if (legacyShape) {
      // Kill-switch: render the pre-csf-04 layout. Phase 3 deletes this branch.
      return showChart ? legacyBuiltInPanes : legacyBuiltInPanes.filter(p => p.id !== 'chart');
    }
    if (!showChart) {
      return legacyBuiltInPanes.filter(p => p.id !== 'chart');
    }
    return telemedVideoTemplate;
  }, [legacyShape, showChart, legacyBuiltInPanes, telemedVideoTemplate]);
  ```

### Step 3 — Capture-inbox line

- [x] Append one line to `docs/Work/capture/inbox.md`:
  ```
  - [ ] Phase 3 close-out: delete `legacyBuiltInPanes` array and the `?v1=1` reader in `frontend/app/dashboard/appointments/[id]/page.tsx` + `frontend/components/patient-profile/PatientProfilePage.tsx` after the 4-week soak window. Promoted from csf-05 (2026-05-19) — see `docs/Work/Daily-plans/May 2026/19-05-2026/cockpit-shell-flip/Tasks/task-csf-05-v1-kill-switch.md`.
  ```

### Step 4 — Tsc + lint + smoke

- [x] `pnpm --filter frontend tsc --noEmit` clean (pre-existing `VoiceConsultRoom.tsx` TS1355 unrelated to csf-05; modified files typecheck).
- [x] `pnpm --filter frontend lint` clean (`next lint` on touched files — no warnings).
- [ ] Open `/dashboard/appointments/[id]` (no query string) — 8-pane layout renders. *(manual smoke)*
- [ ] Navigate to `/dashboard/appointments/[id]?v1=1` — legacy 3-pane chart/body/rx layout renders. *(manual smoke)*
- [ ] Remove `?v1=1` (back-button or direct URL) — 8-pane returns. *(manual smoke)*
- [ ] Open `/dashboard/appointments/[id]?v1=1` for a walk-in appointment — legacy 2-pane horizontal layout renders (chart pane filtered out, same as no-kill-switch walk-in path). *(manual smoke)*
- [ ] No console errors on any of the four cases. *(manual smoke)*

---

## Out of scope

- **A `?v2=1` toggle to FORCE the new layout** even when a future Phase 3 has already deleted the kill-switch. Won't happen — Phase 3 deletes both branches; the new layout becomes the only path.
- **Telemetry on kill-switch usage.** csf-06 owns the telemetry (single mount event). If a separate event for `?v1=1` hits is needed, capture-inbox a follow-up.
- **An admin-level kill-switch** (e.g., a remote feature flag). The URL param is sufficient for the 4-week soak.
- **A doctor-settings flag to default to legacy layout.** Won't happen — doctors with regressions can use `?v1=1` until the regression is fixed.

---

## Files expected to touch

**Modified:**

- `frontend/app/dashboard/appointments/[id]/page.tsx` — read `searchParams.v1`, pass `legacyShape` (~5 LOC delta).
- `frontend/components/patient-profile/PatientProfilePage.tsx` — accept prop, short-circuit factory (~5 LOC delta).
- `docs/Work/capture/inbox.md` — one new line.

---

## Notes / open decisions

1. **Why URL-param and not localStorage?** URL-param is per-request, easy to share in a Slack message ("hit `?v1=1` to test the regression"), easy to revoke. localStorage would persist across sessions and be invisible to support staff.

2. **Why `?v1=1` and not `?legacy=true`?** Matches the ppr-14 precedent. Future cockpit kill-switches in this style stay consistent.

3. **What if the kill-switch usage spikes?** csf-06 captures the telemetry event for the new layout. If usage of `?v1=1` is high (>5% of cockpit visits over a week), prioritise the regression-fix follow-ups before deleting in Phase 3. The 4-week window is a target, not a deadline.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Source decisions:** [plan-cockpit-shell-flip-batch.md § DL-1](../plan-cockpit-shell-flip-batch.md#decision-lock-frozen-for-batch-duration), ppr-14's `?v1=1` precedent.
- **Wave gate:** [`EXECUTION-ORDER-cockpit-shell-flip.md` § Wave 3 gate](./EXECUTION-ORDER-cockpit-shell-flip.md#wave-3-gate-after-csf-04--csf-05).
- **Predecessor:** [`task-csf-04-production-cutover.md`](./task-csf-04-production-cutover.md).
- **Successor:** [`task-csf-06-verification-and-close-out.md`](./task-csf-06-verification-and-close-out.md).

---

**Owner:** TBD  
**Created:** 2026-05-19  
**Status:** Done
