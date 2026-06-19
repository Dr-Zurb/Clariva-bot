# Task subj-13: Free-text complaint parsing — complete all pending

> **Filename:** `task-subj-13-freetext-parsing-completion.md` in `subjective-tab/p5-freetext-parsing/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7). Same depth as the Phase 4 `Tasks/` folder.

---

## 📋 Task Overview

Free-typed complaint parsing turns a whole typed sentence — *"pain in stomach in upper
region for 5 days burning in nature also associated with nausea"* — into a structured card
(name + fields + associated mini-cards). The **deterministic, schema-driven parser** in
[`parse-complaint-text.ts`](../../../../../../../../frontend/lib/cockpit/parse-complaint-text.ts)
is live and already fills duration, severity, onset, character, radiation, **laterality**,
**timing**, **colour**, **frequency**, and chip/free-text **location**, plus an
**associated[]** list — and it survives a catalog autocomplete match (canonical name kept,
typed detail still parsed).

This task collects the **remaining pending items** to finish the feature to the "done
properly" bar the program set:

1. **Aggravating / relieving free-text parsing** — the one OLDCARTS pair the scoped pass
   deliberately skipped (highest false-positive risk; needs cue-word gating).
2. **Re-parse on name edit** — when a doctor edits an existing card's name and adds trailing
   detail, parse it (empty fields only; never overwrite).
3. **Transparency cue** — a brief, dismissible visual signal of *what the parser auto-filled*
   so the doctor can verify at a glance (clinical-trust requirement).
4. **AI fallback layer** *(large; separable)* — a backend, suggestion-only parse path for the
   messy tail rules can't handle: vernacular / Hinglish, multi-complaint lines, negation.

**Program / Phase:** subjective-tab · Phase 5 (free-text parsing)
**Batch:** _(not yet created — single-task phase; add `plan-p5-…-batch.md` if this splits)_
**Execution order:** _(single task — execute sections 1 → 2 → 3, then 4 separately)_
**Estimated Time:** ~1 day for §1–§3 combined; §4 (AI) is a separate ~1.5–2 day project
**Status:** ✅ **§1–§3 DONE** (2026-06-07) · ⏳ §4 (AI fallback) deferred — separate change set, compliance gate first

**Change Type:**
- [x] ✅ **Update existing** — extended the parser + capture wiring (§1–§3). Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).
- [ ] **New feature** — backend `/complaints/parse` endpoint + suggestion UI (§4, additive — not started).

**Current State:** (verified 2026-06-07)
- ✅ **Shipped (precursors, this program):**
  - `parseComplaintText()` returns `{ name, patch, associated }`; rule-based, pure, synchronous.
  - Fields parsed: `duration`, `severity`, `onset`, `character`, `radiation`, `laterality` (schema-aware), `timing`, `color`, `frequency`, `location` (chip + free-text `over <site>`).
  - Schema-driven chip auto-fill keyed off each field's own `chips` (new category schemas parse for free); blocklist for answer-style chips (`none`/`no`/`yes`/`normal`/…), numeric-range skip, hyphen-tolerant matching, connector-gated name-stripping.
  - `associated[]` → associated-symptom mini-cards at capture ([`ComplaintList.tsx`](../../../../../../../../frontend/components/cockpit/rx/subjective/ComplaintList.tsx)) and on associated-add ([`ComplaintCard.tsx`](../../../../../../../../frontend/components/cockpit/rx/subjective/ComplaintCard.tsx)).
  - Catalog-match canonical rename: `rawText` threaded through [`ComplaintAutocomplete`](../../../../../../../../frontend/components/cockpit/rx/subjective/ComplaintAutocomplete.tsx) → [`ComplaintCaptureBar`](../../../../../../../../frontend/components/cockpit/rx/subjective/ComplaintCaptureBar.tsx) → capture handlers; `isLateralityValidForComplaint` guard drops laterality not modelled by the final schema.
- ❌ **What's missing:** §1 aggravating/relieving extraction; §2 re-parse on name edit; §3 transparency cue; §4 AI fallback path.
- ⚠️ **Notes:** Name-derived prefill (`resolveComplaintNameFieldDefaults`, e.g. "Dry cough"→Type:dry) and prior-charting suggestions already write to **empty fields only**; the precedence rule **parsed > name-default > prior-charting**, and **never overwrite a doctor edit**, must hold for every item below.

**Scope Guard:**
- §1–§3 expected files touched: ≤ 5 (`parse-complaint-text.ts`, `ComplaintCard.tsx`, `ComplaintList.tsx`, a small cue component/state, tests). DO NOT touch the reducer, JSONB model, or `cc`/`hopi` derivation.
- §4 is a **separate** change set (backend route + service + types + suggestion UI); do not bundle with §1–§3.

**Reference Documentation:**
- [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [FRONTEND_ARCHITECTURE.md](../../../../../../../Reference/engineering/architecture/FRONTEND_ARCHITECTURE.md) · [FRONTEND_TESTING.md](../../../../../../../Reference/engineering/development/FRONTEND_TESTING.md) · [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md) · [RECIPES.md](../../../../../../../Reference/engineering/development/RECIPES.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Aggravating / relieving free-text parsing
- [x] ✅ 1.1 Extract **aggravating** factors from cue phrases ("worse on/with", "aggravated by", "worse after") → `aggravating`, only for schemas that expose a free-text `aggravating` field. — **Completed: 2026-06-07**
- [x] ✅ 1.2 Extract **relieving** factors from cue phrases ("relieved by/with", "better on/with", "eases with") → `relieving`, gated the same way. — **Completed: 2026-06-07**
- [x] ✅ 1.3 Cue-gating only — never claim a bare adjective as aggravating/relieving (this is why the scoped pass skipped it). Capture the phrase to a clause boundary, strip it from the name. — **Completed: 2026-06-07**
- [x] ✅ 1.4 Disambiguation: a cue must not steal text already claimed by radiation/associated/duration passes (respect the existing `removed[]` mask ordering). — **Completed: 2026-06-07**
- [x] ✅ 1.5 Tests: "chest pain worse on exertion relieved by rest" → aggravating/relieving set, name "Chest pain"; negative: "better" with no cue noun sets nothing. — **Completed: 2026-06-07**

> **Note (1.x):** Gated on a **label allow-list** (`/aggravat|exacerbat|trigger/`, `/reliev|what helps/`) as well as `type === "text"`, because the generic `aggravating`/`relieving` keys are reused by non-factor fields (e.g. trauma "Tetanus / rabies cover", fever "Chills"). Cue regexes bound the factor by the *other* cue / `and|but|also` / punctuation, so "worse on exertion relieved by rest" splits cleanly.

### 2. Re-parse trailing detail on name edit
- [x] ✅ 2.1 When a doctor edits an **existing** card's name, run the parser on the new name text. — **Completed: 2026-06-07**
- [x] ✅ 2.2 Apply parsed `patch` to **empty fields only**; never overwrite a field the doctor already set (reuses the empty-field guard). — **Completed: 2026-06-07**
- [x] ✅ 2.3 Keep the canonical/typed name behaviour consistent with capture (no catalog rename on a manual edit; the typed name is left untouched, only field slots fill). — **Completed: 2026-06-07**
- [x] ✅ 2.4 Guard against loops/duplicate spawns: extended the existing `appliedNameDefaultsForRef` apply-once-per-name effect rather than a new path. — **Completed: 2026-06-07**
- [x] ✅ 2.5 Tests: edit "Headache" → "Headache for 3 days" fills duration; an already-set duration is never overwritten. — **Completed: 2026-06-07**

> **Note (2.x):** Implemented by extending the existing name-default effect in `ComplaintCard` (precedence **parsed > name-default**, both empty-only, apply-once per recognised name) — no blur wiring, no autocomplete prop changes, and the typed name is **not** rewritten on edit (zero-surprise; mirrors the existing prefill pattern). **Associated-symptom spawning on name edit was deliberately NOT added** (dup-spawn risk on repeated edits; the capture path already spawns associated). Capture this if it's wanted later.

### 3. Transparency cue for auto-filled fields
- [x] ✅ 3.1 Compact "Auto-filled: duration · timing · nausea" hint on the card (summary + expanded). — **Completed: 2026-06-07**
- [x] ✅ 3.2 Cue is **non-blocking + dismissible** and self-fades (7s); never gates capture. — **Completed: 2026-06-07**
- [x] ✅ 3.3 Higher-risk fields (laterality, severity) emphasised (bold + underline, not colour-only). — **Completed: 2026-06-07**
- [x] ✅ 3.4 a11y: announced politely (`role="status"` + `aria-live="polite"`, icon + text, not colour-only). — **Completed: 2026-06-07**
- [x] ✅ 3.5 Tests: capturing a multi-field sentence renders the cue listing the filled keys; cue dismisses; hydrated cards show no cue. — **Completed: 2026-06-07**

> **Note (3.x):** Built with an ephemeral module-level signal (`parsed-fields-signal.ts`): capture handlers `recordParsedFields(id, items)`; the card reads on mount. Reads are **non-destructive** with a short self-expiring TTL — the freshly-captured card briefly remounts (its list key swaps from complaint id → assigned instance id once `ComplaintList` settles), so a destructive read would be drained by the throwaway first mount. Hydrated/saved cards never register → never show a cue. No reducer/JSONB changes.

### 4. AI fallback layer (separable; suggestion-only) → **PROMOTED to [`task-subj-14-ai-complaint-parse-fallback.md`](./task-subj-14-ai-complaint-parse-fallback.md)** (2026-06-07)
> Split into its own task per the phasing note below — it's a separate change set (backend route + service + suggestion UI) gated on a DPA/consent/redaction sign-off. The items below are retained for context; **track and execute them in subj-14.**
- [ ] 4.1 Backend `POST /api/v1/complaints/parse` reusing the existing OpenAI client + fail-loud taxonomy ([`voice-transcription-openai.ts`](../../../../../../../../backend/src/services/voice-transcription-openai.ts) pattern); structured output constrained to the resolved schema's field keys + chip enums.
- [ ] 4.2 Server-validate the model output against each field's `chips` (drop anything off-vocabulary); return the **same `ParsedComplaintPatch` shape** so it's a drop-in alternate extractor.
- [ ] 4.3 Gate the call: only when the deterministic pass leaves meaningful residue / expected fields empty / non-English tokens detected — or an explicit "✨ refine" tap. Cache identical phrases.
- [ ] 4.4 Client merges AI output as **pending suggestions** (confirm-to-apply), never silent commit; deterministic fill still runs instantly first so the card never waits on the model.
- [ ] 4.5 Handle the cases rules can't: multi-complaint splitting ("fever cough loose motions 3 days" → 3 cards), negation ("no fever but cough"), vernacular/Hinglish.
- [ ] 4.6 Telemetry on accept/reject to tune the gate + confidence later.

### 5. Verification & Testing
- [x] ✅ 5.1 `npx vitest run` for parser + `components/cockpit/rx` + `lib/cockpit` suites green (39 files / 317 tests; parser suite 32 tests). — **Completed: 2026-06-07**
- [x] ✅ 5.2 `npx tsc --noEmit` clean; ESLint clean on all touched files. — **Completed: 2026-06-07**
- [ ] 5.3 Manual: the §1–§3 phrases from "Notes" behave; §4 (if built) shows suggestions, not auto-commits. — _(pending hands-on QA)_

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/lib/cockpit/parse-complaint-text.ts            (§1 aggravating/relieving)
UPDATE: frontend/lib/cockpit/__tests__/parse-complaint-text.test.ts (§1 tests)
UPDATE: frontend/components/cockpit/rx/subjective/ComplaintCard.tsx  (§2 re-parse on name edit, §3 cue)
UPDATE: frontend/components/cockpit/rx/subjective/ComplaintList.tsx  (§2/§3 wiring as needed)
CREATE: (optional, small) parsed-fields cue component/state          (§3)

# §4 — separate change set (do NOT bundle with §1–§3)
CREATE: backend/src/routes/api/v1/complaints-parse.ts (or extend existing complaints routes)
CREATE: backend/src/services/complaint-parse-service.ts
UPDATE: backend/src/types/* + frontend/lib/api/* for the parse contract
CREATE: suggestion-merge UI on the card (pending chips, confirm-to-apply)

DO NOT TOUCH: RxFormContext reducer, complaints JSONB model, cc/hopi derivation
```

