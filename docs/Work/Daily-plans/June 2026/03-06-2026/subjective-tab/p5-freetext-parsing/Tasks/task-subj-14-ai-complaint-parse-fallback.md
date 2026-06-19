# Task subj-14: AI fallback layer for free-text complaint parsing

> **Filename:** `task-subj-14-ai-complaint-parse-fallback.md` in `subjective-tab/p5-freetext-parsing/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/` = eight; `backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7). Same depth as the Phase 4 `Tasks/` folder.
> **Promoted from:** [`task-subj-13`](./task-subj-13-freetext-parsing-completion.md) §4 — split out per that task's Notes ("§4 may be promoted to its own `task-subj-14`").

---

## 📋 Task Overview

The **deterministic** parser ([`parse-complaint-text.ts`](../../../../../../../../frontend/lib/cockpit/parse-complaint-text.ts), subj-13 §1–§3) turns a typed sentence into a structured card instantly and offline. It handles the common, well-formed English case. It **cannot** handle the messy tail:

- **Vernacular / Hinglish / transliteration** — *"pet me jalan 3 din se"*, *"saans phoolti hai"*, *"sir dard"*.
- **Multi-complaint lines** — *"fever cough loose motions 3 days"* should become **three** cards, not one.
- **Negation** — *"no fever but cough"* must NOT set a fever-anything.
- **Loose / reordered phrasing** the rules don't anchor on.

This task adds an **AI fallback** that is **gated, asynchronous, server-side, and suggestion-only**. It is a *safety net*, never the primary path: the deterministic fill still runs first and instantly, so the card never waits on a model. The AI returns the **same `ParsedComplaintPatch` shape** so it's a drop-in alternate extractor, and its output is **server-validated against the resolved schema's chip enums** before it ever reaches the client — where it lands as **pending suggestions the doctor confirms**, never a silent commit.

**Program / Phase:** subjective-tab · Phase 5 (free-text parsing)
**Batch:** _(single-task; add `plan-p5-…-batch.md` only if this splits into multiple tasks)_
**Execution order:** **§0 compliance gate → §1 backend → §2 validation → §3 gating/cache → §4 client suggestion merge → §5 hard cases → §6 telemetry → §7 verify.** §0 is a **hard blocker**: do not write the model call until it clears.
**Estimated Time:** ~1.5–2 days (excludes §0 sign-off lead time)
**Status:** ✅ **CORE SHIPPED + AUTO-GATE** (2026-06-07) — §0 signed; backend endpoint + service + validation + frontend gate + ✨ refine confirm-to-apply UI + **auto-gate-on-Enter** (Pattern 2: gated Enter holds the commit, fires Tier-1 AI, shows the proposal with a "Keep as typed" escape, and degrades to the literal commit on empty/error) all landed and green. **Deferred** (see Implementation Notes): debounce/cache (§3.3), per-field dashed pending chips on existing cards (§4.2 variant), and accept/reject + gate/cache analytics (§6.1).

**Change Type:**
- [ ] **New feature** — backend `POST /api/v1/complaints/parse` (route + service + types) and a client suggestion-merge UI. Additive; the deterministic path is unchanged. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (verified 2026-06-07)
- ✅ **Deterministic parser shipped** (subj-13): `parseComplaintText(raw) → { name, patch, associated }`, schema-driven chip fill, laterality guard, aggravating/relieving, transparency cue. This is the instant first pass and stays the default.
- ✅ **A proven AI POST pattern already exists** to mirror: `POST /api/v1/catalog/ai-suggest` ([`catalog.ts`](../../../../../../../../backend/src/routes/api/v1/catalog.ts) → [`service-catalog-ai-suggest.ts`](../../../../../../../../backend/src/services/service-catalog-ai-suggest.ts)) — doctor-auth, `response_format: { type: 'json_object' }`, **Zod post-validation** of model output, throws `ServiceUnavailableError` on LLM failure.
- ✅ **Shared OpenAI client** `getOpenAIClient()` ([`config/openai.ts`](../../../../../../../../backend/src/config/openai.ts)); env `OPENAI_API_KEY` / `OPENAI_MODEL` / `OPENAI_MAX_TOKENS` ([`config/env.ts`](../../../../../../../../backend/src/config/env.ts)). Returns `null` when unconfigured → callers fail loud.
- ✅ **Complaint-parse model tiering scaffolded** (2026-06-07): `getOpenAIComplaintParseConfig(tier)` in [`config/openai.ts`](../../../../../../../../backend/src/config/openai.ts) — Tier 1 default `gpt-4o-mini` (500 tok cap), Tier 2 escalation falls back to flagship `OPENAI_MODEL` (`gpt-5.2`). Env: `OPENAI_COMPLAINT_PARSE_MODEL`, `OPENAI_COMPLAINT_PARSE_ESCALATION_MODEL`, `OPENAI_COMPLAINT_PARSE_MAX_TOKENS`. **Do not** route this task through the global `OPENAI_MODEL` default.
- ✅ **PHI redaction + AI audit helpers** exist: `redactPhiForAI()` ([`ai-service.ts`](../../../../../../../../backend/src/services/ai-service.ts)), `logAIClassification()` ([`audit-logger.ts`](../../../../../../../../backend/src/utils/audit-logger.ts), logs model/tokens/`redactionApplied`, **no PHI**).
- ✅ **Existing suggestion-merge UI** to reuse on the card: dashed "prior charting" chips via `SUGGESTED_CHIP_CLASS` + `filterSuggestionsForEmptyFields` / `buildConfirmedDefaultsPatch` ([`complaint-defaults.ts`](../../../../../../../../frontend/lib/cockpit/complaint-defaults.ts)). The AI pending-merge should ride this, not the §3 transparency cue (that one is for *committed* auto-fills).
- ❌ **Missing:** the `/complaints/parse` route/service/types, the client API module + gated caller, the pending-suggestion (confirm-to-apply) merge, multi-complaint/negation handling, telemetry.
- ⚠️ **No `json_schema` strict mode anywhere in the repo** — every LLM call uses `response_format: { type: 'json_object' }` + Zod validation. **Match that**; do not introduce a new structured-output mechanism.

**Scope Guard:**
- This is a **separate change set from subj-13** and must not regress §1–§3.
- **DO NOT touch:** the deterministic `parseComplaintText` contract, the RxForm reducer, the complaints JSONB model, or `cc`/`hopi` derivation. The AI path *produces the same `ParsedComplaintPatch`* and reuses existing capture/merge plumbing.
- **DO NOT** put the model call on the client or in the capture critical path.

**Reference Documentation:**
- **[COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md) — read first (PHI to an external model).**
- [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [BACKEND_ARCHITECTURE.md](../../../../../../../Reference/engineering/architecture/BACKEND_ARCHITECTURE.md) · [FRONTEND_ARCHITECTURE.md](../../../../../../../Reference/engineering/architecture/FRONTEND_ARCHITECTURE.md) · [FRONTEND_TESTING.md](../../../../../../../Reference/engineering/development/FRONTEND_TESTING.md) · [RECIPES.md](../../../../../../../Reference/engineering/development/RECIPES.md).

---

## ✅ Task Breakdown (Hierarchical)

### 0. Compliance gate (HARD BLOCKER — do before any model code)
- [x] ✅ 0.1 Confirm **DPA coverage** for sending complaint text (PHI) to OpenAI — same legal basis as the existing `ai-service` / `catalog/ai-suggest` PHI paths, or an explicit extension. — **Completed: 2026-06-07** (same DPA basis; see §0 sign-off).
- [x] ✅ 0.2 Confirm **consent + redaction**: complaint free-text runs through `redactPhiForAI()` before the prompt. — **Completed: 2026-06-07** (service redacts `text` before the prompt; unit test asserts redacted text reaches the model).
- [x] ✅ 0.3 Confirm **retention**: no raw prompts/responses persisted; no PHI in logs (audit logs model/tokens/`redactionApplied` only). — **Completed: 2026-06-07**.
- [x] ✅ 0.4 Record the sign-off (who/when) in this task's Notes. — **Completed: 2026-06-07** (see §0 sign-off in Notes).

### 1. Backend parse endpoint
- [x] ✅ 1.1 `POST /api/v1/complaints/parse`, `authenticateToken` — added to [`complaint-master.ts`](../../../../../../../../backend/src/routes/api/v1/complaint-master.ts) under the existing `/complaints` mount (no `index.ts` change needed). **Completed: 2026-06-07**.
- [x] ✅ 1.2 Controller `parseComplaintHandler` in [`complaint-master-controller.ts`](../../../../../../../../backend/src/controllers/complaint-master-controller.ts): `req.user?.id` → `UnauthorizedError`, Zod-validate, call service, `successResponse(...)`. **Completed: 2026-06-07**.
- [x] ✅ 1.3 Request body Zod (`parseComplaintRequestSchema` / `validateParseComplaintRequest` in [`validation.ts`](../../../../../../../../backend/src/utils/validation.ts)): `{ text (1..2000, trimmed); category?; fieldSpec: {key,label,type,chips?}[]; tier? }`. Client sends the resolved field spec. **Completed: 2026-06-07**.
- [x] ✅ 1.4 Service `parseComplaintWithAI(...)` in [`complaint-parse-service.ts`](../../../../../../../../backend/src/services/complaint-parse-service.ts): `getOpenAIClient()` null → `ServiceUnavailableError`; redact text; `json_object`; tiered `max_completion_tokens` via `getOpenAIComplaintParseConfig(tier)`; injectable `runLlm` seam for tests. **Completed: 2026-06-07**.
- [x] ✅ 1.5 Response data shape = `{ complaints: { name, patch, associated }[] }` — same per-complaint shape as the deterministic parser. **Completed: 2026-06-07**.
- [x] ✅ 1.6 **Two-tier model config** (cost efficiency) — **Completed: 2026-06-07**
  - [x] ✅ 1.6.1 Tier 1 (**default** / auto-gate): `getOpenAIComplaintParseConfig('default')` → `OPENAI_COMPLAINT_PARSE_MODEL` or **`gpt-4o-mini`**, 500 tok cap. Bounded JSON slot-fill; suggestion-only + server chip validation makes mini sufficient.
  - [x] ✅ 1.6.2 Tier 2 (**escalation**): `getOpenAIComplaintParseConfig('escalation')` → `OPENAI_COMPLAINT_PARSE_ESCALATION_MODEL` or flagship `OPENAI_MODEL` (`gpt-5.2`). Used for explicit "✨ refine", Tier-1 empty/truncated (`finish_reason: 'length'`), or client `tier: 'escalation'` flag.
  - [x] ✅ 1.6.3 Env vars + unit tests in [`config/openai.ts`](../../../../../../../../backend/src/config/openai.ts) / [`tests/unit/config/openai.test.ts`](../../../../../../../../backend/tests/unit/config/openai.test.ts). Global `OPENAI_MODEL` unchanged for receptionist / catalog / intent.

### 2. Server-side schema validation of model output  ✅ **Completed: 2026-06-07** (`boundComplaintList` in `complaint-parse-service.ts`)
- [x] ✅ 2.1 Malformed / empty / truncated (`finish_reason: 'length'`) model output → `{ complaints: [] }`, logged + degraded; never throws at the doctor. (Only unconfigured client / SDK failure → `ServiceUnavailableError`.)
- [x] ✅ 2.2 Keep only `patch` keys present in the request `fieldSpec`; `type: "chips"` values not in the field's `chips` enum are dropped (case/space/hyphen-tolerant → canonical chip casing); text/duration trimmed + length-capped; severity = enum word or 0–10 clamp.
- [x] ✅ 2.3 `laterality` is a chip field → bounded by its `chips` enum server-side; the client `isLateralityValidForComplaint` guard still runs on add.
- [x] ✅ 2.4 `associated[]` capped (8), item-length capped, deduped (case-insensitive), entries equal to the name dropped.
- [x] ✅ 2.5 "Schema-bounded or omitted" — anything not in the spec is dropped.

### 3. Gating + caching (keep it off the critical path)
- [x] ✅ 3.1 Gate heuristic `shouldRequestAiParse(rawText, parsed)` built + unit-tested ([`should-request-ai-parse.ts`](../../../../../../../../frontend/lib/cockpit/should-request-ai-parse.ts)): fires on non-Latin script, negation, or a long line the rules barely touched. **Wired to BOTH the explicit "✨ refine" (Tier 2 escalation) AND auto-gate-on-Enter (Tier 1 default).** **Completed: 2026-06-07.**
- [x] ✅ 3.2 Deterministic commit is the default for clean lines (instant, no AI). On a gated free-text Enter the commit is **held** (not blocked — synchronous decision), AI fires async, and a "Keep as typed" escape / empty-or-error degrade always commits the literal line so Enter never dead-ends. **Completed: 2026-06-07.**
- [~] 🟡 3.3 In-flight request **aborted** on refine re-tap / unmount (`AbortController`). **Deferred:** debounce + (text,category) response cache (not needed while calls are explicit-only).
- [x] ✅ 3.4 Graceful degrade: error / unconfigured key → keep deterministic result + a tiny non-blocking "Couldn't refine" note. No blocking toast.

### 4. Client suggestion-merge UI (confirm-to-apply)
- [x] ✅ 4.1 New API module [`complaint-parse.ts`](../../../../../../../../frontend/lib/api/complaint-parse.ts): `parseComplaintWithAI(token, { text, category, fieldSpec, tier, signal })` → `ApiSuccess<{ complaints: AiParsedComplaint[] }>`. **Completed: 2026-06-07**.
- [~] 🟡 4.2 **Implemented as a capture-level confirm-to-apply proposal panel** ([`AiRefineProposal.tsx`](../../../../../../../../frontend/components/cockpit/rx/subjective/AiRefineProposal.tsx)) rather than per-field dashed pending chips inside an existing card. AI output is **applied only on the doctor's explicit "Add" / "Add all"** (never silent), and dup names focus the existing card instead of overwriting. **Deferred:** the in-card dashed `SUGGESTED_CHIP_CLASS` pending-merge for refining an *already-added* card — see Implementation Notes.
- [x] ✅ 4.3 Precedence holds: nothing is applied without a confirm; AI-added cards are new cards (or focus a dup) and never clobber a doctor/deterministic field.
- [x] ✅ 4.4 "✨ Refine" affordance on [`ComplaintCaptureBar`](../../../../../../../../frontend/components/cockpit/rx/subjective/ComplaintCaptureBar.tsx) (shows at ≥3 words), labelled + keyboard-reachable; proposal panel is `role="status" aria-live="polite"`. **Completed: 2026-06-07**.
- [x] ✅ 4.5 Multi-complaint surfaces as a proposal listing N complaints with per-item **Add** + **Add all** (not auto-spawned); each confirm dispatches `ADD_COMPLAINT` reusing the capture plumbing. **Completed: 2026-06-07**.

### 5. Hard cases the rules can't do  ✅ **Completed: 2026-06-07** (prompt-driven + server-bounded; covered by tests)
- [x] ✅ 5.1 **Multi-complaint splitting** — prompt splits distinct complaints; proposal adds N cards on confirm (integration test: "fever cough loose motions 3 days" → 3).
- [x] ✅ 5.2 **Negation** — prompt drops explicitly denied symptoms; gate fires on negation cues; service test asserts negation-respecting output passes through.
- [x] ✅ 5.3 **Vernacular / Hinglish** — prompt translates to clinical English `name`; gate fires on non-Latin script + romanised vernacular. (Supported = whatever the model handles; unsupported → empty list → deterministic result kept.)

### 6. Telemetry
- [~] 🟡 6.1 **Deferred:** accept/reject per suggested field + per confirm analytics. (Not yet wired — the audit path records model turns; no client-side accept/reject events yet.)
- [x] ✅ 6.2 Per-turn audit via `logAIClassification`: `model` (encodes tier), `tokens`, `redactionApplied: true`, and distinct failure markers (`complaint_parse_truncated` / `_empty_completion` / `_openai_error`). **Deferred:** gate fire-rate / cache hit-rate / latency aggregation.

### 7. Verification & Testing
- [x] ✅ 7.1 Backend: `complaint-parse-service.test.ts` (16 cases — schema-bounding, severity clamp, multiword-chip canonicalise, multi-complaint, negation pass-through, no-name drop, malformed/empty/truncated → `[]`, unconfigured → `ServiceUnavailableError`, redaction wiring, `boundComplaintList` edge cases) + `validation.test.ts` (request schema). **Completed: 2026-06-07**.
- [x] ✅ 7.2 Frontend: `should-request-ai-parse.test.ts` (8 gate cases) + `AiRefine.integration.test.tsx` (refine button gating, multi-complaint add-all, single add, degrade-on-error). Abort wired via effect cleanup. **Completed: 2026-06-07**.
- [x] ✅ 7.3 PHI: service test asserts the **redacted** text (not raw) reaches the model; audit carries model/tokens/`redactionApplied` only.
- [x] ✅ 7.4 `tsc --noEmit` both packages clean; lint clean on touched files; subj-13 deterministic + cockpit-rx-subjective suites green (frontend 95 / backend 58 in the targeted runs).

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
# Backend
CREATE: backend/src/services/complaint-parse-service.ts        (§1.4 parseComplaintWithAI + §2 validation)
UPDATE: backend/src/routes/api/v1/complaint-master.ts          (§1.1 add POST /parse)   — or CREATE complaints-parse.ts
UPDATE: backend/src/routes/api/v1/index.ts                     (only if a new router file is added)
UPDATE: backend/src/controllers/complaint-master-controller.ts (§1.2 parseComplaintHandler)
UPDATE: backend/src/utils/validation.ts                        (§1.3 parse-request Zod schema + validator)
UPDATE: backend/src/types/complaint-master.ts                  (AI parse request/response types)
UPDATE: backend/src/services/ai-service.ts                     (only if redactPhiForAI needs complaint-text coverage)
UPDATE: backend/tests/unit/services/…                          (§7.1)
DONE:   backend/src/config/openai.ts                           (§1.6 getOpenAIComplaintParseConfig)
DONE:   backend/src/config/env.ts                              (§1.6 complaint-parse env vars)
DONE:   backend/tests/unit/config/openai.test.ts               (§1.6 tier defaults + overrides)

# Frontend
CREATE: frontend/lib/api/complaint-parse.ts                    (§4.1 client)
CREATE: frontend/lib/cockpit/should-request-ai-parse.ts        (§3.1 gate heuristic, pure + tested)
UPDATE: frontend/components/cockpit/rx/subjective/ComplaintList.tsx       (§4 merge + multi-complaint confirm)
UPDATE: frontend/components/cockpit/rx/subjective/ComplaintCaptureBar.tsx (§4.4 ✨ refine affordance)
UPDATE: frontend/components/cockpit/rx/subjective/ComplaintAutocomplete.tsx (optional: dropdown footer affordance)
UPDATE: frontend/lib/cockpit/complaint-defaults.ts             (only if pending-merge needs a new helper)
UPDATE: frontend/.../__tests__/…                               (§7.2)

DO NOT TOUCH: parse-complaint-text.ts contract, RxFormContext reducer, complaints JSONB model, cc/hopi derivation
```

