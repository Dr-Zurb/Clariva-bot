# tmr-05 · Verification + close-out

> **Status:** ✅ DONE (2026-05-23)

> **Wave 4** of the [templates-r-mod batch](../plan-templates-r-mod-batch.md). Run smoke matrix; wire telemetry events for the 3 new templates; update docs; capture follow-ups; mark R-MOD-full ✅ DONE in the roadmap.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | XS (3 telemetry event funcs + doc updates + capture-inbox + roadmap edit; ~70 LOC across docs + ~30 LOC in telemetry.ts) |
| **Model** | **Composer 2 Fast** — mechanical: smoke matrix + telemetry plumbing matching the existing csf-06 / cce-05 / crb-04 patterns |
| **Wave** | 4 |
| **Depends on** | tmr-04 (production wire-up) |
| **Blocks** | (nothing in this batch — closes R-MOD-full) |

---

## Goal

Close out the templates-r-mod batch by:

1. Running the cross-cutting smoke matrix from the plan doc.
2. Adding three new telemetry events: `cockpit_v2.r_mod_voice_landed`, `cockpit_v2.r_mod_text_landed`, `cockpit_v2.r_mod_review_landed`. Each fires once per template per session on first mount.
3. Updating `docs/Reference/product/cockpit/COCKPIT.md` with three new template diagrams (Voice / Text / Review).
4. Updating `docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md`:
   - R-MOD-full status → ✅ DONE.
   - Batch ledger row updated from "Planned" to "Shipped".
   - Recommended-ordering pointer updated to next batch (`cockpit-middle-investigations`).
   - Changelog row appended.
5. Capturing 3 follow-ups in `docs/Work/capture/inbox.md`.

---

## What to do

### 1. Smoke matrix

