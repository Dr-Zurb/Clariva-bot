# Task cv2-08: three-mount-surface verification + composition root polish

## 17 May 2026 — Batch [Cockpit v2 — Phase 1](../plan-cockpit-v2-batch.md) — Wave 4, Lane single step 1 — **XS, ~3h**

---

## Task overview

Closing task of Wave 4 and of Phase 1. cv2-05 + cv2-06 + cv2-07 collectively rebuilt the prescription form on the `<RxFormProvider>` + four-section + composition-root architecture. This task is the **end-to-end verification pass + small polish round** across the three production mount surfaces, plus removal of the temporary `/dev/shell-tree-smoke` and `/dashboard/appointments/[id]/v2-tree` scaffolding from Wave 2.

After this task:

- All three production mount surfaces (appointment-detail page, in-call mini-panel, post-call summary) consume the new composition root through the deprecated `<PrescriptionForm>` compat shim and behave identically to pre-batch.
- A consolidated **post-Phase-1 verification report** is committed to `docs/Work/Daily-plans/May 2026/17-05-2026/cockpit-v2/Tasks/cv2-08-verification-report.md` capturing what was tested, what's known-broken (if anything), and Phase 2 follow-ups.
- The temporary `/dev/shell-tree-smoke` and `/dashboard/appointments/[id]/v2-tree` routes are removed (their job was Wave 2 + Wave 3 verification — completed).
- An updated `docs/Work/capture/inbox.md` line points at any deferred polish items for Phase 2.

This task is a **gate keeper.** It does not introduce new functionality. It hardens what's there and tidies up.

**Estimated time:** ~3h (1h smoke across three mount surfaces × all flows + 1h scaffold removal + tsc/lint sweep + 1h verification report).

**Status:** Done (2026-05-18 — scaffolds removed, report + plan updates; human smoke Step 2 still required before prod).

**Hard deps:** cv2-07 (form UI complete), cv2-09 (Cmd+K placeholder mounted), cv2-03 (the v2-tree scaffold being removed).

**Source:** [plan-cockpit-v2-batch.md § Wave 4 close-out](../plan-cockpit-v2-batch.md#wave-4-gate) + DL-18 (three mount surfaces preserved) in [Product plans/plan-cockpit-v2.md](../../../Product%20plans/plan-cockpit-v2.md).

---

## Model & execution guidance

**Recommended model:** **Composer 2-Fast**. Polish + verification + small file cleanups. Composer's speed + accuracy on mechanical edits is ideal here. No new code to design.

**Per-message escalation rule:** if Composer's smoke-test report is too superficial (missing flows), bump to Auto for the verification-report-writing message only.

**New chat?** **Yes** — fresh chat. Pre-load:

- This task file.
- `frontend/components/cockpit/rx/PrescriptionFormCompositionRoot.tsx` (cv2-06 — the composition root being verified).
- `frontend/components/consultation/PrescriptionForm.tsx` (compat shim — being polished).
- The three mount surface files (paths discovered in cv2-06 Step 8; if uncertain, re-run `rg "import.*from.*PrescriptionForm" frontend`).
- `frontend/app/dev/shell-tree-smoke/page.tsx` (Wave 2 scaffold being removed).
- `frontend/app/dashboard/appointments/[id]/v2-tree/page.tsx` (Wave 3 scaffold being removed).
- Source plan § DL-18.

**Estimated turns:** 2–3 turns (1 sweep + 1 report + 1 cleanup).

---

## Acceptance criteria

### Step 1 — Confirm the three mount surfaces

- [ ] Run `rg "import\s+.*PrescriptionForm\s+from\s+'@/components/consultation/PrescriptionForm'" frontend` (and the unqualified relative path variant). List **exactly** the three production surfaces:
  1. **Appointment-detail page** — `frontend/app/dashboard/appointments/[id]/page.tsx` (or similar).
  2. **In-call mini-panel** — `frontend/components/consultation/InCallMiniPanel.tsx` (or similar).
  3. **Post-call summary** — `frontend/components/consultation/PostCallSummary.tsx` (or similar).
- [ ] If a fourth (or more) mount surface exists, document it in the verification report under "Additional mount surfaces discovered" and smoke-test it too. Don't refactor any of them in this task — that's Phase 3.

### Step 2 — End-to-end smoke (run all 4 flows on all 3 surfaces)

Run each of the following flows on **each** of the three mount surfaces:

**Flow A — Empty appointment:**
- [ ] Open the mount surface for an appointment with no prior prescription data.
- [ ] Confirm the form renders, all four sections visible, no console errors.
- [ ] Tab through inputs; focus order matches reading order (CC → HOPI → vitals_text → VitalsGrid → examination_findings → provisional_dx → ddx → medicines → investigations_orders → follow_up_picker → follow_up legacy → advice → patient_education → referral → test_results → clinical_notes → Send button).
- [ ] Primary CTA label is "Send Rx & finish ▸" (DL-9 locked).

**Flow B — Load + autosave + reload:**
- [ ] Open a draft appointment with partial data.
- [ ] Confirm existing fields hydrate (including the cv2-04 structured fields if previously saved).
- [ ] Modify CC. Wait > 1.5s. Saving indicator appears → "Saved at HH:MM:SS".
- [ ] Modify a structured vitals field (e.g. BP systolic 130). Wait > 1.5s. Same indicator behaviour.
- [ ] Add a ddx chip. Wait > 1.5s. Same.
- [ ] Hard-reload (Ctrl+R). Every modified field is restored exactly.

**Flow C — Full send:**
- [ ] Fill a complete fictional appointment with every section populated (use the recipe from cv2-07 Step 8).
- [ ] Click "Send Rx & finish ▸".
- [ ] The send flow completes (existing behaviour: redirect to a summary or success state — whatever the mount surface does today).
- [ ] No console errors. No silent network failures (verify network tab).

**Flow D — Cmd+K (cv2-09 placeholder):**
- [ ] On the appointment-detail page mount, press Cmd+K (or Ctrl+K on Windows / Linux). The CommandBar opens with "Coming soon" placeholder content.
- [ ] Press Escape. It closes.
- [ ] On the in-call mini-panel — Cmd+K should still trigger (if the panel is mounted inside `<PatientProfilePage>`); verify the focus doesn't get hijacked from a chat input. Document the result. (If the in-call mini-panel doesn't mount inside `<PatientProfilePage>` — i.e. it's a separate route — Cmd+K may not bind there. That's expected; document as such.)

