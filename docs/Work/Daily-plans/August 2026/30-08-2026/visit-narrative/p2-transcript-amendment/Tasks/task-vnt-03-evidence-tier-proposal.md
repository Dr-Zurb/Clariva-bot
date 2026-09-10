# Task vnt-03: Evidence-tier proposal rows

> **Filename:** `task-vnt-03-evidence-tier-proposal.md` in this phase's `Tasks/` folder.
> **Relative-link note:** `process/` = six `../`; `Product plans/` = six; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).
> **Model: Opus (max thinking). Auto must not run this task.**
> **Waits on `vnt-02`.** The response contract must be locked before this starts. Do not build against a guessed shape — that is the mistake Phase 1 avoided by locking the DTO in `vnb-03`.

---

## 📋 Task Overview

Phase 1's proposal has one tier of trust: deterministic hits apply on Enter, model-touched items become confirm cards. This task adds a second tier underneath both.

Doctor-authored text is an **assertion** — the doctor typed it, so it carries their authority. A patient's recorded words are **evidence** — they are a fact about what was said, not a clinical judgement about what is true. A patient saying "I think I have dengue" is not a diagnosis, and the interface must never let it become one by momentum.

So a transcript-derived row: shows the verbatim quote it came from, is accepted one at a time, and never applies by itself — **including when a deterministic recognizer matches it cleanly** (VNT-D4). That last part is the one an implementer is most likely to get wrong, because Phase 1's `splitVisitProposal` currently routes every deterministic hit straight to auto-apply.

**Program / Phase:** visit-narrative · Phase 2 (transcript amendment)
**Batch:** [`plan-p2-visit-narrative-transcript-amendment-batch.md`](../plan-p2-visit-narrative-transcript-amendment-batch.md)
**Execution order:** [`EXECUTION-ORDER-p2-visit-narrative-transcript-amendment.md`](./EXECUTION-ORDER-p2-visit-narrative-transcript-amendment.md)
**Estimated Time:** ~4 hours
**Status:** ✅ **COMPLETE** (2026-08-30, owner override of model lock). Evidence tier on the Phase-1 proposal; typed/dictated paths unchanged.
**Completed:** 2026-08-30

**Change Type:**
- [ ] **New feature**
- [x] **Update existing** — widens shipped Phase-1 modules. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (checked against the codebase)
- ✅ **What exists:** `frontend/lib/cockpit/visit-parse-orchestrator.ts` — the `VisitParseProposal` DTO with six tab ids (`subjective`, `plan`, `vitals`, `assessment`, `investigations`, `prose`), parallel `…Source` arrays carrying `deterministic | ai`, and `emptyVisitParseProposal`.
- ✅ **What exists:** `frontend/lib/cockpit/visit-parse-apply.ts` — `splitVisitProposal` splits a proposal into `applied` (deterministic → writes immediately) and `pending` (AI → confirm cards), plus the per-target apply helpers.
- ✅ **What exists:** `frontend/components/cockpit/rx/subjective/VisitParseProposal.tsx` — group rendering, `TAB_LABEL`, per-group "Add all", applied summary.
- ✅ **What exists:** `frontend/components/cockpit/rx/subjective/VisitDescribeBar.tsx` — the trust split and telemetry emission.
- ❌ **What's missing:** a source that is neither the doctor's keystrokes nor their dictation; any notion of a quote; any way for a deterministic hit to *not* auto-apply.
- ⚠️ **Notes:** `splitVisitProposal` keys purely off `deterministic | ai`. Widening the source union is not enough on its own — the split's branch condition has to change too, or transcript-derived vitals will silently write. This is the single highest-risk line in the task.
- ⚠️ **Notes:** the quote is produced by **slicing the transcript text with the span**, client-side. It is never read from a model-authored field, because `vnt-02` does not return one.