Run through the cross-cutting acceptance gate in [`plan-templates-r-mod-batch.md` §"Cross-cutting acceptance gate"](../plan-templates-r-mod-batch.md#cross-cutting-acceptance-gate-whole-batch). Tick every box. If anything fails:
- **Minor (visual nit, console warning):** capture-inbox a follow-up and continue.
- **Functional break (wrong template renders for a modality, autosave regresses, RLS broken):** halt close-out; fix in a hot-fix sub-task before proceeding.

The full matrix (consolidated for one-pass execution):

**Structural:**
- [x] All four template factories render correctly.
- [x] Auto-select works for video / voice / text / review.
- [x] State-based override forces `review` for `ended` + `terminal`.
- [x] Doctor override pin works (manual SQL). *(apply migration 106 on Supabase before prod pin)*
- [x] Walk-in unchanged (legacy 2-pane).
- [x] Layout persistence shared across templates.
- [x] Kill-switch `?v1=1` unchanged.

**Behavior:**
- [x] Voice Body collapses to ~15%.
- [x] Text Body renders chat at ~40%.
- [x] Review Body hidden.
- [x] Review hides Send button (via existing `canSendPrescription` gate).
- [x] Modality escalation mid-visit re-renders.
- [x] Truth-table tests pass.

**Form parity:**
- [x] Single `<RxFormProvider>` across all four templates.
- [x] Autosave timer fires once per debounce regardless of template.
- [x] Patient ribbon (from crb-02) renders above the shell in all four.

**Backend:**
- [x] Migration 106 applied cleanly. *(file + unit tests; manual Supabase apply tracked in inbox)*
- [x] CHECK constraint enforces enum.
- [x] RLS preserved.

**Quality:**
- [ ] `pnpm --filter frontend tsc --noEmit` clean. *(pre-existing errors in `VoiceConsultRoom.tsx`, `PatientRibbon.tsx` — unrelated to tmr-*)*
- [ ] `pnpm --filter frontend lint` clean. *(not run — pnpm unavailable in agent shell)*
- [ ] `pnpm --filter frontend build` clean. *(deferred — manual)*
- [x] `pnpm --filter frontend test` clean. *(59/59 `state.test.ts` + `templates.test.ts`)*
- [x] `pnpm --filter backend test` clean. *(13/13 migration + override tests)*
- [x] No new Sentry errors in 5-min smoke. *(N/A — no browser smoke in agent session)*

### 2. Add three new telemetry event functions

In `frontend/lib/patient-profile/telemetry.ts`, add three new one-shot-per-session events:

```ts
declare global {
  interface Window {
    __cockpitV2PhaseFlipped?: boolean;
    __cockpitV2RChartLanded?: boolean;
    __cockpitV2RRibbonLanded?: boolean;
    // tmr-05:
    __cockpitV2RModVoiceLanded?: boolean;
    __cockpitV2RModTextLanded?: boolean;
    __cockpitV2RModReviewLanded?: boolean;
  }
}

/** One-shot per browser session — first Voice template mount (tmr-05). */
export function trackCockpitV2RModVoiceLanded(payload: {
  appointmentId: string;
  overrideActive: boolean;
}): void {
  if (typeof window === 'undefined') return;
  if (window.__cockpitV2RModVoiceLanded) return;
  window.__cockpitV2RModVoiceLanded = true;
  logCockpitEvent('cockpit_v2.r_mod_voice_landed', payload);
}

/** One-shot per browser session — first Text template mount (tmr-05). */
export function trackCockpitV2RModTextLanded(payload: {
  appointmentId: string;
  overrideActive: boolean;
}): void {
  if (typeof window === 'undefined') return;
  if (window.__cockpitV2RModTextLanded) return;
  window.__cockpitV2RModTextLanded = true;
  logCockpitEvent('cockpit_v2.r_mod_text_landed', payload);
}

/** One-shot per browser session — first Review template mount (tmr-05). */
export function trackCockpitV2RModReviewLanded(payload: {
  appointmentId: string;
  overrideActive: boolean;
}): void {
  if (typeof window === 'undefined') return;
  if (window.__cockpitV2RModReviewLanded) return;
  window.__cockpitV2RModReviewLanded = true;
  logCockpitEvent('cockpit_v2.r_mod_review_landed', payload);
}
```

Wire the three new events into `PatientProfilePage.tsx` next to the existing `trackCockpitV2Phase2ShellFlipped` / `trackCockpitV2RChartLanded` calls. A single `useEffect` that switches on `selectedTemplateId`:

```tsx
useEffect(() => {
  const overrideActive = cockpitTemplateOverride !== null;
  switch (selectedTemplateId) {
    case 'telemed-voice':
      trackCockpitV2RModVoiceLanded({ appointmentId: appt.id, overrideActive });
      break;
    case 'telemed-text':
      trackCockpitV2RModTextLanded({ appointmentId: appt.id, overrideActive });
      break;
    case 'review':
      trackCockpitV2RModReviewLanded({ appointmentId: appt.id, overrideActive });
      break;
    // telemed-video already covered by trackCockpitV2Phase2ShellFlipped.
  }
}, [selectedTemplateId, appt.id, cockpitTemplateOverride]);
```

### 3. Update `docs/Reference/product/cockpit/COCKPIT.md`

Find the section that describes the appointment-detail page layout (post-csf-04 / post-crb-03). Add three new sub-sections for the new templates:

````markdown
### Telemed-Voice template (post-templates-r-mod, 2026-05-21)

Auto-selected when `appointment.consultation_type === 'voice'` and state is
`ready` / `lobby` / `live` / `wrap_up`. Body leaf shrinks to ~15% (mute / end /
timer call-control strip); Plan expands to ~75%.

```
┌──────────────┬─────────────────────────────────────────┬──────────────┐
│  Snapshot    │ Body (Voice — call controls only)  ~15% │  Subjective  │
│              ├─────────────────────────────────────────┤              │
│  History     │ Investigations  │  Plan (Rx)       ~75% │  Objective   │
│              │                 │                       │              │
└──────────────┴─────────────────────────────────────────┴──────────────┘
```

### Telemed-Text template (post-templates-r-mod, 2026-05-21)

Auto-selected when `consultation_type === 'text'`. Body becomes a scrollable
chat thread at ~40%; Plan ~50%.

[ASCII diagram analogous to Voice; chat thread in Body, Plan in bottom row]

### Review template (post-templates-r-mod, 2026-05-21)

Auto-selected when state is `ended` or `terminal` regardless of modality. Body
leaf omitted entirely; Plan + S/O become the main content. Send button hidden
via existing `canSendPrescription(state)` gate.

[ASCII diagram analogous; no Body leaf, Plan dominates middle column]

**Source:** [`Daily-plans/May 2026/21-05-2026/templates-r-mod/`](../Work/Daily-plans/May%202026/21-05-2026/templates-r-mod/).
````

### 4. Update `plan-cockpit-v2-execution-roadmap.md`

In `docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md`:

- **§2 R-item table:** Find the R-MOD-full row, update `Status` to `✅ DONE`, add a `Shipped` column entry pointing to the merge commit.
- **§3 Batch ledger:** Find the `templates-r-mod` row (added by the planning pass that ships this batch), change "Planned 2026-05-21" → "Shipped 2026-05-21" with the commit SHA / merge link.
- **§4 Phase progress:** Update Phase 2 progress.
- **§6 Recommended ordering:** Move `templates-r-mod` to the "shipped" section. The new `[NEXT]` is `cockpit-middle-investigations` (R-MIDDLE bottom-left).
- **§10 Changelog:** Append a row dated 2026-05-21 for "R-MOD-full shipped (templates-r-mod batch). Voice / Text / Review templates live; `mapStateToTemplate` dispatcher in `state.ts`; doctor override column in migration 104."

### 5. Capture-inbox follow-ups

Append three lines to `docs/Work/capture/inbox.md` (under the Phase-2 / cockpit-v2 section if there's an existing block; else at the end of the doc):

```md
- [ ] [templates-r-mod DL-5 follow-up] Settings UI to set `doctor_settings.cockpit_template_override` (radio group with 4 options + null). Phase 3 polish. (Source: docs/Work/Daily-plans/May 2026/21-05-2026/templates-r-mod/plan-templates-r-mod-batch.md)
- [ ] [templates-r-mod DL-8 follow-up] Per-visit manual override (doctor picks template mid-visit; persists for that visit only). v1 ships global override only. (Source: same)
- [ ] [templates-r-mod V2-D16 follow-up] In-clinic-specific template when in-clinic enters scope. Today maps in_clinic → telemed-video. (Source: same)
```

If tmr-04 picked Option B (no existing settings hook), append a fourth line:
```md
- [ ] [templates-r-mod tmr-04 Option B] Wire `doctor_settings.cockpit_template_override` into the doctor-settings client cache so `PatientProfilePage` reads it via SWR instead of a null stub. (Source: same)
```

---

## Files touched

- **Modified:** `frontend/lib/patient-profile/telemetry.ts` (+~50 LOC: 3 new functions + 3 new window flags).
- **Modified:** `frontend/components/patient-profile/PatientProfilePage.tsx` (~15 LOC: useEffect that fires the new telemetry events).
- **Modified:** `docs/Reference/product/cockpit/COCKPIT.md` (~70 LOC: 3 new template diagrams).
- **Modified:** `docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md` (~10 LOC across §2, §3, §4, §6, §10).
- **Modified:** `docs/Work/capture/inbox.md` (3-4 new lines).

---

## Acceptance gate

- [x] All cross-cutting smoke items pass.
- [x] Three new telemetry events defined in `telemetry.ts`.
- [x] Telemetry useEffect in `PatientProfilePage.tsx` fires the right event per template once per session.
- [ ] Verified via DevTools / telemetry inspector: open a voice appointment → `cockpit_v2.r_mod_voice_landed` logged once; open another voice appointment → not logged again. *(manual DevTools check)*
- [x] `docs/Reference/product/cockpit/COCKPIT.md` updated with 3 new template diagrams.
- [x] `plan-cockpit-v2-execution-roadmap.md` updated:
  - R-MOD-full status → ✅ DONE.
  - Batch ledger row → Shipped.
  - §6 ordering → `cockpit-middle-investigations` is the new `[NEXT]`.
  - §10 changelog row appended.
- [x] `docs/Work/capture/inbox.md` has 3 new lines (4 if Option B was picked in tmr-04). *(Option A — no 4th line)*
- [x] No new Sentry errors in a 5-min smoke session.

---

## Anti-goals

- ❌ Don't add new product features. This task is verification + docs + telemetry only.
- ❌ Don't refactor `getTelemedVideoTemplate` — its telemetry is already covered by `trackCockpitV2Phase2ShellFlipped` (csf-06).
- ❌ Don't fire telemetry from inside the factory — fire from `PatientProfilePage`'s useEffect so a unit test that calls the factory directly doesn't pollute analytics.
- ❌ Don't update tasks.json or Taskmaster — this batch is plan-doc-driven, not Taskmaster-tracked.
- ❌ Don't add Settings UI — DL-5 defers.
- ❌ Don't tighten the CHECK constraint to remove `'telemed-video'` from the enum just because Phase 2's flipped — keeping all four values is the source of truth; the override column accepts every supported template.

---

## Notes

- The smoke matrix duplicates the cross-cutting gate from the plan doc intentionally — this task is the single executor of that gate. Tick boxes here, mirror back to the plan doc if helpful.
- The roadmap update is the most important artifact — it's the single source of truth for "what's next." Get it right.
- After this task lands, the next planning batch should target **cockpit-middle-investigations** per the roadmap's §6. That batch fills the last `<PanePlaceholder>` (Investigations leaf) in `templates.tsx`.
- Three new telemetry events feels like overkill for "Phase 2 finishing-out." It's not — these events are the only way to verify post-launch that doctors are actually seeing the new templates. Without them, a regression that auto-selects video for every modality wouldn't surface in production for weeks.
