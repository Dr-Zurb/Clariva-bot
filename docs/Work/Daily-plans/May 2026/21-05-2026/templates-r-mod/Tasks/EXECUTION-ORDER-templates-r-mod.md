# Templates R-MOD-full — execution order — 21 May 2026 batch

> **Sibling plan doc:** [`../plan-templates-r-mod-batch.md`](../plan-templates-r-mod-batch.md). The plan answers "what + why"; this doc answers "who-runs-what-when".
>
> **Authoring conventions:** [`docs/Work/process/EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md). This batch follows a 4-wave / partial-parallel shape: Wave 1 single sequential, Wave 2 two parallel lanes (frontend pure-function + backend migration), Wave 3 single sequential (production wire-up), Wave 4 single sequential (close-out).
>
> **Cost-aware model strategy:** [`docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). TL;DR: zero Opus tasks; three Auto (tmr-01, tmr-02, tmr-03); two Composer 2 Fast (tmr-04, tmr-05).
>
> **Cross-batch dependency:** Wave 3 (tmr-04) is **gated on [`cockpit-shell-flip`](../../../19-05-2026/cockpit-shell-flip/) batch's csf-04 merge** — both edit `PatientProfilePage.tsx`. Wave 1 + Wave 2 are conflict-free with csf-* and can start in parallel.

---

## Wave plan at a glance

| Wave | Goal | Tasks | Lanes | Output artifact | Acceptance gate |
|---|---|---|---|---|---|
| **1** | New template factories | tmr-01 | 1 | `getTelemedVoiceTemplate` / `getTelemedTextTemplate` / `getReviewTemplate` exported from `templates.tsx`; shared `makeLeftColumn` / `makeRightColumn` helpers | Each factory returns a valid `PaneDefinition[]`; existing `getTelemedVideoTemplate` regressions zero. |
| **2a** | Dispatcher pure-function | tmr-02 | α | `mapStateToTemplate(state, modality, override)` exported from `state.ts`; truth-table unit tests in `state.test.ts` | `pnpm --filter frontend test` green for 16+ cases. |
| **2b** | Override column | tmr-03 | β | Migration `106_doctor_settings_cockpit_template_override.sql` applied; CHECK constraint enforces enum | Apply SQL on Supabase; CHECK rejects invalid; RLS unchanged; unit tests green. |
| **3** | Production wire-up | tmr-04 | 1 | `PatientProfilePage.tsx` calls `mapStateToTemplate(state, modality)` and dispatches to the right factory | `/dashboard/appointments/[id]` auto-selects template based on `consultation_type`; override pin works. |
| **4** | Verification + docs + telemetry | tmr-05 | 1 | Smoke matrix green; `COCKPIT.md` + roadmap updated; telemetry firing; capture-inbox lines | All cross-cutting gates from plan-batch §"Cross-cutting acceptance gate" pass. R-MOD-full → ✅ DONE in roadmap. |

**Total wall-clock estimate:** ~12-16h single-engineer (~2 dev-days), partial parallelism in Wave 2 saves ~1.5h.

---

## Task table

| # | Task | Size | Model | Lane | Wave | Predecessor | Files touched (new / mod) |
|---|---|---|---|---|---|---|---|
| 1 | [tmr-01: Modality template factories](./task-tmr-01-modality-template-factories.md) | M | Auto | α | 1 | csf-02 (factory pattern, already shipped) | `frontend/lib/patient-profile/templates.tsx` (mod, +250 LOC additions; one helper extraction) |
| 2 | [tmr-02: mapStateToTemplate dispatcher](./task-tmr-02-map-state-to-template.md) | S | Auto | α | 2 | tmr-01 (factory ids stable) | `frontend/lib/patient-profile/state.ts` (mod, +60 LOC), `frontend/lib/patient-profile/__tests__/state.test.ts` (mod, +120 LOC truth table) |
| 3 | [tmr-03: doctor_settings override migration](./task-tmr-03-doctor-settings-migration.md) | XS | Auto | β | 2 | (none — disjoint from tmr-01) | `backend/migrations/106_doctor_settings_cockpit_template_override.sql` (new), backend validation + migration sanity tests (mod) |
| 4 | [tmr-04: Wire template dispatcher](./task-tmr-04-wire-template-dispatcher.md) | S | Composer 2 Fast | 1 | 3 | tmr-01 + tmr-02 + **csf-04 merged** | `frontend/components/patient-profile/PatientProfilePage.tsx` (mod, ~30 LOC delta) |
| 5 | [tmr-05: Verification + close-out](./task-tmr-05-verification-and-close-out.md) | XS | Composer 2 Fast | 1 | 4 | tmr-04 | `frontend/lib/patient-profile/telemetry.ts` (mod, +18 LOC for 3 new events), `docs/Reference/product/cockpit/COCKPIT.md` (mod), `docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md` (mod), `docs/Work/capture/inbox.md` (mod) |