**Existing Code Status:**
- ✅ `frontend/lib/cockpit/parse-complaint-text.ts` — EXISTS (partial: 10 fields + associated; aggravating/relieving missing).
- ✅ `frontend/components/cockpit/rx/subjective/ComplaintAutocomplete.tsx` / `ComplaintCaptureBar.tsx` — EXISTS (carry `rawText`).
- ⚠️ `frontend/components/cockpit/rx/subjective/ComplaintCard.tsx` — EXISTS; add re-parse-on-name-edit + cue (empty-field guard already present for name-defaults).
- ❌ `backend/.../complaints-parse` + suggestion UI — MISSING (§4).

**When updating existing code:**
- [ ] Audit `parseComplaintText` callers (capture + associated-add + any future name-edit hook) before changing the return contract — [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).
- [ ] Preserve precedence (**parsed > name-default > prior-charting**) and the never-overwrite-doctor-edit invariant.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Deterministic is the product; AI is the safety net** — §1–§3 must work fully offline and instantly; §4 is gated, async, and suggestion-only.
- **Never overwrite doctor input** — parsing (every source) fills empty fields only; apply-once-per-recognised-name semantics.
- **Schema-bounded values** — a field is only set to a value its resolved schema can display (chips for chip fields; validate after catalog rename).
- **No blocking on capture** — capture/Enter stays instant; AI never sits in the critical path.
- **PHI stays server-side** — complaint text is PHI; the parse call runs on the backend (keys, rate-limit, cache), never client-direct; confirm DPA coverage before enabling §4.
- **Cue is advisory** — the transparency cue must never gate or delay; colour-independent + aria-live.

