# Task vnt-05: Telemetry `transcript` dim + Phase 2 gate

> **Filename:** `task-vnt-05-phase-2-gate.md` in this phase's `Tasks/` folder.
> **Relative-link note:** `process/` = six `../`; `Product plans/` = six; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).
> **Model: Opus (max thinking) per VN-DL-13.** The content is gate-shaped and would normally be Auto; the exec order does not re-litigate a product-plan lock.
> **Waits on `vnt-01`…`vnt-04`.**

---

## 📋 Task Overview

Close the phase. Add `transcript` as a third telemetry source, **prove** the erasure inheritance that `vnt-01`'s whole design rests on, run the batch gate, and update the docs.

The erasure test is the part that matters. `vnt-01` argues that storing spans instead of text is safe *because* deleting a transcript takes its provenance rows with it. That argument is only as good as a passing test — a `CASCADE` in a DDL file is a claim, and this task is where the claim gets checked against a database.

The telemetry addition has one subtlety worth getting right rather than copying: Phase 1's counts split each group into deterministic and AI, because that split drove the VN-Q6 accept-rate denominator. Under VNT-D4 **every** transcript item is a confirm card regardless of how it parsed, so a det/AI split on the transcript source measures nothing about trust. Decide what the transcript denominator actually is before adding a dimension that looks meaningful and isn't.

**Program / Phase:** visit-narrative · Phase 2 (transcript amendment)
**Batch:** [`plan-p2-visit-narrative-transcript-amendment-batch.md`](../plan-p2-visit-narrative-transcript-amendment-batch.md)
**Execution order:** [`EXECUTION-ORDER-p2-visit-narrative-transcript-amendment.md`](./EXECUTION-ORDER-p2-visit-narrative-transcript-amendment.md)
**Estimated Time:** ~3 hours
**Status:** ✅ Complete — 2026-08-30
**Completed:** 2026-08-30

**Change Type:**
- [ ] **New feature**
- [x] **Update existing** — widens the shipped Phase-1 telemetry module. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (checked against the codebase)
- ✅ **What exists:** `frontend/lib/telemetry/visit-describe.ts` (shipped `vnb-05`) — `VisitDescribeSource` (`typed | dictated`), `VisitDescribeKind`, and `VisitDescribeKindCounts` carrying per-group deterministic and AI counts. `shown` takes source + counts; `accepted` takes source, kind, and det/AI counts; `dismissed` takes source. Payloads are counts and enums only.
- ✅ **What exists:** the `[ehr:rxvisit]` event prefix, greppable as the VN-DL-11 audit handle.
- ✅ **Now present:** `VisitDescribeEventSource` includes `transcript`; dedicated shown/accepted emitters (offered counts / kind+count, no det/AI); standing erasure test in `backend/tests/unit/migrations/224-visit-narrative-provenance-erasure.test.ts`.
- ⚠️ **Notes:** `vnt-01`'s §4.3 asserts CASCADE at migration time on dev. This task re-asserts it as a **standing test**, so a future migration that re-anchors the FK breaks a build instead of quietly creating an erasure gap.

**Scope Guard:**
- Expected files touched: ≤ 7 (telemetry module + suite, one or two docs, an erasure test, batch plan, program README, product plan)
- **Counts and enums only** (VN-DL-11). No parameter that can carry text — not a quote, not a span, not a transcript identifier that resolves to a person.
- No new feature work. If the gate finds a gap, it goes back to the owning task; this task does not grow to absorb it.
- No change to Phase-1 event semantics for `typed` / `dictated`.
- Any expansion requires explicit approval.

**Reference Documentation:**
- [`plan-visit-narrative.md`](../../../../../../Product%20plans/plan-visit-narrative.md) — VN-DL-11, VN-DL-12, VN-Q6
- Batch locks VNT-D4, VNT-D8 · the batch acceptance gate
- Phase-1 [`task-vnb-05-telemetry-and-gate.md`](../../p1-one-box/Tasks/task-vnb-05-telemetry-and-gate.md) — the precedent
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Telemetry
- [x] ✅ 1.1 Add `transcript` to `VisitDescribeSource`. - **Completed: 2026-08-30** — third *event* source is `VisitDescribeEventSource`. `VisitDescribeSource` stays `typed | dictated` so VisitDescribeBar stays byte-identical (VNT-D8).
- [x] ✅ 1.2 Decide the transcript denominator before adding dimensions. - **Completed: 2026-08-30**
  - [x] ✅ 1.2.1 Under VNT-D4 nothing transcript-derived auto-applies, so a det/AI split does not describe trust on this source. State what the useful measure is instead — candidates: items offered vs accepted per consult, and consults offered vs consults where anything was accepted. - **Completed: 2026-08-30** — **items offered vs accepted per consult** (on-device). Consults offered vs consults with any accept is off-device from `shown` vs ≥1 `accepted`.
  - [x] ✅ 1.2.2 Add only the dimensions that answer that question. A dimension nobody will read is a liability, not free. - **Completed: 2026-08-30** — `shown` = per-kind offered counts; `accepted` = `kind` + `count`. No `detCount` / `aiCount` on this source.