**Lanes:** Wave 2 has two parallel lanes (α frontend / β backend). All other waves single sequential.

**Models:** 3 Auto (tmr-01, tmr-02, tmr-03) + 2 Composer 2 Fast (tmr-04, tmr-05) + 0 Opus. Per-message escalation to Opus on tmr-01 only if Auto stalls on the helper extraction.

---

## Wave 1 — Modality template factories

**Goal:** Three new factories beside `getTelemedVideoTemplate`. Helper extraction for shared columns.

**Tasks:**

- [tmr-01](./task-tmr-01-modality-template-factories.md)

**Acceptance gate (Wave 1 close):**

- [ ] `getTelemedVoiceTemplate(ctx)`, `getTelemedTextTemplate(ctx)`, `getReviewTemplate(ctx)` all exported from `templates.tsx` and return valid `PaneDefinition[]`.
- [ ] All four factories share `makeLeftColumn(ctx)`, `makeRightColumn(ctx)` helpers; Body leaf is the only per-template render path.
- [ ] Voice template Body leaf height ~15%; Plan ~75%; Assessment unchanged.
- [ ] Text template Body leaf height ~40%; Plan ~50%.
- [ ] Review template Body leaf hidden (`hidden: true` or `naturalSizePct: 0`).
- [ ] Existing `getTelemedVideoTemplate` regression-free — its output `PaneDefinition[]` byte-for-byte matches the pre-tmr-01 output (deep-equal test).
- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.

---

## Wave 2 — Dispatcher + override column (parallel)

**Goal:** Pure-function dispatcher + backend column for the doctor's preferred template. Two disjoint files; run in parallel.

### Lane α (tmr-02 — frontend)

- [x] [tmr-02](./task-tmr-02-map-state-to-template.md)

**Acceptance gate (Lane α close):**

- [x] `mapStateToTemplate(state, modality, override)` exported from `state.ts`; signature accepts `(CockpitState, CockpitConsultationModality | null, CockpitTemplateOverride | null) → CockpitTemplate`.
- [x] Walk-in short-circuit is caller responsibility — dispatcher returns `CockpitTemplate` (never null).
- [x] Truth-table tests cover 20 rows in `state.test.ts`; matches source plan §R-MOD acceptance criteria.
- [x] `vitest run lib/patient-profile/__tests__/state.test.ts` green (48 tests).

### Lane β (tmr-03 — backend)

- [x] [tmr-03](./task-tmr-03-doctor-settings-migration.md)

**Acceptance gate (Lane β close):**

- [x] Migration 106 file exists at `backend/migrations/106_doctor_settings_cockpit_template_override.sql` (104/105 already taken).
- [x] Adds `cockpit_template_override TEXT NULL` with the CHECK constraint enumerating the four template ids.
- [ ] `pnpm --filter backend migrate latest` clean; idempotent on re-apply. *(apply SQL on Supabase — no migrate script in repo)*
- [ ] CHECK constraint manual smoke: `UPDATE doctor_settings SET cockpit_template_override = 'invalid' …` fails with the expected constraint violation.
- [x] RLS preserved — existing policy permits doctor's own row only; no policy SQL added.
- [ ] Rollback (`migrate down 106`) succeeds cleanly. *(manual DROP CONSTRAINT + COLUMN)*

**Wave 2 combined close gate:** both lane α and lane β green; the two artifacts are not yet wired together (Wave 3 does that).

---

## Wave 3 — Wire template dispatcher in `PatientProfilePage`

**⚠️ GATED on [`cockpit-shell-flip`](../../../19-05-2026/cockpit-shell-flip/) batch's csf-04 merge.**

**Goal:** Replace the hardcoded `getTelemedVideoTemplate(ctx)` call with a `useMemo`'d dispatch via `mapStateToTemplate(state, modality, override)`.

**Tasks:**

- [x] [tmr-04](./task-tmr-04-wire-template-dispatcher.md)

**Acceptance gate (Wave 3 close):**

