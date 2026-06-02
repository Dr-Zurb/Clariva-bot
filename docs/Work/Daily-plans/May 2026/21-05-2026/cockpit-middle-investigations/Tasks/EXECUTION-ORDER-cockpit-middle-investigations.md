# Cockpit middle Investigations — execution order — 21 May 2026 batch

> **Sibling plan doc:** [`../plan-cockpit-middle-investigations-batch.md`](../plan-cockpit-middle-investigations-batch.md). The plan answers "what + why"; this doc answers "who-runs-what-when".
>
> **Authoring conventions:** [`docs/Work/process/EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md). 3-wave / single-lane sequential shape.
>
> **Cost-aware model strategy:** [`docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). TL;DR: zero Opus tasks; one Auto (cmi-01); two Composer 2 Fast (cmi-02, cmi-03).
>
> **Cross-batch dependency:** Wave 2 (cmi-02) is **gated on [`templates-r-mod`](../../templates-r-mod/)'s tmr-01 merge** — if all four factories exist, cmi-02 sweeps them in one pass. Otherwise cmi-02 swaps only `getTelemedVideoTemplate` and captures the multi-factory follow-up.

---

## Wave plan at a glance

| Wave | Goal | Tasks | Lanes | Output artifact | Acceptance gate |
|---|---|---|---|---|---|
| **1** | InvestigationsPane component ready | cmi-01 | 1 | `<InvestigationsPane>` exports from `panes/`; chip-row + autocomplete subscribed to `useRxForm()` | Component renders at dev fixture; chip add/remove works; read-only mode respects state. |
| **2** | Wired into templates + production | cmi-02 | 1 | `templates.tsx` placeholder swapped for `<InvestigationsPane>` in all four factories | `/dashboard/appointments/[id]` renders the real pane in the middle column's bottom-left; no `<PanePlaceholder>` left in production. |
| **3** | Verification + docs + telemetry | cmi-03 | 1 | Smoke matrix green; `COCKPIT.md` + roadmap updated; telemetry firing; capture-inbox lines | All cross-cutting gates from plan-batch §"Cross-cutting acceptance gate" pass. R-MIDDLE bottom-left → ✅ DONE in roadmap. |

**Total wall-clock estimate:** ~7-9h single-engineer single-lane sequential (~1 dev-day).

---

## Task table

| # | Task | Size | Model | Lane | Wave | Predecessor | Files touched (new / mod) |
|---|---|---|---|---|---|---|---|
| 1 | [cmi-01: InvestigationsPane](./task-cmi-01-investigations-pane.md) | M | Auto | α | 1 | cv2-04 (`investigationsOrders` field), cv2-05 (`RxFormContext`), csf-03 (placeholder), existing chip-row from `PrescriptionFormCompositionRoot` | `frontend/components/patient-profile/panes/InvestigationsPane.tsx` (new); `frontend/components/cockpit/rx/PrescriptionFormCompositionRoot.tsx` (mod, remove the chip-row block now lifted into the new pane); existing chip-row child component (mod or just re-imported as-is) |
| 2 | [cmi-02: Wire into templates](./task-cmi-02-wire-into-templates.md) | XS | Composer 2 Fast | α | 2 | cmi-01; **tmr-01 merged** (templates-r-mod factories exist) | `frontend/lib/patient-profile/templates.tsx` (mod, ~15 LOC: swap placeholder → real pane in each factory; update header comment) |
| 3 | [cmi-03: Verification + close-out](./task-cmi-03-verification-and-close-out.md) | XS | Composer 2 Fast | α | 3 | cmi-02 | `frontend/lib/patient-profile/telemetry.ts` (mod, +18 LOC for 1 new event), `docs/Reference/product/cockpit/COCKPIT.md` (mod), `docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md` (mod), `docs/Work/capture/inbox.md` (mod) |

**Lanes:** Single lane α throughout.

**Models:** 1 Auto (cmi-01) + 2 Composer 2 Fast (cmi-02, cmi-03) + 0 Opus.

---

## Wave 1 — InvestigationsPane

**Goal:** Extract the investigations chip-row from `PrescriptionFormCompositionRoot` into a standalone pane component.

**Tasks:**

- [cmi-01](./task-cmi-01-investigations-pane.md)

**Acceptance gate (Wave 1 close):**

- [ ] `<InvestigationsPane>` exports from new file `frontend/components/patient-profile/panes/InvestigationsPane.tsx`.
- [ ] Component subscribes to `useRxForm()`; reads `state.fields.investigationsOrders`.
- [ ] Chip-row + autocomplete render identically to the existing implementation inside `PrescriptionFormCompositionRoot`.
- [ ] Read-only mode when `state` denotes ended / terminal — `[+ add]` hidden, chips not removable.
- [ ] `PrescriptionFormCompositionRoot.tsx` no longer renders the investigations chip-row directly (avoids double-render in the legacy 3-pane kill-switch path).
- [ ] **However** — the standalone composition root (`<PrescriptionForm>` used in appointment-detail / in-call / post-call mounts, DL-3) keeps the chip-row inline so non-cockpit mounts continue to work unchanged.
- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.
- [ ] `pnpm --filter frontend test` clean (existing investigations-related tests still pass; new pane has at least a render + chip-add unit test).
- [ ] Smoke at dev fixture (`frontend/app/dashboard/_dev/inv-pane-fixture/page.tsx` — NOT committed): wrap in `<RxFormProvider>`, mount `<InvestigationsPane>`, verify chip-add works. Delete the fixture before commit.