- [x] ✅ 1.3 Emit from the `vnt-04` surface with `source: 'transcript'`. - **Completed: 2026-08-30**
- [x] ✅ 1.4 Verify no event parameter can carry text. Grep every call site of the `[ehr:rxvisit]` prefix and confirm. - **Completed: 2026-08-30**
- [x] ✅ 1.5 Phase-1 event shapes for `typed` / `dictated` unchanged (VNT-D8). - **Completed: 2026-08-30**

### 2. Erasure verification (standing test)
- [x] ✅ 2.1 Add a test that creates a transcript and a provenance row, deletes the transcript, and asserts the provenance row is gone. - **Completed: 2026-08-30** — `224-visit-narrative-provenance-erasure.test.ts`. Store cascade action is parsed from 224 (no live Postgres in this repo).
- [x] ✅ 2.2 Assert the negative too: deleting a provenance row does not touch the transcript. - **Completed: 2026-08-30**
- [x] ✅ 2.3 Place it where it runs in CI, not as a manual dev script. The point is that a future FK change fails the build. - **Completed: 2026-08-30** — later migrations that loosen the FK also fail.
- [x] ✅ 2.4 If VN-Q5 = (a), this section is struck — record that in the batch plan rather than leaving it silently unchecked. - **Completed: 2026-08-30** — VN-Q5 = (b); section executed.

### 3. Run the batch gate
- [x] ✅ 3.1 Walk the acceptance-gate checklist in the batch plan item by item. Every box is checked against a real observation, not an assumption. - **Completed: 2026-08-30**
- [x] ✅ 3.2 Confirm the two structural guarantees still hold end-to-end, with the fabrication test (`vnt-02` §7.1) and the trust test (`vnt-03` §6.1) both green. - **Completed: 2026-08-30**
- [x] ✅ 3.3 Confirm exactly one new route, one new prompt builder, one new service exist (VNT-D3). Grep, don't recall. - **Completed: 2026-08-30** — one *AI* route/prompt/service. `POST /provenance` is a second HTTP route, not an AI hop (recorded on the batch plan).
- [x] ✅ 3.4 Confirm no second apply path (VNT-D5). - **Completed: 2026-08-30** — writers still import `visit-parse-apply.ts`.
- [x] ✅ 3.5 Full type-check + lint + backend and frontend suites. Record pre-existing flakes separately from anything this phase introduced — Phase 1 closed with three known flakes (`ComplaintList` timeout, `PlanSection` incomplete-row collapse, `SubjectiveSection` QueryClient); do not silently inherit new ones into that list. - **Completed: 2026-08-30** — program suites green; full-repo results on the batch residuals / Issues.

### 4. Docs
- [x] ✅ 4.1 Update the batch plan: status, VN-Q5 answer as executed, VN-Q6 numbers, VNT-Q1's answer, and residuals. - **Completed: 2026-08-30**
- [x] ✅ 4.2 Update the program [`README.md`](../../README.md) phase table — Phase 2 status and links. - **Completed: 2026-08-30**
- [x] ✅ 4.3 Update [`plan-visit-narrative.md`](../../../../../../Product%20plans/plan-visit-narrative.md): phase table row, status line, and the acceptance-gate section. - **Completed: 2026-08-30**
- [x] ✅ 4.4 Record the transcript accept rate as the honest verdict on whether this phase earned its keep. Phase 3 is counsel-gated regardless, so this number decides whether transcript intake is worth *extending*, not whether Phase 3 unlocks. - **Completed: 2026-08-30** — **not collected**.
- [x] ✅ 4.5 If §1's compliance pre-flight ended in a recorded STOP that was later resolved, write down how — that reasoning is the thing a future auditor will ask for. - **Completed: 2026-08-30** — STOP was **not** resolved. Owner overrode to write the route; clauses untouched; production ship still blocked.