**Scope Guard:**
- Expected files touched: ≤ 7 (API client, orchestrator DTO, apply split, proposal component, and their suites)
- **Phase-1 typed / dictated behavior is frozen** (VNT-D8). Widening a DTO with an optional evidence field is in scope. Changing what a typed input does is not.
- Phase-1 suites (`visit-segmenter`, `visit-parse-orchestrator`, `visit-parse-apply`, `VisitDescribeBar`, `VisitParseProposal`) must pass **without edits**, except where a test asserts a signature this task legitimately widened.
- No new apply path (VNT-D5). No second writer.
- No change to the structured form, capture bars, or autocomplete (VN-DL-2 — still).
- Any expansion requires explicit approval.

**Reference Documentation:**
- [`plan-visit-narrative.md`](../../../../../../Product%20plans/plan-visit-narrative.md) — VN-DL-5, VN-DL-11, VN-DL-12
- Batch locks VNT-D4, VNT-D5, VNT-D6, VNT-D8
- Phase-1 lock VNB-D4 (the trust split this task carves an exception into)
- [FRONTEND_TESTING.md](../../../../../../../Reference/engineering/development/FRONTEND_TESTING.md) · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Audit before changing (CODE_CHANGE_RULES)
- [x] ✅ 1.1 Read `vnt-02`'s locked response contract. Note the exact span semantics — what the offsets index, and into which text. - **Completed: 2026-08-30**
- [x] ✅ 1.2 Map every current consumer of the `…Source` arrays. There are more than the two obvious ones; the split, the proposal component, and the telemetry counts all read them. - **Completed: 2026-08-30**
- [x] ✅ 1.3 Write down, before editing, every place a `deterministic` value currently implies "safe to write without asking". Each one is a site this task has to reconsider. - **Completed: 2026-08-30**

### 2. Widen the source, not the meaning
- [x] ✅ 2.1 Extend the item source so a row can be marked as transcript-derived and carry its span. - **Completed: 2026-08-30**
- [x] ✅ 2.2 Keep the Phase-1 two-value behavior byte-identical for typed and dictated input. A proposal with no transcript rows must serialise and render exactly as it does today. - **Completed: 2026-08-30**
- [x] ✅ 2.3 The evidence carrier is the span plus the identity of the transcript it indexes — **not** a quote string baked into the DTO at parse time. - **Completed: 2026-08-30**

### 3. The trust exception (VNT-D4) — the crux
- [x] ✅ 3.1 `splitVisitProposal` must never place a transcript-derived item into `applied`, regardless of recognizer confidence. - **Completed: 2026-08-30**
- [x] ✅ 3.2 Prove it for the case that would otherwise slip through: a transcript line that the **vital grammar parses cleanly** (the strongest deterministic signal in the system) still lands as a confirm card. - **Completed: 2026-08-30**
- [x] ✅ 3.3 No per-group "Add all" on any group containing transcript rows. No global accept. Per-item only (VN-DL-12). - **Completed: 2026-08-30**
- [x] ✅ 3.4 Verify a mixed proposal behaves correctly — if a session can ever hold both typed and transcript rows, the typed ones keep Phase-1 trust and the transcript ones do not. If the surfaces are strictly separate, state that in Notes and test that the mixed case cannot arise. - **Completed: 2026-08-30**

### 4. Render the evidence
- [x] ✅ 4.1 Each transcript row shows the verbatim quote, sliced from the transcript text using the span. - **Completed: 2026-08-30**
- [x] ✅ 4.2 A row whose span does not slice cleanly on the client is **dropped, not rendered blank**. `vnt-02` already drops unanchored lines server-side; this is the second line of defence, and the two must agree. - **Completed: 2026-08-30**
- [x] ✅ 4.3 The quote is visually distinguishable from doctor-authored text. The reader must be able to tell "the patient said this" from "this is your note" without reading carefully. - **Completed: 2026-08-30**
- [x] ✅ 4.4 Long quotes are bounded for layout without changing what was said — truncation must be visibly truncation, never a silent edit of someone's words. - **Completed: 2026-08-30**
- [x] ✅ 4.5 The quote is rendered as text, never as markup. - **Completed: 2026-08-30**

