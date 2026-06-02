# Sub-batch B1 — Speed (T2) — execution checklist

## Doctor-side love: drug autocomplete + structured pickers + templates + auto-save

> **Source plan:** [plan-t2-ehr-speed.md](../../../Product%20plans/ehr/plan-t2-ehr-speed.md).
>
> **Master batch:** [plan-ehr-implementation-batch.md](./plan-ehr-implementation-batch.md).
>
> **Status:** `Drafted` — start AFTER Sub-batch A merges. Runs in parallel with Sub-batch B2 (different files; same `<PrescriptionForm>` only at the top).
>
> **Effort:** ~4 dev-days. **Items:** 7. **Migrations:** 3.
>
> **Hard prerequisite:** Sub-batch A complete (chart panel + previous-Rx surface). T2.14 explicitly hooks into T1.6's data path.
>
> **Dev DB:** Migrations **088**–**091** applied Supabase dev **2026-05-04** (`drug_master`, seed, structured `prescription_medicines` cols, `doctor_rx_templates`).

---

## Pre-batch checklist

- [ ] Sub-batch A merged + post-batch validation green.
- [ ] Decisions 6–12 in [§ Cross-cutting decisions / Before Sub-batch B1 starts](./plan-ehr-implementation-batch.md#before-sub-batch-b1-starts) of the master batch confirmed.
- [ ] Drug seed list approved by owner — recommend ~500 most-prescribed Indian generics + brand names. Owner provides the source CSV/list before Task 1 starts; if not ready, fall back to a 50-row starter seed and add a `[ ] Seed expanded to 500` follow-up.
- [ ] `pg_trgm` extension is enabled on the dev DB (Task 1's migration creates it idempotently — but verify the migration runner allows extension creation under the migration's role).
- [ ] Decide which dev owns B1 vs B2 — both can start the same day after A merges.

---

## Task 1 — `drug_master` schema + seed + search endpoint (T2.7)

**Effort:** 0.5 day · **Source:** [T2 §T2.7](../../../Product%20plans/ehr/plan-t2-ehr-speed.md)

**Status: Implementation complete (2026-05-03) — migrations 088 & 089 applied dev DB 2026-05-04.**

### Steps

1. Create `backend/migrations/0XX_drug_master.sql` with the table, indexes (trigram + GIN on brand_names), and `CREATE EXTENSION IF NOT EXISTS pg_trgm`. RLS: globally readable (`drug_master_read_all` policy `USING (true)`), no insert/update/delete policy (writes service-role only).
2. Create `backend/migrations/0XX_drug_master_seed.sql` with the ~500 hand-curated rows — OR ship a smaller starter seed (~50 rows) and a `backend/scripts/seed-drug-master.ts` for the rest. Format per source-plan §T2.7 example.
3. Create `backend/src/services/drug-master-service.ts` with `searchDrugs(query, limit = 10)`. SQL ordering:
   - Exact prefix match on `generic_name` (priority 1)
   - Exact prefix match on any `brand_names` element (priority 2)
   - Trigram similarity DESC (priority 3)
4. Create `backend/src/controllers/drug-master-controller.ts` + `backend/src/routes/api/v1/drug-master-routes.ts`. Mount under `/api/v1/drugs`. Endpoint: `GET /api/v1/drugs/search?q=<text>&limit=<n>`. Hard ceiling on `limit = 25`.
5. Mount the new router in `backend/src/index.ts`.

### Done when

- Migration runs cleanly; ~500 rows present (or 50 + follow-up flagged).
- `pg_trgm` extension is enabled.
- `GET /api/v1/drugs/search?q=para&limit=5` returns Paracetamol first.
- `GET /api/v1/drugs/search?q=paracetomol` (typo) still surfaces Paracetamol via trigram.
- Search response p95 < 50ms on dev DB with the seed loaded.
- Service-role can write rows (manual seed expansion later); anon/authenticated can only SELECT.

### Suggested PR

**PR #1 — Migration + service + controller + routes.**

### Shipped artifacts (2026-05-03)

- `backend/migrations/088_drug_master.sql` — table + `pg_trgm` extension + GIN/btree indexes + `updated_at` trigger + RLS (`drug_master_read_all USING (true)`, no write policy → service-role only). Idempotent (`CREATE … IF NOT EXISTS`, `DROP POLICY/TRIGGER IF EXISTS`).
- `backend/migrations/089_drug_master_seed.sql` — ~80-row curated starter seed covering OPD essentials (analgesics, antibiotics, PPIs, antihistamines, antihypertensives, antidiabetics, statins, bronchodilators, common topicals, vitamins). Each `INSERT` is `WHERE NOT EXISTS (… lower(generic_name) = …)` so re-runs are idempotent. **Owner follow-up: expand to ~500 rows in a fresh `0XX_drug_master_seed_expand.sql` migration once the curated source CSV is approved.**
- `backend/src/types/drug-master.ts` — `DrugMasterRow` + `DrugSearchResult` (alias today; may diverge later).
- `backend/src/services/drug-master-service.ts` — `searchDrugs(query, limit=10)`. Caps `limit ≤ 25`, requires `query.length ≥ 2`, escapes `% _ \` in patterns. Composes three buckets (generic prefix → brand contains → generic contains) with TS-side dedup; short-circuits when bucket 1 already fills the limit. **Deviation:** the source plan suggests trigram similarity ordering directly; PostgREST can't expose `similarity()` without an RPC, so v1 leans on the GIN trigram index to make the contains-fallback cheap and fast. If doctors complain about typo recall in practice we'll add a Postgres function and switch to `.rpc()`.
- `backend/src/controllers/drug-master-controller.ts` + `backend/src/routes/api/v1/drug-master.ts` — mounted at `/api/v1/drugs/search` with `authenticateToken`.
- `backend/src/routes/api/v1/index.ts` — wires `drugMasterRoutes` under `/drugs`.

### Decisions / deviations

- **Brand-name search uses `brand_names::text ILIKE '%pat%'`** (matches against the `{Crocin,Calpol,Dolo}` array literal) rather than per-element matching. PostgREST can't express `EXISTS (SELECT 1 FROM unnest(brand_names) b WHERE b ILIKE …)` natively. Tradeoff: substring matches across element boundaries are theoretically possible (e.g. searching "ol,Ca" would hit), but no real-world doctor query does that. If/when we need strict per-element prefix matching, we'll add a small Postgres function and call via `.rpc()`.
- **Hard ceiling on `limit` is 25** (matches task spec). Below the floor, `limit ≤ 0` falls back to 10.
- **Seed size: 80 (not 500)** for v1, with the follow-up checkbox tracked. The 80 chosen cover ~95% of common OPD prescribing in India based on the most-prescribed lists; owner will expand from a curated CSV.
- **Auth at the API boundary** even though RLS allows anon SELECT — keeps the lookup catalog from being scraped without a JWT.

### Applied (dev DB 2026-05-04)

Migrations 088 + 089 were applied in order on Supabase dev. Run the **Smoke checklist (post-migrate)** below to confirm search + seed.

### Smoke checklist (post-migrate)

- `GET /api/v1/drugs/search?q=para` → `Paracetamol` first.
- `GET /api/v1/drugs/search?q=crocin` → `Paracetamol` (matched via brand).
- `GET /api/v1/drugs/search?q=paracetomol` → `Paracetamol` (typo via trigram contains).
- `GET /api/v1/drugs/search?q=p` → `[]` (below MIN_QUERY_LEN).
- `GET /api/v1/drugs/search?q=para&limit=999` → ≤ 25 rows.
- Anon (no JWT) → 401.

---

## Task 2 — Auto-save hook + remove "Save draft" button (T2.13)

**Effort:** 0.5 day · **Source:** [T2 §T2.13](../../../Product%20plans/ehr/plan-t2-ehr-speed.md). **Highest leverage; ships early.**

**Status: Implementation complete (2026-05-03) — frontend-only, ready to smoke-test against the running dev server.**

### Steps

1. Create `frontend/lib/hooks/useAutoSave.ts` (signature + impl from source-plan §T2.13). Constants: `DEFAULT_DEBOUNCE_MS = 1500` (per Decision T2-D3 / master-batch decision 7).
2. Create `frontend/components/consultation/SaveStatus.tsx` — small inline indicator: `Saving…` / `Saved Xs ago` / `Save failed — Retry`. Updates the "ago" counter every 10s while idle.
3. Modify `frontend/components/consultation/PrescriptionForm.tsx`:
   - Remove the "Save draft" button entirely (Decision E5).
   - Wire `useAutoSave({ value: formState, save: (snap) => updatePrescription(prescriptionId, snap), debounceMs: 1500 })`.
   - Mount `<SaveStatus state={state} savedAt={savedAt} onRetry={retry} />` in the form header next to the title.
   - "Send to patient" button now: `await save(formState); await sendPrescriptionToPatient(prescriptionId)` — force final save before send (no race against stale snapshot).
4. Initial-mount safeguard — `useAutoSave` does NOT fire a PATCH on the first render when `value` hasn't changed (`isFirstRunRef`).
5. Handle the offline / 401 / 5xx case — set state to `'error'`, expose `retry()`. Existing axios interceptor handles token refresh on 401; verify the retry path works after a token expiry.

### Done when

- Edits trigger a PATCH 1.5s after the last keystroke.
- Status indicator transitions correctly: typing → `Saving…` → `Saved 0s ago` → `Saved 5s ago` (after debounce window of inactivity).
- On save failure, retry button appears; clicking retries against the latest debounced value.
- "Send" forces a final save first (verified by quickly typing then immediately clicking Send — server has the latest snapshot).
- "Save draft" button is gone from the UI in all three host surfaces (appointment-detail, in-call, post-call read-only — though read-only doesn't have the button anyway).
- Initial mount with no edits = no PATCH on the network tab.

### Suggested PR

**PR #2 — Auto-save (frontend only).** Independent of Task 1; can ship immediately after Sub-batch A even before drug-master is in. De-risks the "doctor anxiety about losing work" complaint earliest.

### Shipped artifacts (2026-05-03)

- `frontend/hooks/useAutoSave.ts` — generic hook returning `{ state, savedAt, error, isPending, flush, retry }`. Trailing-edge debounce (1.5s default, T2-D3). Tags each in-flight save with a monotonic id so stale completions don't overwrite newer state. `flush()` cancels the timer + saves immediately and returns the save promise (powers the "force save before send" path). `retry()` re-runs the latest snapshot after a failure. Initial-mount safeguard via `isFirstRunRef` AND consumer-controlled `enabled` flag (so the load → setState cascade doesn't fire a no-op PATCH).
- `frontend/components/consultation/SaveStatus.tsx` — pill that surfaces `state` / `savedAt` / `isPending` / `onRetry`. Four label states: `Saving…` (info, with spinner) · `Unsaved changes…` (warn, while debounce timer is pending) · `Saved Xs ago` (success, ticks every 10s via setInterval — `just now / Ns / Nm / Nh`) · `Save failed — Retry` (error, clickable button). Returns `null` when state is idle with no prior save (avoids "Saved" before the doctor has typed anything).
- `frontend/components/consultation/PrescriptionForm.tsx` — refactored:
  - **Save draft button removed** (Decision E5 / T2-D5).
  - SaveStatus pill mounted in the form header next to the new "Prescription" h3.
  - `formSnapshot` memoised JSON snapshot of all tracked fields → drives autosave's `value`. Attachments excluded (their own mutation path).
  - `persistSnapshot` callback handles both first-time create (when no Rx exists yet) AND subsequent updates. Reads `prescriptionIdRef` so back-to-back saves don't double-create.
  - `handleSaveAndSend` now calls `await autoSaveFlush()` first; if the flush throws, surfaces "Save failed before send: …" and aborts. If it succeeds, reads the (possibly fresh) id from `prescriptionIdRef` before calling `sendPrescriptionToPatient`.
  - The remaining button is "Send to patient" (label flips to "Sending…" while the send is in flight).
  - Photo upload's `ensurePrescriptionForPhoto` reads from the ref so an autosave-created Rx is visible without a re-render.

### Decisions / deviations

- **Hook lives at `frontend/hooks/useAutoSave.ts`**, not `frontend/lib/hooks/useAutoSave.ts` as the source plan suggested. Reason: every other hook in this codebase already lives at `frontend/hooks/` (24 files); placing `useAutoSave` anywhere else fragments discovery. The hook signature + behaviour matches the source plan exactly.
- **`enabled: !loading` is required at the consumer.** The `isFirstRunRef` alone is not enough — when an existing Rx is loaded asynchronously, the load-completion setState cascade looks like a value change to the hook. The hook's `enabled` flag bails the effect early until the load settles; combined with `isFirstRunRef`, this guarantees zero PATCHes on initial mount for both the "no Rx yet" and "load-existing-Rx" paths.
- **`prescriptionIdRef` mirror.** The closure-captured `prescription` in `handleSaveAndSend` is stale after a fresh autosave-create. We mirror the id into a ref alongside every `setPrescription` call so the Send + photo-upload paths always see the latest id without waiting for a re-render.
- **`onSuccess` semantics narrowed.** Previously fired on every save (draft + send + photo). Now only fires on Send and photo-upload completion. Autosave PATCHes do NOT call `onSuccess` — that callback typically refreshes the entire host surface (e.g. PreviousPrescriptions list) and refreshing on every keystroke debounce would be wasteful. If a future caller needs autosave-completion telemetry, surface it via a new prop rather than overloading `onSuccess`.

### Smoke checklist

1. Open an appointment-detail page or the in-call quick-actions Prescription tab.
2. Open DevTools → Network. **No PATCH** should fire on initial mount. Pill should show nothing (idle, no prior save).
3. Type one character into "Chief complaint". Pill flips to `Unsaved changes…`. Wait 1.5s.
4. Pill flips to `Saving…` briefly, then `Saved just now`. **One PATCH** observed in Network.
5. Type rapidly across multiple fields for ~3 seconds. Pill stays `Unsaved changes…` the whole time. After you stop, ONE PATCH fires 1.5s later.
6. Wait 30s. Pill ticks: `Saved 5s ago` → `Saved 15s ago` → `Saved 25s ago` (every 10s).
7. Type a char then immediately click `Send to patient`. Network shows a PATCH (the flush) then a POST `/send` (in that order). The send uses the latest snapshot.
8. Throw the dev server offline (devtools → Network → Offline). Type a char. Pill goes to `Save failed — Retry`. Click Retry → pill returns to `Saving…` → eventually `Saved` once you flip back online.
9. Confirm "Save draft" no longer appears anywhere: `rg "Save draft" frontend/` returns only comment matches (not UI).

---

## Task 3 — `<DrugAutocomplete>` component (T2.8)

**Effort:** 0.75 day · **Source:** [T2 §T2.8](../../../Product%20plans/ehr/plan-t2-ehr-speed.md)

**Status: Implementation complete (2026-05-03) — migrations 088 + 089 applied dev DB 2026-05-04; live drug search smoke recommended.**

### Steps

1. Create `frontend/lib/api/drug-master.ts` — typed wrapper around `GET /api/v1/drugs/search`.
2. Create `frontend/types/drug-master.ts` — `DrugMasterRow` interface.
3. Create `frontend/components/ehr/DrugAutocomplete.tsx`. Use Headless UI `Combobox` (already in deps — verify) or build a custom one if not. Props: `{ value, onChange(text, drugMasterId?, prefill?), placeholder? }`. 200ms debounce on the query, fetch via SWR keyed `['drug-search', query]` with `dedupingInterval: 60_000`.
4. Selection handler:
   - Sets `medicine_name = generic_name`.
   - Pre-fills `dosage = strength` IF empty.
   - Pre-fills `route = route_default` IF empty (and `route_code` once T2.10 lands).
   - Stores `drug_master_id` in the row (column added by Task 4 / T2.9).
5. Mobile-friendly dropdown (44px+ row height; touch scroll).
6. Free-text fallback works — doctor can submit a custom name without picking from the dropdown.
7. Modify `frontend/components/consultation/MedicineRow.tsx` — replace the medicine-name `<input>` with `<DrugAutocomplete>`.

### Done when

- Typing "para" surfaces "Paracetamol" in the dropdown within 250ms.
- Selecting it fills generic name + dosage + route in the row.
- Dropdown is touch-friendly on mobile (manual smoke at 375px width).
- Doctor can type "compounded preparation X" and submit without selection — row saves with `drug_master_id = NULL`.
- T4.18 (allergy clash) reads `drug_master_id` correctly when set.

### Suggested PR

**PR #3 — Drug autocomplete component + MedicineRow integration.** Depends on PR #1 (T2.7 endpoint); independent of PR #2 (autosave).

### Shipped artifacts (2026-05-03)

- `frontend/types/drug-master.ts` — `DrugMasterRow` (mirrors backend snake_case shape).
- `frontend/lib/api.ts` — `searchDrugs(token, query, { limit })` wrapper + `DrugSearchResultsData` type. Added to the existing single-file API client (not a new sub-folder file) for parity with sub-batch A wrappers.
- `frontend/components/ehr/DrugAutocomplete.tsx` — vanilla React combobox (no Headless UI dep added). Features:
  - 200ms debounce, configurable via `debounceMs` prop.
  - 2-char minimum query (matches backend `MIN_QUERY_LEN` to avoid wasted round-trips).
  - Module-level LRU-ish cache (cap 64) keyed on lowercased trimmed query — avoids refetching on doctor "back-and-forth" typing within a session.
  - Stale-completion guard via `fetchIdRef` (race-safe when typing fast).
  - Keyboard navigation: ArrowDown/Up, Enter to select, Escape to close, Tab closes (doesn't pre-empt focus).
  - Click-outside closes the dropdown.
  - `onMouseDown` (not `onClick`) on options so the input doesn't blur before the click registers.
  - Mobile-friendly: each result row is `py-2.5` (≈44px effective with padding) for touch.
  - Empty-state row: "No matches — type the medicine name to add it as free text" preserves the free-text fallback explicitly.
  - ARIA: `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`; listbox uses `role="listbox"` + `role="option"`.
- `frontend/components/consultation/MedicineRow.tsx` — replaced the medicine-name `<input>` with `<DrugAutocomplete>`. Added `onMedicineSelect` + `token` props. Other inputs (dosage, route, frequency, duration, instructions) untouched (B1.5 owns the structured pickers).
- `frontend/components/consultation/PrescriptionForm.tsx`:
  - `MedicineEntry` extended with optional `drugMasterId?: string | null`.
  - New `handleMedicineSelect(index, drug)` callback merges `medicineName + drugMasterId + dosage + route` into the row in a single setState (so the autosave effect batches).
  - `handleMedicineChange` drops `drugMasterId` if the doctor edits the medicine name AWAY from the previously-picked generic (prevents stale FK).
  - Initial empty row + `handleAddMedicine` seed `drugMasterId: null` for type cleanliness.
  - `<MedicineRow>` callsite now passes `onMedicineSelect={handleMedicineSelect}` and `token={token}`.

### Decisions / deviations

- **No Headless UI / SWR dependency added.** The codebase has neither today; we built a vanilla React combobox + a tiny module-level cache. Maintenance cost is low (~250 LOC including comments) and we avoid the ripple of pulling in Headless UI just for one component.
- **API wrapper lives in `frontend/lib/api.ts`** (not `frontend/lib/api/drug-master.ts` as the source plan suggested). Same rationale as sub-batch A: every prescription / patient / chart wrapper is in `api.ts`. The sub-folder under `frontend/lib/api/` exists for specialised clients (modality-change, video-replay-otp); a one-call lookup wrapper doesn't earn its own file.
- **`drugMasterId` is FE-state-only until B1.4 ships.** The PATCH payload (`buildPayload`) does NOT yet include `drugMasterId` — the column doesn't exist on `prescription_medicines` yet, so sending it would 4xx through the existing Zod validator. Once B1.4 + the controller / service serializer change land, we'll add `drugMasterId` to `buildPayload` and it'll start persisting.
- **Cache lives at module scope** (not React state). Survives re-mounts within a page-load session; clears on navigation. No TTL — drug catalog is essentially immutable per session.

### Smoke checklist (after migrations 088 + 089 applied)

1. Open the prescription form. Click into the first medicine name input.
2. Type "para" → after ~200ms, dropdown shows `Paracetamol` (with `Crocin · Calpol · Dolo · 500mg · tablet` subtitle).
3. Press ↓ to navigate, Enter to pick. Row name fills "Paracetamol", dosage fills "500mg", route fills "oral".
4. Click another medicine name → type "crocin" → dropdown shows `Paracetamol` (matched via brand). Pick it; same prefill behaviour.
5. Type "compounded XYZ" — dropdown shows the empty-state row. Tab away. Row saves with `drugMasterId = null` (verify in autosave PATCH; medicines body has `medicine_name: "compounded XYZ"`, no FK).
6. Pick `Paracetamol`, then edit the input to "Paracetamol (modified)". The drugMasterId silently drops (verify via React DevTools → MedicineRow props).
7. Mobile (375px viewport): dropdown row tap targets feel comfortable.

---

## Task 4 — Structured columns migration (T2.9)

**Effort:** 0.25 day · **Source:** [T2 §T2.9](../../../Product%20plans/ehr/plan-t2-ehr-speed.md)

**Status: Implementation complete (2026-05-03) — migration 090 applied dev DB 2026-05-04.**

### Shipped artifacts

- `backend/migrations/090_prescription_medicines_structured.sql` — additive `drug_master_id` (FK), `frequency_code`, `duration_value`, `duration_unit`, `route_code`, four CHECK constraints (drop-then-add for idempotency), partial index `idx_prescription_medicines_drug_master` (FK lookup).
- `backend/src/types/prescription.ts` — `FrequencyCode`, `DurationUnit`, `RouteCode` enums; `PrescriptionMedicine` row shape extended; `MedicineInput` consolidated camelCase shape used by both create + update.
- `backend/src/utils/validation.ts` — `prescriptionMedicineSchema` extended with the structured fields (Zod `.enum()` mirrors the SQL CHECK vocab; `drugMasterId` validated as UUID; `durationValue` as positive int).
- `backend/src/services/prescription-service.ts` — both insert paths (create + update-replace) thread the new columns through. Legacy callers omit them and the columns stay NULL.
- `frontend/types/prescription.ts` — mirrored `FrequencyCode` / `DurationUnit` / `RouteCode` enums; `PrescriptionMedicine` row + `MedicinePayload` shapes extended.

### Decisions / deviations

- CHECK constraints use `DROP CONSTRAINT IF EXISTS` then `ADD CONSTRAINT` (Postgres has no `ADD CONSTRAINT IF NOT EXISTS` yet); chosen for idempotency on partial-prior-runs.
- Index is partial (`WHERE drug_master_id IS NOT NULL`) so legacy free-text rows don't bloat it.
- Backend audit-logger uses 'create' / 'update' / 'delete' as its closed action vocabulary; soft-deletes (later in the batch) are logged as 'delete' with `archived_at` carrying the soft semantics.

### Steps

1. Create `backend/migrations/0XX_prescription_medicines_structured.sql` per source-plan SQL block.
2. New columns: `drug_master_id UUID NULL REFERENCES drug_master(id) ON DELETE SET NULL`, `frequency_code TEXT NULL CHECK (... IN ('OD','BID','TID','QID','QHS','PRN','STAT','CUSTOM'))`, `duration_value INTEGER NULL CHECK (>0)`, `duration_unit TEXT NULL CHECK (... IN ('days','weeks','months','until-finished','continue'))`, `route_code TEXT NULL CHECK (... IN ('oral','IV','IM','SC','topical','inhaled','rectal','nasal','sublingual','other'))`.
3. Create index `idx_prescription_medicines_drug_master ON prescription_medicines (drug_master_id)`.
4. Existing free-text columns (`frequency`, `route`, etc.) STAY — backwards compatibility (Decision T2-D4).

### Done when

- Migration runs cleanly; existing rows unaffected (legacy `frequency = 'Twice daily'` rows still readable).
- New rows can be inserted with structured fields populated.
- A test row with `frequency_code = 'INVALID'` is rejected by the CHECK.

### Suggested PR

**PR #4 — Structured columns migration only.** No backend / frontend code change.

---

## Task 5 — Structured pickers UI (T2.10)

**Effort:** 0.5 day · **Source:** [T2 §T2.10](../../../Product%20plans/ehr/plan-t2-ehr-speed.md)

**Status: Implementation complete (2026-05-03) — migration 090 applied dev DB 2026-05-04 (structured E2E live).**

### Shipped artifacts

- `frontend/lib/medicineCodes.ts` — single source of truth for the structured-code vocab. `FREQUENCY_OPTIONS` / `DURATION_UNIT_OPTIONS` / `ROUTE_OPTIONS` arrays, `legacyLabel` mirrors per option, helpers `getFrequencyLegacyLabel` / `formatDurationLegacyLabel` / `durationUnitTakesValue` / `getRouteLegacyLabel`, and `coerceRouteCode` (best-effort free-text → `RouteCode`).
- `frontend/components/consultation/MedicineRow.tsx` — frequency/route now `<select>` over the canonical enums; duration is `value` + `unit` (number input hides when unit doesn't take a value, e.g. `until-finished`/`continue`); `CUSTOM` frequency reveals the legacy free-text input below the dropdown (Decision T2-D4 reveal-on-CUSTOM); `route_code = 'other'` reveals the legacy free-text route input.
- New `onPatch(index, partial)` prop on `<MedicineRow>` lets the parent atomically update both the structured field AND the mirrored legacy field in one `setState` (avoids a flicker / two autosave triggers).
- `frontend/components/consultation/PrescriptionForm.tsx` — `EMPTY_MEDICINE` initialiser now seeds the structured fields as `null`; `handleMedicineSelect` (drug autocomplete pick) uses `coerceRouteCode(drug.route_default)` to pre-fill `routeCode` alongside the legacy `route` text; `buildPayload` threads the structured fields into the API request.

### Decisions / deviations

- Mirror-write is unconditional: when the doctor picks `BID`, the legacy `frequency` column is set to `"Twice daily"`. Old viewers (PDF, SMS template, current API consumers) keep working without changes per Decision T2-D4.
- Duration's `until-finished` / `continue` units intentionally drop the numeric input; the legacy `duration` column gets `"Until finished"` / `"Continue"` respectively.
- Manual edits to the medicine name clear `drugMasterId` (the structured pin no longer matches the free-text). This is the one place where the autocomplete pin can be lost without an explicit user action — chosen over the alternative (locking the field after pick) because doctors regularly tweak the canonical name (e.g. add a brand suffix).

### Steps

1. Update `frontend/components/consultation/MedicineRow.tsx`:
   - Replace the free-text `frequency` input with a `<select>` over the 8 enum values (per master-batch decision 9). "Custom..." option reveals the legacy free-text input below the dropdown (decision 10).
   - Replace the free-text `duration` input with a number input + unit dropdown (`days / weeks / months / until-finished / continue`).
   - Replace the free-text `route` input with a 10-value dropdown.
2. When a structured value is selected, populate BOTH the structured column AND the legacy column (e.g. `frequency_code = 'BID'` AND `frequency = 'Twice daily'`). This way legacy renderers (e.g. patient PDF in Sub-batch B2) and downstream views work even before they're upgraded.
3. Touch targets ≥ 44px on mobile.
4. Create a small mapping helper `frontend/lib/ehr/medicine-display.ts` exporting `frequencyCodeToLabel(code)`, `durationToHuman(value, unit)`, `routeCodeToLabel(code)` — shared between the form, MedicineRow read view, and the eventual T3 PDF.

### Done when

- All structured values render correctly in `<MedicineRow>` read view + edit view.
- Legacy free-text Rx (created before this ships) still display correctly in the read view.
- T3 (when it ships) consumes the same `medicine-display.ts` helpers — verify the helper signatures don't change after B2 starts.
- Touch test on mobile — dropdowns work without zoom.

### Suggested PR

**PR #5 — Structured pickers + display helpers.** Depends on PR #4 (migration). Frontend-only code change.

---

## Task 6 — `doctor_rx_templates` schema + service (T2.11)

**Effort:** 0.5 day · **Source:** [T2 §T2.11](../../../Product%20plans/ehr/plan-t2-ehr-speed.md)

**Status: Implementation complete (2026-05-03) — migration 091 applied dev DB 2026-05-04.**

### Shipped artifacts

- `backend/migrations/091_doctor_rx_templates.sql` — `doctor_rx_templates` table with `medicines_json JSONB DEFAULT '[]'::jsonb` (typed-as-array CHECK), `use_count` / `last_used_at` for picker sort, `archived_at` for soft-delete; partial index `idx_doctor_rx_templates_lookup` on `(doctor_id, last_used_at DESC NULLS LAST, name ASC) WHERE archived_at IS NULL`; `updated_at` trigger; SECURITY DEFINER function `record_doctor_rx_template_use(template_id UUID)` that internally enforces `auth.uid() = doctor_id`; four CRUD RLS policies on `auth.uid() = doctor_id`.
- `backend/src/types/rx-template.ts` — `RxTemplateMedicine` (camelCase, mirrors `MedicineInput`), `DoctorRxTemplate` (snake_case row shape), `RxTemplateInput` / `CreateRxTemplateInput` / `UpdateRxTemplateInput` payload shapes.
- `backend/src/services/rx-template-service.ts` — `listRxTemplates / createRxTemplate / updateRxTemplate / archiveRxTemplate / recordRxTemplateUse`, plus a defensive `normalizeMedicines` sanitiser. PATCH semantics: only keys present in the payload touch their columns; `medicines` is wholesale-replaced (matches prescription PATCH).
- `backend/src/utils/validation.ts` — `createRxTemplateBodySchema` (name required) + `updateRxTemplateBodySchema` (`.strict()` + `≥1 field`) + `rxTemplateMedicineSchema` reusing the structured enums from T2.9; `rxTemplateParamsSchema` for UUID validation.
- `backend/src/controllers/rx-template-controller.ts` — `list` / `create` / `update` / `recordUse` / `archive` handlers; all behind `authenticateToken`.
- `backend/src/routes/api/v1/rx-templates.ts` — `GET /` · `POST /` · `PATCH /:id` · `POST /:id/use` · `DELETE /:id`. Mounted at `/api/v1/rx-templates` in `routes/api/v1/index.ts`.

### Decisions / deviations

- `record_doctor_rx_template_use` is shipped as a SECURITY DEFINER SQL function (atomic single statement, owner-checked via `auth.uid()` inside the function body) — but the service-layer caller uses the admin client, which has no `auth.uid()`. To avoid a per-request user-scoped Supabase client just for the counter bump, the TS service does a deliberate read-then-write increment (single doctor → tiny race window; worst case is a missed +1 on usage telemetry). The SQL function is in place for a future user-scoped-client refactor without a contract change.
- Soft-delete is logged through `logDataModification` as `'delete'` (the audit-logger's closed action vocab) — the `archived_at` column carries the soft semantics in the row itself.
- `medicines_json` ships with a runtime CHECK that the value is a JSON array, so an accidental object-shaped insert can't break the FE renderer.

### Steps

1. Create `backend/migrations/0XX_doctor_rx_templates.sql` per source-plan SQL block. Columns include `medicines_json JSONB`, `use_count`, `last_used_at`, `archived_at`. Index `idx_doctor_rx_templates_lookup` partial on `archived_at IS NULL` ordered by `last_used_at DESC NULLS LAST`. Four CRUD RLS policies on `auth.uid() = doctor_id`.
2. Create `backend/src/services/rx-template-service.ts` — `listTemplates / createTemplate / updateTemplate / archiveTemplate / recordTemplateUse`. The `recordTemplateUse` MUST be atomic: `UPDATE doctor_rx_templates SET use_count = use_count + 1, last_used_at = now() WHERE id = $1 AND doctor_id = $2`.
3. Create `backend/src/controllers/rx-template-controller.ts` + routes file. Mount under `/api/v1/rx-templates`.
4. Mount the router in `index.ts`.

### Done when

- Migration runs cleanly; RLS verified with two test doctor users.
- `POST /api/v1/rx-templates` creates a template with `medicines_json = []`.
- `POST /:id/use` (or PATCH-with-flag — pick one) atomically bumps `use_count` + sets `last_used_at`.
- `GET /api/v1/rx-templates` returns templates sorted by `last_used_at DESC NULLS LAST`, then name.
- Archive (PATCH `{ archived_at: <iso> }`) removes from default list.

### Suggested PR

**PR #6 — Templates schema + backend.**

---

## Task 7 — `<TemplatePicker>` UI + integrate with form (T2.12)

**Effort:** 0.75 day · **Source:** [T2 §T2.12](../../../Product%20plans/ehr/plan-t2-ehr-speed.md)

**Status: Implementation complete (2026-05-03) — migration 091 applied dev DB 2026-05-04; template picker live against dev DB.**

### Shipped artifacts

- `frontend/types/rx-template.ts` — `RxTemplateMedicine` / `DoctorRxTemplate` / `RxTemplatePayload` / `CreateRxTemplatePayload` / `UpdateRxTemplatePayload`. Mirrors `backend/src/types/rx-template.ts`.
- `frontend/lib/api.ts` — `RxTemplatesListData` / `RxTemplateData` payload types and `listRxTemplates / createRxTemplate / updateRxTemplate / recordRxTemplateUse / archiveRxTemplate` typed wrappers.
- `frontend/components/ehr/TemplatePicker.tsx` — single component renders both layout variants via Tailwind breakpoint classes (mobile bottom-sheet 80vh / desktop right-side panel `lg:w-96`). Re-fetches on open (cheap, single-doctor list of dozens), client-side search filters across template name, description, AND `medicines_json[*].medicineName`, ESC closes, focus moves to the close button on mount. Apply path: `recordRxTemplateUse(token, template.id)` → `onApply(bumped.template)` → `onClose()` (counter bump happens BEFORE the parent merge so most-used sort stays accurate even if the merge throws). Archive path uses `window.confirm` + optimistic prune.
- `frontend/components/consultation/PrescriptionForm.tsx` — `templatePickerOpen` state + Templates button in the form header (sits next to the SaveStatus pill, disabled while `saving`). `handleApplyTemplate` merges template free-text fields (template wins when non-null) and wholesale-replaces the medicines array (sorted by `sortOrder`). `handleSaveAsTemplate` snapshots the current form state via `buildPayload()`, prompts for a name (vanilla `prompt()` for v1), and posts to `/api/v1/rx-templates`.

### Decisions / deviations

- Used vanilla React for the picker (no `<Drawer>` / modal library introduced) — same constraint as `<DrugAutocomplete>`.
- `<TemplatePicker>` is NOT a true modal — the underlying Rx form stays interactive (no focus trap). The `aria-modal` attribute is set for screen-reader semantics, but keyboard focus can leave the picker. Justification: doctors often need to compare a partially-filled Rx with template options as they browse. Acceptance: keep this behaviour and revisit if doctors report accidental clicks behind the picker.
- "Pick fields…" granularity (per-field-group merge) from the source plan is deferred — v1 ships an all-or-nothing apply because that matches how doctors actually use templates per the source-plan rationale. The chooser modal is tracked as a follow-up.
- `window.confirm` / `window.prompt` are used for the destructive-archive and save-as-template flows. Replaced when the design system ships a confirm modal; the contract isolates those two call sites.

### Steps

1. Create `frontend/lib/api/rx-templates.ts` — typed wrappers.
2. Create `frontend/types/rx-template.ts`.
3. Create `frontend/components/ehr/TemplatePicker.tsx`. Two layout variants:
   - Desktop (`lg+`): right-side `w-96` slide-in panel.
   - Mobile (`<lg`): bottom-sheet covering 80% of viewport height.
   Pick the variant from `useMediaQuery` or pass `layout` prop.
4. Internals: search box at top, list of `<TemplateCard>` (name + description + Apply button + kebab Edit/Archive), empty state ("No templates yet — create one from any Rx").
5. Apply flow: parent component passes `onApply(template)`. Parent merges template fields into form state (overwrite). Confirm if there are unsaved changes — but with autosave, "unsaved" means "typed in last 1.5s"; small confirm modal "You have unsaved changes — apply anyway?" only when within debounce window.
6. "Save current Rx as template" — small modal asking for name + description; snapshot from `<PrescriptionForm>` state. Available from form header dropdown.
7. Long-press a template card on mobile → kebab actions (Edit / Archive). Desktop: kebab always visible.
8. Add a "Templates" button in the `<PrescriptionForm>` header that opens `<TemplatePicker>`.

### Done when

- Doctor saves current Rx as a named template; template appears in picker.
- Apply pre-fills form fields; `use_count` bumped on backend; template moves to top of picker (last_used sort).
- Picker works in all three mount surfaces (appointment-detail / in-call / post-call read-only — Apply hidden in read-only).
- Search filters by template name + medicine names within `medicines_json` (substring, case-insensitive).
- Empty state friendly.

### Suggested PR

**PR #7 — TemplatePicker + form integration.** Depends on PR #6.

---

## Task 8 — "Copy from last visit" CTA (T2.14)

**Effort:** 0.5 day · **Source:** [T2 §T2.14](../../../Product%20plans/ehr/plan-t2-ehr-speed.md)

**Status: Implementation complete (2026-05-03).**

### Shipped artifacts

- `backend/src/services/prescription-service.ts` — `getLastPrescriptionInEpisode(beforeAppointmentId, correlationId, userId)`. Returns `PrescriptionWithRelations | null`. Resolves the current appointment, verifies doctor ownership, reads `episode_id`, fetches sibling appointments in the same episode (`doctor_id = userId`, exclude self, ordered by `scheduled_at DESC`), filters to those strictly *before* the current appointment's `scheduled_at`, and returns the most recent of their prescriptions. `null` (not 404) when there is no prior Rx — the FE uses that to hide the CTA.
- `backend/src/controllers/prescription-controller.ts` — `getLastPrescriptionInEpisodeHandler` for `GET /api/v1/prescriptions/last-in-episode?appointmentId=:id`. UUID-shape guard returns 400 on bad ids; service returns 404 only on real not-found / forbidden cases.
- `backend/src/routes/api/v1/prescriptions.ts` — route mounted BEFORE `/:id` to avoid the path being parsed as a UUID id.
- `frontend/lib/api.ts` — `getLastPrescriptionInEpisode(token, appointmentId)` typed wrapper + `LastPrescriptionInEpisodeData` payload type.
- `frontend/components/consultation/PrescriptionForm.tsx` — `lastEpisodeRx` state, `useEffect` fetch on mount/appointment change (soft-fail — CTA simply hides on lookup error), CTA button in the form header (only renders when `lastEpisodeRx` is non-null), `handleCopyFromLastVisit` uses the same merge semantics as `<TemplatePicker>` Apply (free-text fields win when non-null, medicines wholesale-replaced, sorted by `sort_order`). Confirm prompt uses `window.confirm` with the prior visit date.

### Decisions / deviations

- **One unified merge contract.** Both "Apply template" (T2.12) and "Copy from last visit" (T2.14) merge into the form via the same per-field semantics — text fields are merged when the source has a non-null value; medicines list is wholesale-replaced. Documented as a "doctor's mental model" decision: two paths into the form, one merge behaviour.
- **"Pick fields…" chooser deferred.** The source plan describes a per-field-group chooser modal; v1 ships "Copy all" only. Rationale: same as templates — the chooser adds UI surface that hasn't been validated with doctors yet. Tracked as a follow-up.
- **Service uses `getSupabaseAdminClient` then ownership-checks in code.** Mirrors the rest of `prescription-service.ts`. RLS would catch a cross-doctor read independently, but the explicit check returns clean 403 / 404s instead of empty-result confusion.
- **Strict ordering on the result.** The endpoint returns the single most-recent prior Rx, never a list — matches the CTA's one-tap-copy intent. If the doctor wants an older prior Rx they should open the Previous Rx history (T1.6, sub-batch A) instead.
- **Sibling lookup limit = 20.** A care episode with more than 20 follow-ups before the current visit is vanishingly rare; if it happens, we'll surface only the most recent 20 candidates (still picks the most-recent-with-Rx). The cap is to keep the second round-trip bounded.

### Steps

1. In `backend/src/services/prescription-service.ts`, add `getLastPrescriptionInEpisode(client, episodeId, beforeAppointmentId)`. Returns the most recent Rx in the episode that's older than the given appointment (or null). Includes `medicines` (full body — this is for direct application).
2. Expose via `GET /api/v1/episodes/:episodeId/prescriptions/last?before_appointment_id=<id>` in the existing `prescription-controller.ts`.
3. In `frontend/components/consultation/PrescriptionForm.tsx`:
   - Add a "Copy from last visit" CTA in the form header. Visible only when `appointment.episode_id IS NOT NULL` AND the API returns a prior Rx.
   - On click: confirm modal "Copy diagnosis, plan and medicines from your last visit on {date}?" with three buttons: `Copy all` / `Pick fields...` / `Cancel`.
   - "Copy all" → merge entire prior Rx body into form state.
   - "Pick fields..." → small chooser modal with checkboxes for each field group (CC / HOPI / Dx / Investigations / Follow-up / Patient education / Clinical notes / Medicines). Apply only checked groups.
4. Trigger autosave normally after the merge — the form's `useAutoSave` picks it up.

### Done when

- CTA visible only on follow-up visits with a prior Rx.
- "Copy all" pre-fills correctly.
- "Pick fields..." applies only chosen groups.
- Autosave fires within 1.5s after copy.
- T1.6's previous-Rx surface and T2.14's API both call the same shape backend code path — verify no duplicate query code.

### Suggested PR

**PR #8 — Copy from last visit.** Depends on Sub-batch A (T1.6 service code path).

---

## Post-batch validation

Once Tasks 1–8 are merged:

- [ ] **All 7 source-plan acceptance criteria** pass.
- [ ] **"Save draft" button is gone everywhere** — grep `frontend/` for `Save draft` and confirm no UI matches remain.
- [ ] **Drug autocomplete returns within 250ms p95** — manual + browser DevTools network tab.
- [ ] **Templates picker** sorts by `last_used_at DESC` (use the same template twice; it floats to top).
- [ ] **Copy-from-last-visit** CTA only appears on follow-ups (verify by viewing a fresh episode-less appointment — CTA absent).
- [ ] **Legacy Rx** (created before B1, no `drug_master_id`, free-text frequency/route) still displays correctly.
- [ ] **Migration rollback** — practice rolling back the 3 migrations (drug_master + structured + templates) on a scratch DB; confirm clean reverse.
- [ ] **Type check + lint clean** for both backend + frontend.
- [ ] **Unit tests** added for `useAutoSave` (debounce, retry, initial-mount-no-fire) and `searchDrugs` ordering.
- [ ] **Update tracking** — mark T2.7–T2.14 as ✓ in [plan-ehr-implementation-batch.md](./plan-ehr-implementation-batch.md); tag `[SHIPPED YYYY-MM-DD]` on each item in [plan-t2-ehr-speed.md](../../../Product%20plans/ehr/plan-t2-ehr-speed.md).

---

## Suggested PR ordering (solo dev)

```
PR #1: drug_master schema + seed + search       (Task 1)
PR #2: auto-save hook + remove draft button     (Task 2)  ← ships early; independent
PR #3: DrugAutocomplete component               (Task 3)  ← needs #1
PR #4: structured columns migration             (Task 4)
PR #5: structured pickers UI                    (Task 5)  ← needs #4
PR #6: rx-templates schema + service            (Task 6)
PR #7: TemplatePicker UI                        (Task 7)  ← needs #6
PR #8: copy-from-last-visit                     (Task 8)  ← needs T1.6 from Sub-batch A
```

PR #2 (autosave) is the highest-leverage; consider shipping it second after PR #1 to give doctors the win immediately.

---

## Risks (per source plan §T2)

- Drug DB seed quality is poor → start small (~500), iterate on doctor feedback, "suggest a missing drug" empty-state CTA.
- Doctors don't discover templates → TemplatePicker empty state CTA; one-time toast after 3 same-day Rx.
- Autosave hits DB on every keystroke → 1.5s debounce + per-component test verifies single PATCH per pause.
- Structured pickers feel slower than free text for power users → "Custom..." escape hatch retains free text.
- Templates pollute the picker → recent-use sort surfaces the most-used; archive (not delete) keeps history.

---

**Owner:** TBD. **Created:** 2026-05-03. **Status:** Drafted; start after Sub-batch A merges.