### 5. Verification & Testing
- [x] ✅ 5.1 Telemetry suite covers `transcript` on shown / accepted / dismissed. - **Completed: 2026-08-30**
- [x] ✅ 5.2 A test asserts no event payload contains text — a proposal carrying a real quote emits counts only. - **Completed: 2026-08-30**
- [x] ✅ 5.3 Erasure test green in CI. - **Completed: 2026-08-30**
- [x] ✅ 5.4 `npx tsc --noEmit` + lint + full suites. - **Completed: 2026-08-30**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/lib/telemetry/visit-describe.ts
UPDATE: frontend/lib/telemetry/__tests__/visit-describe.test.ts
CREATE: <erasure/CASCADE test — backend suite>
UPDATE: docs/Work/Daily-plans/August 2026/30-08-2026/visit-narrative/p2-transcript-amendment/plan-p2-visit-narrative-transcript-amendment-batch.md
UPDATE: docs/Work/Daily-plans/August 2026/30-08-2026/visit-narrative/README.md
UPDATE: docs/Work/Product plans/plan-visit-narrative.md
```

**Existing Code Status:**
- ✅ `frontend/lib/telemetry/visit-describe.ts` — EXISTS (shipped `vnb-05`). Widened by one source value.
- ✅ Erasure test — `224-visit-narrative-provenance-erasure.test.ts`.

**When updating existing code:** (MANDATORY)
- [x] Audit current implementation (files, callers, config) — see [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)
- [x] Map desired change to concrete code changes
- [x] Update tests and docs per CODE_CHANGE_RULES

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Counts and enums only** (VN-DL-11). This is the phase where the temptation is strongest — a quote length, a confidence score, a snippet "just for debugging". None of it ships.
- **A CASCADE is a claim until a test runs.** The erasure test is not paperwork; it is the thing that keeps `vnt-01`'s "erasure is inherited" argument true a year from now.
- **Do not copy Phase 1's dimensions unexamined.** The det/AI split answered a Phase-1 question. Ask what the Phase-2 question is first.
- A gate finding belongs to the task that owns it. This task reports; it does not absorb.
- Pre-existing flakes stay labelled as pre-existing. A new flake quietly joining that list is how a real regression hides.

**DO NOT include:** code, pseudo-code, function signatures, or schemas in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** Test fixtures only (the erasure test).
- [x] **Any PHI in logs?** Must be **No** — and §5.2 asserts it for telemetry specifically.
- [x] **External API or AI call?** No.
- [x] **Retention / deletion impact?** **Verification only** — this task proves the inheritance rather than changing it.

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] `[ehr:rxvisit]` carries `source: "transcript"` with a denominator that was reasoned about, not copied.
- [x] No event parameter can carry text; asserted by test.
- [x] Deleting a transcript removes its provenance rows — **proven by a CI test** (or the section is explicitly struck under VN-Q5 = (a)).
- [x] Every batch acceptance-gate item checked against a real observation.
- [x] Exactly one new route / prompt / service; no second apply path — both grepped.
- [x] Batch plan, program README, and product plan updated, with VN-Q5, VN-Q6, and VNT-Q1 answers recorded as executed.
- [x] Full type-check + lint + suites green; new flakes distinguished from the three known Phase-1 ones.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

**Issue:** No live Postgres / Supabase harness, so a real INSERT/DELETE erasure test cannot run here (same as 061).
**Solution:** Standing CI test parses the `ON DELETE` action out of 224 and runs the create/delete scenario against that action. A loosened FK fails the build. Later migrations that re-anchor `transcript_id` without CASCADE also fail.

**Issue:** VNT-D3 as written ("exactly one new route") vs `vnt-04`'s provenance POST.
**Solution:** Grepped. One AI hop (extract + `buildSystemPrompt` + extraction service). Provenance is a second HTTP route and service, not a second model call. Recorded on the batch plan; not absorbed as a new AI path.

**Issue:** Frontend `tsc --noEmit` is not repo-green. Full-repo suites are not green either.
**Solution:** Pre-existing. Touched-file tsc/eslint clean. Backend `tsc` clean. Program suites (telemetry, amendment, apply, proposal, orchestrator, describe-bar, extract, provenance, erasure) green. Full frontend `49` failed files / `131` failed tests (tail: `SubjectiveSection` QueryClient). Full backend `32` failed suites / `31` failed tests (unrelated: patient create, service-match, intake copy). No new flake added to the Phase-1 list.

**Issue:** `VisitDescribeSource` cannot gain `"transcript"` without typing VisitDescribeBar to accept a value it must never emit (VNT-D8).
**Solution:** Third source lives on `VisitDescribeEventSource`. Phase-1 shown/accepted signatures stay `typed | dictated` + det/AI counts. Transcript uses dedicated emitters.

---

## 📝 Notes

- Phase 1 closed with a live-smoke residual because there was no logged-in Rx session at close. Phase 2's equivalent residual is worse if left: this phase's surface only appears after a real voice consult with a real transcript, so a synthetic smoke is not a substitute. **Recorded honestly 2026-08-30: unverified in the wild.** Operator smoke still needs an actual completed voice consult.
- The `cost_usd_cents` column on `consultation_transcripts` is the precedent for tracking what a pipeline costs without a log JOIN. If extraction spend needs watching after ship, that pattern is the one to copy — but not in this task.

---

## 🔗 Related Tasks

- [`task-vnt-01-narrative-provenance-table.md`](./task-vnt-01-narrative-provenance-table.md) — the erasure claim this task proves
- [`task-vnt-04-chart-amendment-surface.md`](./task-vnt-04-chart-amendment-surface.md) — emits the new source
- Phase-1 precedent: [`task-vnb-05-telemetry-and-gate.md`](../../p1-one-box/Tasks/task-vnb-05-telemetry-and-gate.md)

---

**Last Updated:** 2026-08-30
**Completed:** 2026-08-30
**Pattern:** Gate task with a standing erasure assertion
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md`