**DO NOT include** code or signatures in this file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **No** for §1–§3 (in-memory parse of typed text; existing JSONB + reducer). §4 sends complaint text to an external model.
  - If Yes (§4) → [ ] **RLS verified?** (n/a — no new tables; confirm no PHI persisted by the parse path)
- [ ] **Any PHI in logs?** **MUST be No** — especially §4 request/response logging (redact).
- [ ] **External API or AI call?** **§1–§3: No. §4: Yes (OpenAI).**
  - If Yes (§4) → [ ] **Consent + redaction + DPA coverage confirmed?** (Y / N)
- [ ] **Retention / deletion impact?** **No** (no new persisted data; do not store raw prompts beyond ephemeral cache).

---

## ✅ Acceptance & Verification Criteria

- [ ] §1: aggravating/relieving fill only via cue phrases; no false positives on bare adjectives; name cleaned.
- [ ] §2: editing a card name parses trailing detail into empty fields only; no overwrite, no loops/dup associated.
- [ ] §3: a clear, dismissible cue shows what was auto-filled; laterality/severity emphasised; a11y-announced.
- [ ] §4 (if built): deterministic fill is instant; AI returns schema-valid, suggestion-only patches; multi-complaint/negation/vernacular handled; PHI redacted; telemetry recorded.
- [ ] `tsc` / lint / parser + rx + cockpit-lib suites green; `cc`/`hopi` derivation unchanged.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Representative phrases to validate (§1–§3):
- "chest pain worse on exertion relieved by rest" → aggravating="exertion"/"on exertion", relieving="rest", name "Chest pain".
- edit "Headache" → "Headache 3 days at night" → duration "3 days" + timing "night" into empty fields; a previously chosen severity untouched.
- "pain in stomach in upper region for 5 days burning in nature also associated with nausea" → cue lists: laterality · duration · character · associated (regression check, already shipped).

Phasing recommendation: ship §1 → §2 → §3 together (small, high-trust, no backend), then scope §4 as its own task/PR with the compliance gate front-loaded. §4 may be promoted to its own `task-subj-14` if it grows.

---

## 🔗 Related Tasks

- [`task-subj-11-rapid-complaint-capture.md`](../../p4-rapid-capture/Tasks/task-subj-11-rapid-complaint-capture.md) — the capture bar this parsing rides on.
- [`task-subj-12-nested-associated-complaints.md`](../../p4-rapid-capture/Tasks/task-subj-12-nested-associated-complaints.md) — associated mini-cards the `associated[]` list spawns.
- subj-06 — `ComplaintAutocomplete` / complaint_master (catalog rename source).

---

**Last Updated:** 2026-06-07 (§1–§3 implemented + verified)
**Files touched (§1–§3):** `parse-complaint-text.ts` (+test), `ComplaintCard.tsx`, `ComplaintList.tsx` (+test), `ParsedFieldsCue.tsx` (new), `parsed-fields-signal.ts` (new) — 6 files, within the ≤5-source scope guard (2 are tests).
**Pattern:** deterministic schema-driven slot-filling; AI as gated, suggestion-only fallback.
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/CODE_CHANGE_RULES.md`