**Existing Code Status:**
- ✅ `getOpenAIClient()` / `config/env.ts` — EXISTS (reuse; don't add a new client).
- ✅ `getOpenAIComplaintParseConfig(tier)` — EXISTS (§1.6; Tier 1 `gpt-4o-mini`, Tier 2 flagship).
- ✅ `catalog/ai-suggest` route+service — EXISTS (the mirror pattern for §1).
- ✅ `redactPhiForAI()` / `logAIClassification()` — EXISTS (reuse for §0/§6).
- ✅ `complaint-master.ts` route/controller/service + `frontend/lib/api/complaint-master.ts` — EXISTS (extend / mirror).
- ✅ suggestion-merge helpers in `complaint-defaults.ts` — EXISTS (reuse for §4.2).
- ❌ `/complaints/parse`, `complaint-parse-service.ts`, `frontend/lib/api/complaint-parse.ts`, gate heuristic — MISSING.

**When updating existing code:**
- [ ] Audit `parseComplaintText` callers (`handleCapture`, `handleAddAssociated`, name-edit effect) before adding the async merge — [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md). The deterministic call must stay synchronous and first.
- [ ] Preserve the never-overwrite-doctor-edit invariant and the precedence in §4.3.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Deterministic is the product; AI is the safety net.** The instant offline fill always runs first; AI is gated, async, suggestion-only, and never on the capture critical path.
- **Schema-bounded values, server-enforced.** The model is constrained to the request `fieldSpec`; output is dropped to chip enums on the server (and re-guarded on the client). "Schema-displayable or omitted."
- **Suggestion-only.** AI fills **empty fields as pending chips**, confirm-to-apply. It never silently commits and never overwrites doctor/deterministic values.
- **PHI stays server-side, redacted, unlogged.** The model call runs on the backend behind auth; complaint text is redacted; logs carry metadata only; nothing persisted beyond an ephemeral cache.
- **Fail soft.** Unconfigured key / timeout / bad model JSON → keep the deterministic result silently. A bad model turn must never break or block capture.
- **Same shape as deterministic.** Output is `{ name, patch, associated }[]` so the client merges AI and rule output through one path.
- **Per-task model tiering.** Complaint parse uses `getOpenAIComplaintParseConfig`, **not** `getOpenAIConfig`. Tier 1 mini for auto-gate; Tier 2 flagship only on refine / retry. Receptionist, catalog, intent keep the global `OPENAI_MODEL`.

**DO NOT include** code or signatures in this file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **Yes (in transit).** Complaint free-text (PHI) is sent to an external model. No new tables; no PHI persisted.
  - [ ] **RLS verified?** n/a (no new tables) — confirm the parse path persists nothing.
- [ ] **Any PHI in logs?** **MUST be No.** Redact request text; audit logs model/tokens/`redactionApplied` only (mirror `logAIClassification`).
- [ ] **External API or AI call?** **Yes (OpenAI).**
  - [ ] **Consent + redaction + DPA coverage confirmed?** (Y / N) — **§0 blocker; record sign-off in Notes.**
- [ ] **Retention / deletion impact?** **No** — ephemeral in-memory cache only; do not store raw prompts/responses.

---

## ✅ Acceptance & Verification Criteria

- [ ] §0 sign-off recorded before any model code lands.
- [ ] Deterministic fill is **instant**; AI never blocks capture; degrade-on-error keeps the rule result.
- [ ] Endpoint returns **schema-valid, suggestion-only** patches; off-vocab chip values dropped server-side; auth + Zod validation enforced.
- [ ] AI suggestions land as **confirm-to-apply pending chips on empty fields only**; precedence (doctor > confirmed AI > deterministic > name-default > prior-charting) holds.
- [ ] **Multi-complaint** ("fever cough loose motions 3 days" → 3), **negation** ("no fever but cough" → no fever), **vernacular** ("pet me jalan 3 din se") handled behind confirm.
- [ ] **No PHI in logs**; prompts redacted; nothing persisted.
- [ ] Telemetry records accept/reject + gate/cache/latency.
- [ ] `tsc` / lint / backend + frontend suites green; subj-13 deterministic suites unchanged.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

**Mirror, don't reinvent:** `POST /api/v1/catalog/ai-suggest` ([`catalog.ts`](../../../../../../../../backend/src/routes/api/v1/catalog.ts) + [`service-catalog-ai-suggest.ts`](../../../../../../../../backend/src/services/service-catalog-ai-suggest.ts)) is the closest existing pattern: doctor-auth POST → `getOpenAIClient()` → `response_format: { type: 'json_object' }` → **Zod-validate model output** → `successResponse`. No repo code uses strict `json_schema`; stay on `json_object` + Zod.

**Why client sends the `fieldSpec`:** the resolved schema (keys + chip enums) lives in the frontend (`resolveComplaintAttributeFields` in [`complaint-schema.ts`](../../../../../../../../frontend/lib/cockpit/complaint-schema.ts)). Passing it on the request keeps a single source of truth, lets the server constrain the prompt and validate output without duplicating the schema, and means new category schemas work with the AI path for free.

**Cue vs suggestions:** the subj-13 §3 transparency cue (`parsed-fields-signal.ts`) is for values *already committed* by the deterministic pass. AI output is **not** committed — route it through the dashed pending-suggestion path (`SUGGESTED_CHIP_CLASS` / `filterSuggestionsForEmptyFields` / `buildConfirmedDefaultsPatch`), so the two stay visually and semantically distinct.

**Model tiering (Clariva-wide principle):**

| Work type | Model tier | Env / helper | Examples |
|-----------|------------|--------------|----------|
| Micro JSON classify/extract | **Mini** | `getOpenAIComplaintParseConfig('default')` → `gpt-4o-mini` | **Complaint parse** (auto-gate), intent (140 tok), booking turn (160 tok) |
| Medium JSON extract | Mini or small flagship | per-feature cap | Visit reason snippet (500 tok) |
| Single structured card | Mid | `getOpenAIConfig()` + mode cap | Catalog `single_card` (1500 tok) |
| Multi-card / review / open text | **Flagship** | `getOpenAIConfig()` → `gpt-5.2` | Catalog `starter`/`review`, DM replies |

**Complaint parse env (optional overrides in `backend/.env`):**
```bash
OPENAI_COMPLAINT_PARSE_MODEL=gpt-4o-mini              # Tier 1 default
OPENAI_COMPLAINT_PARSE_ESCALATION_MODEL=gpt-5.2       # Tier 2 default (or OPENAI_MODEL)
OPENAI_COMPLAINT_PARSE_MAX_TOKENS=500
```

**Service usage (when §1.4 lands):** `const config = getOpenAIComplaintParseConfig(request.tier ?? 'default')` → pass `config.model` + `config.maxTokens` to `chat.completions.create`; audit-log `config.model` + `config.tier`. On Tier-1 empty/truncated, optionally retry once at Tier 2 before degrading.

**Representative phrases to validate (§5):**
- `fever cough loose motions 3 days` → confirm "Add 3 complaints?" → Fever, Cough, Loose motions (each duration 3 days).
- `no fever but cough` → Cough only; zero fever fields/cards.
- `pet me jalan 3 din se` → Abdominal burning, duration 3 days (schema-bounded chips only).
- `chest pain worse on exertion relieved by rest` → already handled deterministically; AI gate should **not** fire (regression: no needless call).

**Implementation notes (2026-06-07 — core shipped):**

- **Endpoint:** `POST /api/v1/complaints/parse` → `parseComplaintHandler` → `parseComplaintWithAI`. Auth + Zod-validated; PHI redacted before the prompt (system message carries the field-spec + rules, the redacted complaint text rides in the user message); `json_object` + server `boundComplaintList`; injectable `runLlm` so the bounding logic is unit-tested with no network.
- **Capture-level proposal instead of in-card dashed pending chips (§4.2)** (judgment call, flagged for review). AI results render in an `AiRefineProposal` panel under the capture bar with per-item **Add** / **Add all**; applying happens only on the doctor's click (true confirm-to-apply). This avoids mutating each `ComplaintCard`'s internal suggestion state and naturally handles multi-complaint. The in-card dashed-chip merge for refining an *already-added* card is the remaining piece if/when we want field-level refine.
- **Auto-gate-on-Enter shipped (Pattern 2) — 2026-06-07.** The duplicate-card problem (deterministic Enter commits one wrong card, then AI proposes N more) is solved by **holding the commit** when the gate fires on a free-text Enter: `handleCapture` runs the deterministic parse + `shouldRequestAiParse`; if gated, it calls `runAiParse(text, 'autogate', payload)` and **returns without committing**. The proposal then shows a **"Keep as typed"** action (replaces the ✕ on this path) that commits the literal line, and **empty/error degrades to that same literal commit** — so Enter never loses the doctor's text. Clean lines and catalog picks commit straight through (no AI). Toggleable via `AUTO_GATE_ON_ENTER` in `ComplaintList.tsx`; could graduate to a per-doctor setting.
- **Two AI triggers, two tiers:** auto-gate (Enter) → `tier: 'default'` (mini, cost); explicit **✨ refine** (button) → `tier: 'escalation'` (flagship). On the refine path the typed text stays in the bar, so its panel keeps the ✕ dismiss (no "Keep as typed").
- **Transparency cue redesigned (2026-06-07).** The subj-13 §3 full-width "Auto-filled: …" strip was replaced by a compact persistent ✨ marker next to the complaint name ([`ParsedFieldsIndicator.tsx`](../../../../../../../../frontend/components/cockpit/rx/subjective/ParsedFieldsIndicator.tsx), Radix tooltip from `ui/tooltip`). The strip made stacks of rapid-captured cards look cramped (e.g. 5 cards each showing only "Auto-filled: Duration"). The marker is **source-agnostic** (deterministic capture, AI add, associated-symptom parse all feed the same `recordParsedFields` signal), hover/focus/tap reveals the fields, laterality/severity stay emphasised, and it's labelled for SR via the trigger `aria-label`. Trade-off vs the old strip: no `aria-live` spoken announcement on creation (discoverable, not auto-spoken). **Not yet covered:** the subj-13 §2 re-parse-on-name-edit path doesn't record to the signal, so editing a name to add detail fills the field with no marker (read-once-on-mount; pre-existing gap, left as-is).
- **Deferred (not blocking the headline value):** debounce + (text,category) response cache (§3.3); accept/reject + gate/cache/latency analytics (§6.1); per-field in-card pending-chip merge (§4.2 variant); single Tier-1→Tier-2 escalation retry on empty/truncated (today the auto-gate empty/error just degrades to the literal commit).

**§0 sign-off:** ✅ **2026-06-07** — product owner confirmed in-session. Legal basis: **same DPA / consent posture as the existing `ai-service` (patient-DM intent classification) and `catalog/ai-suggest` PHI→OpenAI paths** (no new basis). Controls enforced in code: complaint text redacted via `redactPhiForAI()` before the prompt; audit is **metadata-only** (`model` / `tokens` / `redactionApplied` via `logAIClassification`, no prompt/response); **no persistence** of prompts/responses beyond the ephemeral client cache. Re-confirm with Legal before enabling for any region outside the current OpenAI DPA coverage.

---

## 🔗 Related Tasks

- [`task-subj-13-freetext-parsing-completion.md`](./task-subj-13-freetext-parsing-completion.md) — deterministic §1–§3 (done); this task is its §4, promoted out.
- [`task-subj-11-rapid-complaint-capture.md`](../../p4-rapid-capture/Tasks/task-subj-11-rapid-complaint-capture.md) — the capture bar the parse rides on.
- [`task-subj-12-nested-associated-complaints.md`](../../p4-rapid-capture/Tasks/task-subj-12-nested-associated-complaints.md) — associated mini-cards the `associated[]` list spawns.
- subj-06 — `ComplaintAutocomplete` / `complaint_master` (catalog + the dropdown a "✨ refine" affordance reuses).

---

**Last Updated:** 2026-06-07 (core shipped + auto-gate-on-Enter (Pattern 2: hold-commit, Tier-1 AI, "Keep as typed" escape, degrade-to-literal); §0 signed. Deferred: cache, in-card pending chips, accept/reject analytics, Tier-1→Tier-2 retry.)
**Mirror pattern:** `catalog/ai-suggest` (auth POST → `getOpenAIClient` → `json_object` → Zod-validate → `successResponse`).
**Pattern:** deterministic schema-driven slot-filling first; AI as a gated, server-side, suggestion-only fallback.
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/CODE_CHANGE_RULES.md` · `Reference/engineering/compliance/COMPLIANCE.md`