---

## Wave 2 — Wire into templates.tsx + production cutover

**⚠️ GATED on [`templates-r-mod`](../../templates-r-mod/)'s tmr-01 merge.**

**Goal:** Replace every `<PanePlaceholder>` with `<InvestigationsPane>` in `templates.tsx`'s four factories.

**Tasks:**

- [cmi-02](./task-cmi-02-wire-into-templates.md)

**Acceptance gate (Wave 2 close):**

- [x] No occurrence of `<PanePlaceholder` with `futureRItem="R-MIDDLE (Investigations extraction deferred)"` in `templates.tsx`. Verify with `Grep`.
- [x] All four template factories (Video / Voice / Text / Review) render `<InvestigationsPane>` in their middle-column bottom-row left position.
- [x] `templates.tsx` header comment block updated — `investigations-orders` line moves from "deferred — only remaining placeholder" to "R-MIDDLE (real)".
- [ ] `/dashboard/appointments/[id]` for each modality renders the real Investigations pane; no placeholder visible anywhere.
- [ ] React DevTools: exactly one `<RxFormProvider>` in the tree (no regression).
- [x] `pnpm --filter frontend lint` clean.
- [ ] `pnpm --filter frontend tsc --noEmit` + `build` — blocked by pre-existing type errors in `VoiceConsultRoom.tsx` / `PatientRibbon.tsx` (unrelated to cmi-02).
- [ ] No new console errors. No new Sentry errors in 5-min smoke.

---

## Wave 3 — Verification + close-out

**Goal:** Run the cross-cutting gate, fire telemetry, update docs, capture follow-ups.

**Tasks:**

- [x] [cmi-03](./task-cmi-03-verification-and-close-out.md) ✅ DONE (2026-05-23)

**Acceptance gate (Wave 3 close):**

- [x] All cross-cutting gates from [`plan-cockpit-middle-investigations-batch.md` §"Cross-cutting acceptance gate"](../plan-cockpit-middle-investigations-batch.md#cross-cutting-acceptance-gate-whole-batch) pass.
- [x] Telemetry event `cockpit_v2.r_middle_inv_landed` fires exactly once per session on first mount.
- [x] `docs/Reference/product/cockpit/COCKPIT.md` updated — Investigations pane noted as live; brief note + (optional) inline diagram.
- [x] `docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md` updated:
  - "R-MIDDLE bottom-left only" status (currently 🟡 implied by the planning row) → ✅ DONE for this scope. (R-MIDDLE-rest remains 🟡 / ⏳ depending on the sibling cockpit-middle-rebuild batch state.)
  - Batch ledger row added for `cockpit-middle-investigations` (2026-05-21).
  - Recommended ordering (§6) — `cockpit-middle-investigations` moves from `[2nd]` (post-ribbon) to "shipped"; the new `[NEXT]` is `cockpit-middle-rebuild`.
  - §10 changelog row appended.
- [x] `docs/Work/capture/inbox.md` has 2-3 new lines: narrow-monitor auto-merge (DL-6); structured ordered-tests migration (future plan, DL-2); investigations grouping by lab vendor (future telemed-billing plan).
- [x] If everything is clean, mark R-MIDDLE bottom-left ✅ DONE in the roadmap and move on to `cockpit-middle-rebuild`.

---

## Optional close-gate review turn

Per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md "Use Opus sparingly"](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

> "**Close-gate review:** one Opus turn at the very end of a wave or batch when the worker drift risk is real."

For this batch, **skip the close-gate Opus turn** unless any cross-cutting gate fails. The component extraction is small and the template sweep is mechanical.

If a cross-cutting gate fails, escalate to a single Opus turn focused on the failing gate. Budget: ~1 Opus chat / ~10k tokens.

---

## Notes for the executor

- **Branch off `templates-r-mod-batch` for Wave 1 + Wave 2.** Or, if templates-r-mod is still in flight, branch off `main` and only sweep `getTelemedVideoTemplate` in cmi-02 — capture-inbox the multi-factory follow-up.
- **Wave 1 is the load-bearing task.** The extraction has to preserve every quirk of the existing chip-row component — autocomplete suggestions, free-text override, chip remove via X click, autosave debounce participation. Don't refactor; just move.
- **Wave 2 is mechanical.** Composer 2 Fast handles it in 1-2 turns. The same `<PanePlaceholder>` pattern appears N times (one per factory if templates-r-mod is merged); cmi-02 swaps each instance.
- **Wave 3's roadmap update is important.** This batch clears the last `<PanePlaceholder>` from production. Document that in the §10 changelog so the next batch's planning pass knows the Phase-2 §"both deferred placeholders replaced" gate is reachable.
- **No new package installs.** All UI primitives (chip / autocomplete / popover) already exist from cv2-06.
- **Telemetry pattern from crb-04 / tmr-05.** Follow the same one-shot-per-session window-flag pattern (`window.__cockpitV2RMiddleInvLanded`). Event payload: `{ appointmentId, investigationsLength: number }`.
- **PrescriptionFormCompositionRoot is the source of the chip-row.** Read it carefully before extracting — there may be subtle props or callback hooks (e.g., for the suggestion source) that need to flow through the new pane.