### 5. API client
- [x] ✅ 5.1 Add the frontend client for the `vnt-02` route, following the existing `frontend/lib/api/` convention (`complaint-parse.ts` / `investigation-parse.ts` are the shape). - **Completed: 2026-08-30**
- [x] ✅ 5.2 Fail-soft to match the backend: an unavailable or empty extraction degrades to "nothing to review", never an error dialog mid-consult. - **Completed: 2026-08-30**

### 6. Verification & Testing
- [x] ✅ 6.1 **The trust test.** A transcript row that parses deterministically does not auto-apply. Assert on the write path, not just the rendering. - **Completed: 2026-08-30**
- [x] ✅ 6.2 No "Add all" affordance is reachable for a transcript group; no code path accepts more than one transcript row per user action. - **Completed: 2026-08-30**
- [x] ✅ 6.3 Quote round-trip: the rendered quote equals the transcript slice for the given span, character for character. - **Completed: 2026-08-30**
- [x] ✅ 6.4 A row with an unresolvable span never reaches the DOM. - **Completed: 2026-08-30**
- [x] ✅ 6.5 Quote text containing markup-like characters renders as literal text. - **Completed: 2026-08-30**
- [x] ✅ 6.6 **Regression lock:** the Phase-1 suites pass. Enumerate in Notes any test that legitimately changed and why — every one of those is a place Phase-1 behavior was touched, and needs to be justified against VNT-D8. - **Completed: 2026-08-30**
- [x] ✅ 6.7 `npx tsc --noEmit` + lint on touched files. - **Completed: 2026-08-30**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/lib/api/visit-narrative-extract.ts
CREATE: frontend/lib/api/__tests__/visit-narrative-extract.test.ts
UPDATE: frontend/lib/cockpit/visit-parse-orchestrator.ts              (source union + span carrier)
UPDATE: frontend/lib/cockpit/visit-parse-apply.ts                     (split exception — VNT-D4)
UPDATE: frontend/components/cockpit/rx/subjective/VisitParseProposal.tsx  (evidence tier)
UPDATE: frontend/lib/cockpit/__tests__/visit-parse-apply.test.ts
UPDATE: frontend/components/cockpit/rx/subjective/__tests__/VisitParseProposal.test.tsx
```

**Existing Code Status:**
- ✅ `visit-parse-orchestrator.ts` — EXISTS (shipped `vnb-03` / `vnb-04`). Widened, not rewritten.
- ✅ `visit-parse-apply.ts` — EXISTS. `splitVisitProposal` gains the transcript exception.
- ✅ `VisitParseProposal.tsx` — EXISTS. Gains the evidence tier.
- ✅ `frontend/lib/api/complaint-parse.ts` — EXISTS. The client convention to follow. **Not modified.**

**When updating existing code:** (MANDATORY)
- [x] Audit current implementation (files, callers, config) — see [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)
- [x] Map desired change to concrete code changes (what to add, change, remove)
- [x] Remove obsolete code and config
- [x] Update tests and docs per CODE_CHANGE_RULES

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Evidence is not assertion.** The entire tier exists to keep a patient's words from acquiring a doctor's authority by passing through a UI. Any change that makes a transcript row easier to accept in bulk is a regression of the feature's purpose, not a UX improvement.
- **The quote is a slice, never an echo.** If the quote can be produced from the model response rather than from the transcript, fabrication becomes possible again and `vnt-02`'s server-side verification is wasted.
- **The split is the safety boundary, not the rendering.** A test that only asserts a card is visible does not prove the item didn't also write.
- Phase-1 behavior is frozen (VNT-D8). The typed and dictated paths are this task's regression lock, exactly as the capture-bar suites were Phase 1's.
- No new apply path (VNT-D5).
- Telemetry stays counts-only (VN-DL-11) — quote length, quote text, and span values are all off-limits as event parameters. `vnt-05` owns the new dimension; do not add it here.

**DO NOT include:** code, pseudo-code, function signatures, or schemas in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Yes** — renders transcript text in the browser (already doctor-visible via the replay surface, but new here).
  - [x] **RLS verified?** Enforced upstream at the `vnt-02` route; this task adds no new data access of its own.
- [x] **Any PHI in logs?** **No** — client fail-softs without logging response bodies; quote text is not passed to telemetry.
- [x] **External API or AI call?** No new one. Calls the `vnt-02` route only.
- [x] **Retention / deletion impact?** No. Nothing is persisted by this task.

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] A transcript-derived row renders its verbatim quote, sliced from the transcript.
- [x] **No transcript-derived item auto-applies** — including a cleanly-parsed vital (test 6.1, asserted on the write path).
- [x] No bulk accept exists for any transcript group; per-item only.
- [x] Rows with unresolvable spans never render.
- [x] Quote text renders literally, never as markup.
- [x] Phase-1 typed / dictated behavior unchanged; Phase-1 suites green, with every changed test justified in Notes.
- [x] No quote text reaches telemetry or logs.
- [x] Type-check + lint + frontend suites green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

**Issue:**
**Solution:**

---

## 📝 Notes

- `vnb-04` built `splitVisitProposal` around a binary `deterministic | ai` decision, and that binary is load-bearing in more places than it looks. Task 1.2/1.3 exist because widening the union without revisiting every consumer is the most likely way this task ships a silent transcript write.
- Two independent span checks (server at `vnt-02` §5, client at 4.2) is deliberate, not redundant. The server check is the guarantee; the client check catches contract drift between the two tasks.
- **3.4 mixed proposals — surfaces are strictly separate today.** `VisitDescribeBar` only calls `parseVisitDescription`, which never writes `source: "transcript"`. Transcript rows are constructed by the amendment surface (`vnt-04`) from extract lines + spans. A mixed in-memory proposal is still handled correctly: typed deterministic items auto-apply, transcript items stay pending (including prose — the Phase-1 path that previously pushed *all* prose to `applied`). Pin is the mixed-proposal write-path test, not a "cannot construct" assertion — an impossible state that isn't asserted has a way of becoming possible later.
- **§1.2/1.3 consumers of `…Source` / `deterministic` ⇒ auto-write:**
  - `splitVisitProposal` — subjective / plan / vitals branch on `=== "deterministic"`; **prose had no source check** (all prose went to `applied`). That was the silent-write risk for transcript prose.
  - `VisitDescribeBar` `kindCountsFromSplit` / `emitDetAccepted` — counts from the split buckets, not the source tag. Transcript items landing in `pending` are counted as AI by Phase-1 telemetry. `vnt-05` owns the new dimension; not changed here.
  - `VisitParseProposal` "Add all" — was `length > 1` for subjective/plan. Now also requires the group has no transcript source.
- **6.6 Phase-1 tests changed:** none. Existing assertions were not edited. New `describe("… (vnt-03)")` blocks were appended. `emptyVisitParseProposal` gained no new required fields, so the orchestrator exact-equality test is unchanged. `VisitItemSource` is a widened union; existing `"deterministic" | "ai"` literals still type-check.
- Span semantics (locked by `vnt-02`): half-open `[spanStart, spanEnd)` into the full stored `transcript_text`. Client `sliceTranscriptQuote` uses the same bounds. The extract line's `text` is a condensed draft, not the quote.
- Frontend `tsc --noEmit` still fails in unrelated files (pre-existing). Touched files produce zero tsc diagnostics. ESLint clean on touched files. 54/54 targeted tests green (Phase-1 apply / orchestrator / VisitParseProposal / VisitDescribeBar + new extract client).

---

## 🔗 Related Tasks

- [`task-vnt-02-extraction-pass.md`](./task-vnt-02-extraction-pass.md) — produces the contract this renders
- [`task-vnt-04-chart-amendment-surface.md`](./task-vnt-04-chart-amendment-surface.md) — the surface that opens these rows
- [Prior phase](../../p1-one-box/) — `vnb-04` built the proposal and the split this task carves an exception into

---

**Last Updated:** 2026-08-30
**Completed:** 2026-08-30
**Pattern:** Evidence tier over an existing trust split; quote by slice, not by echo
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md`