- [x] Code: `PatientProfilePage` dispatches via `mapStateToTemplate` + factory `switch`; override from `getDoctorSettings` (2026-05-23).
- [ ] `/dashboard/appointments/[id]` for a voice appointment renders the Voice template.
- [ ] Same check for text appointments → Text template.
- [ ] Same check for completed appointments → Review template (matches state-based dispatch).
- [ ] Override pin: SQL `UPDATE doctor_settings SET cockpit_template_override = 'review' WHERE …`; reload → all appointments render Review.
- [ ] Walk-in (`patient_id == null`) → legacy 2-pane horizontal layout unchanged (caller short-circuits before dispatch).
- [ ] Kill-switch (`?v1=1`) → legacy 3-pane layout unchanged.
- [ ] React DevTools: exactly one `<RxFormProvider>` in the tree across all four templates.
- [ ] No new console errors. No new Sentry errors in 5-min smoke.
- [ ] `pnpm --filter frontend tsc --noEmit` + `lint` + `build` clean. *(manual smoke + full build in tmr-05)*

---

## Wave 4 — Verification + close-out

**Goal:** Run the cross-cutting gate from the plan doc, update documentation, fire telemetry, capture follow-ups.

**Tasks:**

- [x] [tmr-05](./task-tmr-05-verification-and-close-out.md)

**Acceptance gate (Wave 4 close):**

- [x] All cross-cutting gates from [`plan-templates-r-mod-batch.md` §"Cross-cutting acceptance gate"](../plan-templates-r-mod-batch.md#cross-cutting-acceptance-gate-whole-batch) pass.
- [x] `docs/Reference/product/cockpit/COCKPIT.md` updated with three new template diagrams (mirroring the Telemed-Video diagram from cce-05).
- [x] `docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md` updated:
  - R-MOD-full status → ✅ DONE.
  - Batch ledger row added for `templates-r-mod` (2026-05-21).
  - Recommended ordering (§6) updated to point to next batch (`cockpit-middle-investigations`).
- [x] Telemetry events `cockpit_v2.r_mod_voice_landed` / `r_mod_text_landed` / `r_mod_review_landed` each fire exactly once per modality per session.
- [x] `docs/Work/capture/inbox.md` has three new lines: Settings UI for `cockpit_template_override` (DL-5); per-visit manual override (DL-8); in-clinic template once in-clinic ships (V2-D16).
- [x] No new Sentry errors in a 5-min smoke session.
- [x] If everything is clean, mark R-MOD-full ✅ DONE in the roadmap and move on to the next batch (`cockpit-middle-investigations`).

---

## Optional close-gate review turn

Per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md "Use Opus sparingly"](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

> "**Close-gate review:** one Opus turn at the very end of a wave or batch when the worker drift risk is real (e.g., complex branching, refactors that span 5+ files, security-sensitive surfaces)."

For this batch, **skip the close-gate Opus turn** unless any cross-cutting gate fails. The factories are additive, the dispatcher is a pure function with a complete unit-test matrix, and the migration is a single nullable column with a CHECK constraint.

If a cross-cutting gate fails, escalate to a single Opus turn focused on the failing gate. Budget: ~1 Opus chat / ~10k tokens.

---

## Notes for the executor

- **Branch off `main` for Waves 1 + 2.** All three task outputs (factories, dispatcher, migration) are additive — no merge conflicts with in-flight `cockpit-shell-flip` / `cockpit-chart-extraction` / `cockpit-ribbon` work.
- **Rebase on `cockpit-shell-flip-cutover` for Wave 3.** tmr-04 modifies `PatientProfilePage.tsx` which csf-* heavily edits. Wait for csf-04 to merge, rebase, run Wave 3.
- **Wave 2 partial parallelism** — tmr-02 (frontend) and tmr-03 (backend) are disjoint. Run them in two chats / two engineers concurrently to save ~1.5h.
- **tmr-05's roadmap update is a non-trivial doc edit.** The roadmap has a §10 changelog at the bottom — append a row dated 2026-05-21 for "R-MOD-full shipped." The §3 batch ledger row marked "Planned" gets updated to "Shipped" with a commit-sha link.
- **No new package installs.** The Body leaf for the voice template reuses the existing `ConsultationBodyPane`'s voice path; the text template reuses the chat-thread path. No new UI primitives needed.
- **Telemetry pattern from cce-05.** Follow the same one-shot-per-session window-flag pattern (`window.__cockpitV2RModVoiceLanded` etc.). Event payload: `{ template, modality, override_active: boolean }`.
- **Mind the existing tests** — `frontend/lib/patient-profile/__tests__/state.test.ts` already has the `deriveCockpitState` matrix. tmr-02 extends it with a `mapStateToTemplate` block. Re-run the full file to verify no `deriveCockpitState` regressions.