### Step 3 — Remove Wave 2 + Wave 3 verification scaffolds

Both scaffolds were created with a clear end-of-life in their task files: removed in cv2-08.

- [ ] **Delete** `frontend/app/dev/shell-tree-smoke/page.tsx`.
- [ ] **Delete** the parent directory if it's now empty: `frontend/app/dev/shell-tree-smoke/` (and `frontend/app/dev/` if and only if no other dev routes exist — verify with `ls frontend/app/dev/`).
- [ ] **Delete** `frontend/app/dashboard/appointments/[id]/v2-tree/page.tsx`.
- [ ] **Delete** the parent directory if now empty: `frontend/app/dashboard/appointments/[id]/v2-tree/`.
- [ ] If `frontend/lib/patient-profile/templates.ts` (cv2-03) is still referenced anywhere else (it shouldn't be in Phase 1 — Phase 2 will reintroduce it for the production telemed-video mount), leave it. If unreferenced, mark with a top-of-file comment: `// Reserved for Phase 2 — keep this module; the `/v2-tree` smoke route is removed but the template literal is the foundation for cockpit-shell-rebuild's production mount.`

  Verify with `rg "from\s+'@/lib/patient-profile/templates'" frontend`. If only the deleted v2-tree page referenced it, leave the file in place but mark it as above so nobody deletes it during cleanup.

- [ ] **Delete** `frontend/components/patient-profile/PanePlaceholder.tsx` if and only if no other code references it. Verify with `rg "<PanePlaceholder\b" frontend`. If Phase 2 work depends on it, leave it and add the same reserve-for-phase-2 comment.

### Step 4 — Polish the `<PrescriptionForm>` compat shim

Already collapsed to ≤ 20 LOC in cv2-06 Step 7. Verify + polish only:

- [ ] Verify the deprecation banner still reads cleanly and points at the new path.
- [ ] Run `wc -l frontend/components/consultation/PrescriptionForm.tsx` — confirm ≤ 20 LOC.
- [ ] If the banner has any typos / stale references (e.g. mentions cv2-05 but should mention "Phase 3"), fix.
- [ ] Add the file to `docs/Work/capture/inbox.md` as a deferred follow-up so Phase 3 explicitly knows to delete it:

  ```markdown
  - [ ] Phase 3: delete `frontend/components/consultation/PrescriptionForm.tsx` compat shim once all consumers have migrated to `@/components/cockpit/rx/PrescriptionFormCompositionRoot`. (Promoted from cv2-08, 2026-05-17.)
  ```

### Step 5 — Sweep type-check / lint / build

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean — including the ESLint rule from cv2-01 (no `<ResizablePanelGroup>` outside Shell.tsx); the post-cv2-03 scaffold deletions should NOT have introduced any violations.
- [ ] `pnpm --filter frontend build` succeeds. Bundle size for the appointment-detail route hasn't regressed > 5 % (sanity check — if it has, investigate; not a blocker unless > 20 %).
- [ ] `pnpm --filter backend test prescriptions.test.ts` (the cv2-07 backend tests) still passes.
- [ ] `pnpm --filter backend tsc --noEmit` clean — the regenerated `backend/src/types/database.ts` from cv2-04 + the validation schema extensions from cv2-07 should compile cleanly.

### Step 6 — Write the verification report

- [ ] **New file** `docs/Work/Daily-plans/May 2026/17-05-2026/cockpit-v2/Tasks/cv2-08-verification-report.md`:

  ```markdown
  # cv2-08 — Phase 1 verification report

  **Date:** 2026-05-17
  **Owner:** [name]
  **Phase 1 scope:** R-SHELL (recursive panes), R-RX-FORM (Strangler Fig refactor), R-FUTURE-PROOFING (contracts + Cmd+K placeholder).

  ## Tasks delivered

  | ID | Title | Status | Notes |
  |---|---|---|---|
  | cv2-01 | Recursive `PaneDefinition.children` + Shell.tsx | [done/blocked] | |
  | cv2-02 | Layout-tree state + persistence v3→v4 | [done/blocked] | |
  | cv2-03 | Telemed-video template + `/v2-tree` smoke | [done/blocked — scaffolds removed in cv2-08] | |
  | cv2-04 | SOAP fields migration (103) + investigations rename | [done] | PHI columns added; CHECK constraints active. |
  | cv2-05 | RxFormContext extraction + autosave wiring | [done] | |
  | cv2-06 | Section component extraction (4 sections) | [done] | |
  | cv2-07 | SOAP fields UI wire + persistence round-trip | [done] | |
  | cv2-08 | Mount surface verification + scaffold removal | [in-progress / done] | This document. |
  | cv2-09 | R-FUTURE-PROOFING contracts + Cmd+K placeholder | [done] | |

  ## Mount surfaces verified

  | Surface | Path | Empty appt | Autosave + reload | Full send | Cmd+K |
  |---|---|---|---|---|---|
  | Appointment-detail page | [path] | ✅ | ✅ | ✅ | ✅ |
  | In-call mini-panel | [path] | ✅ | ✅ | ✅ | [✅ / N/A — see notes] |
  | Post-call summary | [path] | ✅ | ✅ | [✅ / N/A read-only — see notes] | [✅ / N/A] |

  ## Discovered / unexpected mount surfaces

  [Document any 4th+ surfaces from `rg "import.*PrescriptionForm" frontend`. If none, write "None."]

  ## Known behaviour preserved

  - Primary CTA wording "Send Rx & finish ▸" unchanged (DL-9).
  - Three mount surfaces continue to import from `@/components/consultation/PrescriptionForm` (DL-18).
  - Legacy `vitals_text` + free-text `follow_up` fields still rendered (DL-22 transition window).
  - Autosave debounce ≈ 1500 ms preserved from pre-batch behaviour.
  - Existing medicines list interaction (add / remove / reorder if supported) unchanged.

  ## Known new behaviour

  - Structured vitals grid + ddx chips + structured follow-up picker + advice / referral / test_results visible.
  - "Coming in cv2-07" stub banners removed.
  - Cmd+K (Ctrl+K on Win/Linux) opens a placeholder CommandBar dialog (`<CommandBar>` → "Coming soon" copy).
  - Backend `prescriptions.investigations` column renamed to `investigations_orders`; `prescriptions_legacy_v` view bridges legacy reads.

  ## Bundle / perf delta

  | Metric | Pre-batch | Post-batch | Delta |
  |---|---|---|---|
  | Appointment-detail route gzipped JS | [number] kB | [number] kB | [+/- %] |
  | Time-to-interactive on form (cold) | [ms] | [ms] | [+/- ms] |

  *(Fill in with `pnpm --filter frontend build` output for size; manual stopwatch for TTI or skip if not measured.)*

  ## Known issues / Phase 2 follow-ups

  - [ ] Patient-facing PDF doesn't yet render the new SOAP fields (deferred to R-RX-PDF in Phase 2).
  - [ ] Doctor-facing summary card doesn't yet render the new fields (Phase 2).
  - [ ] Legacy `vitals_text` and free-text `follow_up` fields remain visible alongside structured equivalents (Phase 3 removes them after soak).
  - [ ] `frontend/components/consultation/PrescriptionForm.tsx` is still a compat shim (Phase 3 removes it after consumer migration).
  - [ ] `/v2-tree` smoke route removed; production telemed-video mount happens in cockpit-shell-rebuild batch (Phase 2).
  - [ ] In-call mini-panel and post-call summary may not bind Cmd+K depending on their composition tree (documented above).

  ## Sign-off

  Phase 1 of cockpit-v2 is **[shippable / requires follow-up — list items]**.
  ```

- [ ] Fill in every `[bracket]` placeholder with the actual smoke result.

### Step 7 — Update the batch's plan file

- [ ] **Append a "Status" section** to `docs/Work/Daily-plans/May 2026/17-05-2026/cockpit-v2/plan-cockpit-v2-batch.md`:

  ```markdown
  ## Status (post-cv2-08)

  - Phase 1: **shipped 2026-05-17**.
  - Verification report: [cv2-08-verification-report.md](./Tasks/cv2-08-verification-report.md).
  - Phase 2 (cockpit-shell-rebuild + R-RX-PDF + R-PRESETS) — to be scheduled separately.
  - Phase 3 (rx-polish-densification + AI-ASSIST) — to be scheduled separately.
  ```

- [ ] **Update** `docs/Work/Daily-plans/May 2026/17-05-2026/README.md` cockpit-v2 batch row to reflect shipped status.

### Step 8 — Final composition sanity check

- [ ] Open the appointment-detail page in production-mode build (`pnpm --filter frontend build && pnpm --filter frontend start`). Smoke once more in production mode (not dev). All flows behave; no SSR / hydration warnings.

---

## Out of scope

- **Refactoring the three mount surface call-sites** to import from `@/components/cockpit/rx/PrescriptionFormCompositionRoot` directly. Phase 3.
- **Deleting the `<PrescriptionForm>` compat shim.** Phase 3.
- **Adding new mount surfaces** for the prescription form (e.g. a quick-Rx side sheet from the cockpit). Phase 2+.
- **Reorganising the verified mount surfaces' internal layout** (e.g. making the in-call panel use the new pane tree). Phase 2 (cockpit-shell-rebuild).
- **Performance regression investigation** if bundle size grew > 20 %. Becomes a Phase 2 task; this task only documents the delta.
- **Visual regression test snapshots** for the three mount surfaces. Test infrastructure addition; Phase 3.
- **Sentry / error-tracking instrumentation** for the new SOAP fields' validation failures. Existing error handling preserved; no new instrumentation in Phase 1.
- **Removing `frontend/components/patient-profile/PanePlaceholder.tsx`** if Phase 2 needs it for the production telemed-video mount. Decision deferred to that task; cv2-08 only removes it if cleanly unreferenced.

---

## Files expected to touch

**New:**

- `docs/Work/Daily-plans/May 2026/17-05-2026/cockpit-v2/Tasks/cv2-08-verification-report.md` (~80 LOC verification report).

**Modified:**

- `frontend/components/consultation/PrescriptionForm.tsx` — small polish only (banner copy).
- `docs/Work/Daily-plans/May 2026/17-05-2026/cockpit-v2/plan-cockpit-v2-batch.md` — append Status section.
- `docs/Work/Daily-plans/May 2026/17-05-2026/README.md` — mark cockpit-v2 row shipped.
- `docs/Work/capture/inbox.md` — append the Phase 3 compat-shim-deletion follow-up line.

**Deleted:**

- `frontend/app/dev/shell-tree-smoke/page.tsx` (and parent dir if empty).
- `frontend/app/dashboard/appointments/[id]/v2-tree/page.tsx` (and parent dir if empty).
- Possibly `frontend/components/patient-profile/PanePlaceholder.tsx` (only if cleanly unreferenced — verify first).

**Read but do not modify:**

- The three production mount surfaces.
- `frontend/components/cockpit/rx/PrescriptionFormCompositionRoot.tsx` and the four section components.
- `frontend/components/cockpit/rx/RxFormContext.tsx`.
- `backend/migrations/103_prescription_soap_fields_expansion.sql`.

---

## Notes / open decisions

1. **Why is this an XS task even though it touches ~10 files?** Most touches are file deletions, copy-edits to a deprecation banner, and the verification report — not new design work. The smoke pass is mechanical; the report is structured fill-in. Composer handles all of this quickly.

2. **What if a smoke flow fails?** Document the failure in the verification report under "Known issues", file a follow-up in `docs/Work/capture/inbox.md`, and decide with the user whether Phase 1 is still shippable or if a hotfix is needed. The decision matrix:
   - If autosave breaks on a mount surface → blocker; hotfix immediately.
   - If a single new structured input doesn't hydrate on reload → blocker; hotfix.
   - If Cmd+K doesn't bind on the in-call panel (because the panel doesn't mount inside `<PatientProfilePage>`) → not a blocker; document as expected and revisit when Phase 2 rewrites that surface.
   - If bundle size grew > 20 % → not a blocker for Phase 1 but flag as Phase 2 follow-up.

3. **Why delete the `/v2-tree` and `/dev/shell-tree-smoke` routes?** They were verification scaffolds; their job ended when Wave 3 closed. Keeping them in production code is noise (search results, route registry, etc.). Phase 2 (cockpit-shell-rebuild) introduces the production telemed-video mount as a new file; it doesn't reuse the scaffold path.

4. **What if `frontend/lib/patient-profile/templates.ts` becomes orphaned after the scaffold removal?** Leave it. The literal `TELEMED_VIDEO_TEMPLATE` is a Phase 2 input. Mark with the reserve-for-phase-2 comment so cleanup tooling (linters, dead-code analysis) doesn't suggest deleting it.

5. **Why a verification report file, not just a PR description?** Two reasons. (a) Daily-plan batches accumulate a verification trail; future planners reference them to understand what was already shipped vs deferred. (b) PR descriptions get lost; markdown in the repo persists.

6. **What about the cv2-03 `<PanePlaceholder>` component — does it stay?** Decision: if it's referenced by anything other than the deleted `/v2-tree` page, it stays (Phase 2 will likely reuse it for placeholder panes during the production cockpit-shell-rebuild). If it's only referenced by the deleted scaffold, delete it. The `rg` check in Step 3 makes the call.

7. **Why does the report mention bundle deltas without a hard threshold?** Phase 1 isn't a performance optimisation batch; we accept reasonable size growth from new structured-input components. The 5 % / 20 % framing is for sanity, not gating.

8. **What about the `docs/Work/capture/inbox.md` follow-up?** The line is short and points-the-finger at a Phase 3 task. Per the repo's `capture-inbox.mdc` rule, capture-inbox is the right channel for deferred work that needs to be promoted to a daily-plan later.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Source decisions:** [Product plans/plan-cockpit-v2.md § DL-9 + § DL-18 + § DL-22](../../../Product%20plans/plan-cockpit-v2.md).
- **Wave gate (final):** [`EXECUTION-ORDER-cockpit-v2.md` § Wave 4 gate](./EXECUTION-ORDER-cockpit-v2.md#wave-4-gate-after-cv2-07--cv2-08).
- **Predecessor in lane:** [`task-cv2-07-soap-fields-ui-wire.md`](./task-cv2-07-soap-fields-ui-wire.md) — the form must be complete before this verification.
- **Cross-batch dep:** [`task-cv2-09-future-proofing-contracts.md`](./task-cv2-09-future-proofing-contracts.md) — Cmd+K must be wired so Step 2 Flow D can verify.
- **Inbox channel:** [`docs/Work/capture/inbox.md`](../../../../../capture/inbox.md).

---

**Owner:** TBD
**Created:** 2026-05-17
**Status:** Pending
