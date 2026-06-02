# Templates R-MOD-full — modality templates — 21 May 2026 batch plan

> **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). TL;DR rule #1: **plan with Opus, execute with Auto, polish with Composer**. This batch has **zero Opus tasks** — none of the five tasks meet the hard-rules thresholds (no PHI columns added, no RLS redesign, no novel security; the new `cockpit_template_override` column on `doctor_settings` is a per-doctor preference, not patient data, and reuses the existing doctor-settings RLS policy). Three tasks are Auto; two are Composer 2 Fast (tmr-04 the wire-up, tmr-05 the verification close-out).
>
> **Source plan:** [`Product plans/plan-cockpit-v2.md`](../../../Product%20plans/plan-cockpit-v2.md) §R-MOD (line ~254). R-MOD-full is one of five Phase-2 R-items deferred from the [`cockpit-shell-flip`](../../19-05-2026/cockpit-shell-flip/) batch and the **third-priority** Phase-2 follow-up per the [execution roadmap](../../../Product%20plans/plan-cockpit-v2-execution-roadmap.md) §6.
>
> **Predecessor batches:**
> - [Daily-plans/May 2026/19-05-2026/cockpit-shell-flip](../../19-05-2026/cockpit-shell-flip/) — csf-02 converted the cv2-03 literal into the `getTelemedVideoTemplate(ctx)` factory; this batch adds three sibling factories with the same shape. csf-04 must be merged before tmr-04 (the production wire-up).
> - [Daily-plans/May 2026/17-05-2026/cockpit-v2](../../17-05-2026/cockpit-v2/) — cv2-03 ships the layout literal and `<PanePlaceholder>`; cv2-05 ships `RxFormContext` (the form state every template shares). No changes to either; this batch reads them.
> - [Daily-plans/May 2026/21-05-2026/cockpit-ribbon](../cockpit-ribbon/) — sibling batch; disjoint conflict surface (`PatientProfilePage.tsx` overlap is one mount line near a different region). The two batches can ship in either order; both rebase on `cockpit-shell-flip-cutover`.
> - [backend/migrations/](../../../../../backend/migrations/) — **one new migration**: `104_doctor_settings_cockpit_template_override.sql` adds a single nullable text column to `doctor_settings` reusing the existing RLS policy. Pre-launch → zero data migration risk.
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-templates-r-mod.md`](./Tasks/EXECUTION-ORDER-templates-r-mod.md).

---

## Why this batch

The 8-pane Telemed-Video layout (cockpit-shell-flip) ships as the only modality template. Voice consults, text consults, and read-only review surfaces all currently render with a fat 50%-height video tile in the middle column even when there is no live video feed — burning ~30% of the screen on a static "call ended" placeholder while the doctor writes Plan.

The clinical justification is concrete: per the source plan, "voice consults amplify [the Plan-eye-loop problem]: today voice gets the same 48% body pane as video, wasting ~30% of the screen on a thin call-control surface." The same applies to text and review; the source plan calls them out as load-bearing across all phases.

R-MOD-full ships three new template factories plus the `mapStateToTemplate(state, modality)` dispatcher so the cockpit auto-selects the right layout when the modality is known. The three new factories are:

- **`getTelemedVoiceTemplate(ctx)`** — Body shrinks to ~15% (call-control strip: mute, end, timer). Plan expands to ~75% of column height. Assessment strip unchanged.
- **`getTelemedTextTemplate(ctx)`** — Body becomes a ~40% scrollable chat thread. Plan ~50%. Assessment strip unchanged.
- **`getReviewTemplate(ctx)`** — Body hidden (`naturalSizePct: 0`, `hidden: true` on the leaf — no live channel). Plan + S/O become scrollable read-only. Send button hidden (handled at the leaf level — V2-Q3 lean).

The dispatcher `mapStateToTemplate(state, modality)` lives in `frontend/lib/patient-profile/state.ts` (alongside `deriveCockpitState`). It takes the derived cockpit state plus the appointment's modality and returns the template factory id. A doctor setting (`cockpit_template_override`) can pin a single template globally; null means auto-select per modality + state.

The architectural unlock: **the four template factories share the `TelemedVideoContext` type**. Only the `direction`, `naturalSizePct`, and the Body leaf's `render` differ. tmr-01 extracts shared leaf renderers (e.g., the Snapshot, History, Subjective, Objective renderers) into a single helper and the four factories compose them — no duplicated leaf creation logic.

This batch closes R-MOD-full with **5 tasks across 4 waves**, **~12-16h wall-clock single-engineer (~2 dev-days)**, **one new migration (104)**, **zero Opus tasks**. The visible artifact at the close-gate is `/dashboard/appointments/[id]` auto-selecting the right template based on the appointment's `consultation_type`, plus a Settings UI checkbox (deferred — see Out-of-scope) for the override.

---

## Decision lock (frozen for batch duration)

These match the planning conversation locked 2026-05-21. Re-opening any belongs in a new batch.

**DL-1: All four templates share one factory file (`templates.tsx`).** No separate `templates-voice.tsx` / `templates-text.tsx` files. Source plan §"What changes vs what stays" lists `frontend/lib/patient-profile/templates.tsx` as the single home for tree literals; tmr-01 adds three sibling exported factories beside `getTelemedVideoTemplate`. Helper extraction (`makeLeftColumn(ctx)`, `makeRightColumn(ctx)`) is welcomed; do NOT scatter factories across files.

**DL-2: Body leaf is the ONLY variant point between templates.** Left column (Snapshot + History), right column (Subjective + Objective), Investigations + Plan + Assessment strip all render identically across modalities. Per source plan §4 "Modality template overrides" — only `Body height` and `Plan height` differ, plus the Body leaf's content. tmr-01 ensures helper functions for the shared columns; the Body leaf is the only per-template render.

**DL-3: `mapStateToTemplate(state, modality)` lives in `frontend/lib/patient-profile/state.ts`.** Source plan says `derive-cockpit-state.ts` but the live file is `state.ts` (renamed at some point). The mapping is a pure function (no React, no fetches); placing it alongside `deriveCockpitState` keeps the cockpit truth-table in one file. Unit tests live in `frontend/lib/patient-profile/__tests__/state.test.ts` extending the existing matrix.

**DL-4: Doctor override is a single nullable text column on `doctor_settings`.** Migration 104 adds `cockpit_template_override TEXT NULL` with `CHECK (cockpit_template_override IN ('telemed-video', 'telemed-voice', 'telemed-text', 'review') OR cockpit_template_override IS NULL)`. Default null = auto-select. RLS reuses the existing `doctor_settings` row-level policy (doctor sees only their own row). No new policy SQL.

**DL-5: No Settings UI in this batch.** The override column is added; reading it from the backend GET endpoint + writing via the existing settings UI is **deferred to a follow-up Phase-3 batch**. R-MOD-full just creates the override capability — populating it requires a UI patch and a copy review pass that doesn't belong in a 2-day Phase-2 batch. Capture-inbox: "Phase 3: Settings UI to set `cockpit_template_override` (radio group with 4 options + null)."

**DL-6: Modality switch during call (e.g., text → voice → video escalation) auto-switches the template.** When the appointment's `consultation_type` changes mid-visit (rare but supported), `useMemo` re-derives the template factory and the shell re-renders with the new tree. Existing layout (column widths / pane visibility) preserved via the localStorage migration in cv2-02; the user's saved sizes apply across all four templates the same way.

**DL-7: Walk-in fallback unchanged.** Walk-in (`appointment.patient_id == null` → `!showChart`) keeps the legacy 2-pane horizontal body+rx fallback from csf-05's DL-5. `mapStateToTemplate` returns `null` when called on a walk-in; `PatientProfilePage.tsx` short-circuits to the legacy 2-pane shape. The new Voice / Text / Review templates do NOT run for walk-in appointments — even an in-clinic walk-in keeps the legacy layout this batch.

**DL-8: Manual override persists within the visit only.** A doctor who explicitly picks "Telemed-Voice" mid-visit (via the future Settings UI, not in this batch) sees Voice for the rest of the visit even if modality auto-escalates. On the next appointment, auto-select resumes unless the global `cockpit_template_override` is set. Source plan §R-MOD acceptance criteria. v1 of this batch only ships the global override (DL-4); per-visit override comes in the deferred Settings UI batch.

**DL-9: Review template hides the Send button.** Per V2-Q3 lean (source plan §8): review means the consult is finished or never happened; Send has nothing to do. Don't show a disabled button — hide entirely. tmr-01's `getReviewTemplate` passes a `readOnly: true` ctx flag to the Plan leaf; the existing `RxWorkspace` renders Send only when `canSendPrescription(state)` returns true, which is already false for `terminal` and `ended`. Review template only mounts in `ended` / `terminal` states, so the existing gate handles it.

**DL-10: Container-query / narrow-monitor adaptation is OUT of scope for this batch.** R-SHELL ships container queries; the narrow-monitor auto-merge of Investigations into Plan is R-MIDDLE's `cockpit-middle-rebuild` batch (sibling, dated today). This batch only adds the template variants; resize behavior is shared infrastructure.

---

## Phases

### Wave 1 — Template factories + shared helpers (1 task, ~4-5h, single sequential lane)

The dependency cliff per [EXECUTION-ORDER-GUIDELINES § 0.5 Cut 1](../../../../process/EXECUTION-ORDER-GUIDELINES.md#05-how-to-cut-waves). tmr-01 ships the three new factories and the shared helpers; subsequent tasks consume them.

- [`task-tmr-01-modality-template-factories.md`](./Tasks/task-tmr-01-modality-template-factories.md) — **M, Auto** — Extend `frontend/lib/patient-profile/templates.tsx` with three new exported factories (`getTelemedVoiceTemplate`, `getTelemedTextTemplate`, `getReviewTemplate`). Extract shared `makeLeftColumn(ctx)`, `makeRightColumn(ctx)`, and `makeAssessmentStrip(ctx)` helpers so the four factories compose identical columns and only diverge at the Body leaf + the bottom-row size split. ~250 LOC delta (mostly additions).

### Wave 2 — Dispatcher + override column (2 tasks, ~3-4h, two parallel lanes)

Wave 2 has two independent lanes. Per [EXECUTION-ORDER-GUIDELINES § 0.5 Cut 2](../../../../process/EXECUTION-ORDER-GUIDELINES.md#05-how-to-cut-waves), tmr-02 and tmr-03 are disjoint (one frontend pure-function file vs one backend migration).

- [`task-tmr-02-map-state-to-template.md`](./Tasks/task-tmr-02-map-state-to-template.md) — **S, Auto** — Add `mapStateToTemplate(state, modality, override)` to `frontend/lib/patient-profile/state.ts`. Returns one of `'telemed-video' | 'telemed-voice' | 'telemed-text' | 'review' | null` (null = walk-in fallback). Extend `frontend/lib/patient-profile/__tests__/state.test.ts` with the full truth-table matrix per source plan §R-MOD acceptance.
- [`task-tmr-03-doctor-settings-migration.md`](./Tasks/task-tmr-03-doctor-settings-migration.md) — **XS, Auto** — New backend migration `backend/migrations/104_doctor_settings_cockpit_template_override.sql` adds `cockpit_template_override TEXT NULL` with the CHECK constraint per DL-4. Reuse the existing `doctor_settings` row-level policy. No new endpoint surface; the existing GET/PATCH endpoints serialize the column generically.

### Wave 3 — Wire into `PatientProfilePage` (1 task, ~2-3h, single sequential lane)

**⚠️ Cross-batch dependency:** Wave 3 is gated on `cockpit-shell-flip`'s csf-04 (production cutover) being merged. tmr-04 modifies `PatientProfilePage.tsx` which csf-04 also writes. Stack Wave 3 on the merged `cockpit-shell-flip-cutover` branch.

- [`task-tmr-04-wire-template-dispatcher.md`](./Tasks/task-tmr-04-wire-template-dispatcher.md) — **S, Composer 2 Fast** — In `PatientProfilePage.tsx`, replace the unconditional `getTelemedVideoTemplate(ctx)` call with a `useMemo`'d dispatch via `mapStateToTemplate(state, modality)`. Pull the doctor's `cockpit_template_override` from the existing settings-fetch path (or skip if not yet available client-side; tmr-04 picks the cheapest path and captures a follow-up). ~30 LOC delta.

### Wave 4 — Verification + close-out (1 task, ~1.5h, single sequential lane)

- [`task-tmr-05-verification-and-close-out.md`](./Tasks/task-tmr-05-verification-and-close-out.md) — **XS, Composer 2 Fast** — Run smoke matrix per cross-cutting gate. tsc + lint + build sweep. Wire telemetry events `cockpit_v2.r_mod_voice_landed` / `r_mod_text_landed` / `r_mod_review_landed` (one-shot per modality per session). Update `docs/Reference/product/cockpit/COCKPIT.md` with the three new templates' diagrams. Update [`plan-cockpit-v2-execution-roadmap.md`](../../../Product%20plans/plan-cockpit-v2-execution-roadmap.md): R-MOD-full status → ✅ DONE; batch ledger entry; recommended-ordering pointer to next batch (cockpit-middle-investigations). Capture-inbox follow-ups for: Settings UI for `cockpit_template_override` (DL-5), per-visit manual override (DL-8), in-clinic template when in-clinic ships (V2-D16 from source plan).

---

## Cross-cutting acceptance gate (whole batch)

These items must all be green before the batch is considered closed.

### Structural

- [ ] **All four template factories render** — `getTelemedVideoTemplate` (unchanged) + `getTelemedVoiceTemplate` + `getTelemedTextTemplate` + `getReviewTemplate` each return a valid `PaneDefinition[]`.
- [ ] **Auto-select works** — open a voice appointment (`consultation_type == 'voice'`) → Voice template renders (Body ~15%, Plan ~75%). Same check for text and review.
- [ ] **Auto-select respects state** — a `terminal` or `ended` appointment forces `review` template regardless of modality (test cases in tmr-02's truth table).
- [ ] **Doctor override pin works** — manually insert `cockpit_template_override = 'review'` into the doctor's settings row via SQL; reload the page; review template renders for every appointment regardless of modality.
- [ ] **Walk-in unchanged** — open a walk-in appointment; legacy 2-pane horizontal layout renders. No template factory runs.
- [ ] **Layout persistence shared across templates** — save column widths in Telemed-Video; switch to Telemed-Voice (same patient, different appointment); the saved widths apply.
- [ ] **Kill-switch (`?v1=1`) still works** — legacy 3-pane chart/body/rx layout under the kill-switch unaffected.

### Behavior

- [ ] **Voice template Body collapses to call-control strip** — `~15%` height; mute / end / timer controls visible; no large video placeholder.
- [ ] **Text template Body renders chat thread** — `~40%` height; chat thread scrollable; existing chat component renders correctly.
- [ ] **Review template Body hidden** — Body leaf not rendered (or `hidden: true`); Plan + S / O become the only content.
- [ ] **Review template hides Send button** — `RxWorkspace`'s existing `canSendPrescription(state)` gate handles this; verify with `state == 'ended'` appointment.
- [ ] **Modality escalation mid-visit re-renders** — manually flip `consultation_type` in DevTools React state from `'text'` to `'voice'`; the layout updates to the Voice template.
- [ ] **Truth table tests pass** — extended `state.test.ts` covers all 16+ combinations of `(state, modality, override) → template`. `pnpm --filter frontend test` clean.

### Form parity

- [ ] **Single `<RxFormProvider>` in the tree across all four templates** — verify in React DevTools after switching templates within the same session.
- [ ] **Autosave timer unchanged** — fill CC + Dx + medicine in Telemed-Video; switch the appointment to a Telemed-Voice; reload; all three fields persist.
- [ ] **Ribbon still works in all four templates** — patient ribbon (crb-02 / crb-03) renders above the shell across Telemed-Video / Voice / Text / Review.

### Backend

- [ ] **Migration 104 applies cleanly** — `pnpm --filter backend migrate latest` clean. Roll back to N-1 then re-apply; idempotent.
- [ ] **CHECK constraint rejects invalid values** — manual SQL `UPDATE doctor_settings SET cockpit_template_override = 'foo' WHERE …` fails.
- [ ] **RLS preserved** — doctor A cannot read/write doctor B's `cockpit_template_override`. Reuse existing policy verification pattern.

### Quality

- [ ] **`pnpm --filter frontend tsc --noEmit` clean.** `pnpm --filter frontend lint` clean. `pnpm --filter frontend build` clean. `pnpm --filter frontend test` clean.
- [ ] **`pnpm --filter backend test` clean** (migration scaffold + RLS smoke).
- [ ] **No new Sentry errors** in a 5-min smoke session cycling through all four templates.
- [ ] **Telemetry** — `cockpit_v2.r_mod_voice_landed` / `r_mod_text_landed` / `r_mod_review_landed` fire exactly once per template per session.

### Documentation

- [ ] **`docs/Reference/product/cockpit/COCKPIT.md` updated** with three new template diagrams (mirroring the existing Telemed-Video diagram from cce-05).
- [ ] **`plan-cockpit-v2-execution-roadmap.md` updated** with R-MOD-full → ✅ DONE; batch ledger entry; next-batch pointer to `cockpit-middle-investigations` (R-MIDDLE bottom-left).
- [ ] **Capture-inbox follow-ups** — three lines: Settings UI for override (DL-5), per-visit override (DL-8), in-clinic template once in-clinic ships (V2-D16).

---

## Out-of-scope (rolled forward to follow-up batches)

| Out-of-scope item | Where it lands |
|---|---|
| **Settings UI for `cockpit_template_override`** (radio group with 4 options + null) — DL-5 defers | Phase 3 batch (settings-cockpit-template-override) |
| **Per-visit manual override** (doctor picks template mid-visit, persists for that visit only) — DL-8 defers | Phase 3 batch (settings-cockpit-template-override or its own batch) |
| **In-clinic-specific template** when in-clinic ships — V2-D16 / DL-13 in source plan | Future plan when in-clinic enters scope |
| **R-LAYOUT-UX template picker** (built-in templates in preset picker, soft cap of 10 sub-panes) — Phase 3 R-item | `cockpit-layout-presets-modality` batch |
| **Narrow-monitor auto-merge** of Investigations into Plan chip row — R-MIDDLE-rest concern | `cockpit-middle-rebuild` batch (sibling, dated today) |
| **Voice consult call-control strip content** (mute / end / timer UI) — the Body leaf renders the strip; the actual control component is `ConsultationBodyPane`'s existing voice path | Existing component reused; if cleanup needed, R-MIDDLE-rest does it |

---

## Cost estimate

| Wave | Tasks | Auto chats | Composer 2 chats | Opus 4.7 chats | Wall-clock |
|---|---|---|---|---|---|
| Wave 1 | tmr-01 | 1/1 | 0/1 | 0/1 | ~4-5h |
| Wave 2 | tmr-02, tmr-03 | 2/2 | 0/2 | 0/2 | ~3-4h (parallel) |
| Wave 3 | tmr-04 | 0/1 | 1/1 | 0/1 | ~2-3h |
| Wave 4 | tmr-05 | 0/1 | 1/1 | 0/1 | ~1.5h |
| **Total** | **5** | **3** | **2** | **0** | **~12-16h (~2 dev-days, partial parallelism in Wave 2)** |

Token estimate (rough): ~180k input / ~110k output across the batch. Total batch spend (excluding optional close-gate review): ~$10-14.

**One optional Opus close-gate turn after tmr-05** budgeted on top. Skip if every cross-cutting gate above passes cleanly.

---

## Sequencing notes (the why behind the waves)

The 4-wave shape:

- **Wave 1 → Wave 2 is a Cut 1 (dependency cliff).** Without tmr-01's factories, tmr-02 has nothing to dispatch to. tmr-03 (the migration) is independent of tmr-01 — could ship Wave 0 — but pushing it to Wave 2 keeps the two Auto Wave-2 tasks balanced.
- **Wave 2 → Wave 3 is a Cut 2 (artifact change).** End of Wave 2: dispatcher + override column both exist. End of Wave 3: production page consumes both.
- **Wave 3 → Wave 4 is a Cut 3 (kind-of-work change).** Wave 3 = Build (production wire-up). Wave 4 = QA + Docs + Telemetry (smoke matrix, doc updates, telemetry, capture-inbox, roadmap update).

**Wave 2 partial parallelism** — tmr-02 and tmr-03 touch disjoint files (one TypeScript pure-function + tests; one SQL migration). Two engineers OR a single engineer running them in two chats simultaneously can compress Wave 2 to ~2h.

**Cross-batch dependency:** Wave 3 (tmr-04) is gated on `cockpit-shell-flip` being merged (specifically csf-04 — the production cutover). Waves 1 + 2 **can run in parallel** with the in-flight csf-* + cce-* + crb-* tasks because they only modify NEW files (factories, dispatcher, migration). Practical scheduling: start Wave 1 + Wave 2 on a fresh branch from `main`; rebase onto `cockpit-shell-flip-cutover` once that's merged; run Wave 3 + Wave 4.

**Why no Opus tasks?** Per AGENT-EXECUTION-EFFICIENCY-GUIDE hard-rules list, none of these tasks reach the L-size structural-refactor / PHI / RLS / novel security thresholds. tmr-03's migration adds a non-PHI per-doctor preference column and reuses the existing `doctor_settings` RLS policy — no novel security surface. Per-message escalation to Opus on tmr-01 only if Auto stalls on the helper extraction.

---

## References

- [Product plans/plan-cockpit-v2.md §R-MOD](../../../Product%20plans/plan-cockpit-v2.md) — source product spec; this batch's scope locks against the source plan's R-MOD section.
- [Product plans/plan-cockpit-v2-execution-roadmap.md](../../../Product%20plans/plan-cockpit-v2-execution-roadmap.md) — master tracker; R-MOD-full is the recommended next batch per §6 ordering after cockpit-ribbon.
- [Daily-plans/May 2026/19-05-2026/cockpit-shell-flip/](../../19-05-2026/cockpit-shell-flip/) — predecessor batch; csf-02 ships the factory pattern this batch extends.
- [Daily-plans/May 2026/21-05-2026/cockpit-ribbon/](../cockpit-ribbon/) — sibling Phase-2 batch; disjoint conflict surface.
- [Daily-plans/May 2026/21-05-2026/cockpit-middle-investigations/](../cockpit-middle-investigations/) — next batch in the chain; consumes the Investigations leaf this batch leaves untouched.
- [docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules; this batch sits entirely below the hard-rules list.
- [docs/Work/process/EXECUTION-ORDER-GUIDELINES.md](../../../../process/EXECUTION-ORDER-GUIDELINES.md) — wave / lane / shape rules used to draft the sibling EXECUTION-ORDER doc.
- Sibling: [`Tasks/EXECUTION-ORDER-templates-r-mod.md`](./Tasks/EXECUTION-ORDER-templates-r-mod.md) — wave / lane matrix + model picks + acceptance gates per wave.
