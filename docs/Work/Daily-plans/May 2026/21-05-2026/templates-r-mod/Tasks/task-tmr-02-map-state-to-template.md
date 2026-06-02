# tmr-02 · `mapStateToTemplate(state, modality, override)` dispatcher

> **Wave 2 lane α** of the [templates-r-mod batch](../plan-templates-r-mod-batch.md). Add a pure-function dispatcher that maps `(state, modality, override)` to a `CockpitTemplate` id.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | S (one function added + one big truth-table test, ~60 LOC + ~120 LOC) |
| **Model** | **Auto** — pure function with a finite enum-mapping; mechanical |
| **Wave** | 2 (lane α) |
| **Depends on** | tmr-01 (factory ids stable) |
| **Blocks** | tmr-04 (production page consumes the dispatcher) |

---

## Goal

In `frontend/lib/patient-profile/state.ts`, add:

```ts
export type CockpitTemplate = 'telemed-video' | 'telemed-voice' | 'telemed-text' | 'review';

export type CockpitTemplateOverride = CockpitTemplate | null;

export function mapStateToTemplate(
  state: CockpitState,
  modality: CockpitConsultationModality | null | undefined,
  override: CockpitTemplateOverride,
): CockpitTemplate | null;
```

Returns:

- `null` if the caller should NOT mount any template factory (walk-in fallback, terminal-without-modality, etc.).
- One of the four `CockpitTemplate` ids otherwise.

The function is **pure** — no React, no hooks, no side-effects. Trivially testable.

---

## What to do

### 1. Define the truth table

The mapping rules, in priority order (first match wins):

1. **Walk-in fallback** — caller signals walk-in by passing `modality = null`. Return `null` (caller short-circuits to legacy 2-pane).
2. **Override wins** — if `override !== null`, return `override` regardless of state / modality. Doctor's global preference is honored.
3. **State-based overrides:**
   - `state === 'terminal'` → return `'review'` regardless of modality (cancelled / no_show have no live channel).
   - `state === 'ended'` → return `'review'` regardless of modality (consult finished; read-only).
4. **Modality-based dispatch** (state is `ready` / `lobby` / `live` / `wrap_up`):
   - `modality === 'video'` → `'telemed-video'`
   - `modality === 'voice'` → `'telemed-voice'`
   - `modality === 'text'` → `'telemed-text'`
   - `modality === 'in_clinic'` → `'telemed-video'` (DL-13 / V2-D16: in-clinic out of scope; default to video for now)
   - `modality === null` or `undefined` → `'telemed-video'` (legacy data fallback; never break)

### 2. Implementation

```ts
export function mapStateToTemplate(
  state: CockpitState,
  modality: CockpitConsultationModality | null | undefined,
  override: CockpitTemplateOverride,
): CockpitTemplate | null {
  // Step 1: Walk-in fallback — caller signals by passing modality = null
  // when patient_id is absent. (Caller's responsibility — see DL-7.)
  // No explicit short-circuit here; the dispatcher returns a template
  // even for null modality, and the caller decides whether to use it.

  // Step 2: Override wins
  if (override !== null && override !== undefined) {
    return override;
  }

  // Step 3: State-based overrides
  if (state === 'terminal' || state === 'ended') {
    return 'review';
  }

  // Step 4: Modality-based dispatch
  switch (modality) {
    case 'voice':
      return 'telemed-voice';
    case 'text':
      return 'telemed-text';
    case 'video':
    case 'in_clinic':
    case null:
    case undefined:
    default:
      return 'telemed-video';
  }
}
```

Note the `null` return is reserved for an explicit caller-signaled walk-in — `PatientProfilePage` checks `!showChart` before calling and substitutes `null`. The function itself never returns `null` for the inputs documented above.

Actually, simplification — since the caller knows about walk-in and doesn't need the dispatcher's help, the function signature can drop `null` from the return type:

```ts
export function mapStateToTemplate(
  state: CockpitState,
  modality: CockpitConsultationModality | null | undefined,
  override: CockpitTemplateOverride,
): CockpitTemplate;
```

Pick whichever signature is cleaner with the call site. Document the choice in a JSDoc comment.

### 3. Extend `state.test.ts` with the truth table

In `frontend/lib/patient-profile/__tests__/state.test.ts`, add a new `describe('mapStateToTemplate')` block with at least these 16 rows:

| state | modality | override | → expected |
|---|---|---|---|
| ready | video | null | telemed-video |
| ready | voice | null | telemed-voice |
| ready | text | null | telemed-text |
| ready | in_clinic | null | telemed-video |
| lobby | video | null | telemed-video |
| lobby | voice | null | telemed-voice |
| live | text | null | telemed-text |
| live | video | null | telemed-video |
| wrap_up | voice | null | telemed-voice |
| wrap_up | video | null | telemed-video |
| ended | video | null | review |
| ended | voice | null | review |
| terminal | video | null | review |
| terminal | text | null | review |
| ready | video | 'review' | review |
| ready | voice | 'telemed-text' | telemed-text |
| live | text | 'telemed-video' | telemed-video |
| ended | video | 'telemed-voice' | telemed-voice |
| ready | null | null | telemed-video |
| ready | undefined | null | telemed-video |

Use a table-driven test pattern matching the existing `deriveCockpitState` test style in the same file.

### 4. JSDoc the function

Above the implementation, add:

```ts
/**
 * Map (cockpit state, modality, override) → CockpitTemplate id.
 *
 * Pure function — no React, no hooks, no fetches. Trivially testable.
 *
 * Priority order:
 *   1. override (doctor's global preference)
 *   2. state-based override: terminal | ended → review
 *   3. modality-based dispatch: video / voice / text / in_clinic
 *
 * Caller is responsible for handling walk-in appointments (no patient_id) —
 * see DL-7 of the templates-r-mod batch plan. This function does NOT return
 * null for walk-ins; the caller short-circuits.
 *
 * @see frontend/lib/patient-profile/templates.tsx for the factories this
 *      function dispatches to.
 * @see docs/Work/Daily-plans/May 2026/21-05-2026/templates-r-mod/
 *      Tasks/task-tmr-02-map-state-to-template.md
 */
```

---

## Files touched

- **Modified:** `frontend/lib/patient-profile/state.ts` (+~60 LOC: types + function + JSDoc).
- **Modified:** `frontend/lib/patient-profile/__tests__/state.test.ts` (+~120 LOC: truth-table describe block).

That's the entire surface. No new files, no backend changes.

---

## Acceptance gate

- [x] `CockpitTemplate` + `CockpitTemplateOverride` types exported from `state.ts`.
- [x] `mapStateToTemplate(state, modality, override)` exported from `state.ts`.
- [x] Function is pure (no React, no hooks, no fetches, no `Date.now()` / `performance.now()`).
- [x] All 20 truth-table rows from §3 pass in `state.test.ts`.
- [x] Existing `deriveCockpitState` tests still pass — regression-free.
- [x] `pnpm --filter frontend tsc --noEmit` clean.
- [x] `pnpm --filter frontend lint` clean.
- [x] `pnpm --filter frontend test --run state.test` green for the entire file.

---

## Anti-goals

- ❌ Don't import `templates.tsx` or any React/component code into `state.ts`. State.ts has zero React imports (per its header comment); preserve that.
- ❌ Don't call `mapStateToTemplate` from anywhere in production yet — tmr-04 wires it.
- ❌ Don't infer the doctor's override from anywhere; the caller passes it.
- ❌ Don't add a "should walk-in use a template" return; the caller short-circuits walk-ins.
- ❌ Don't tighten `CockpitConsultationModality` — it includes `in_clinic` and the dispatcher must accept it.

---

## Notes

- The truth-table test is the load-bearing artifact. Future R-MOD changes (e.g., adding an `in-clinic` template literal in a future plan) update both the function and the table in one commit.
- The "override wins" priority (step 2 before step 3) is intentional — a doctor who explicitly pinned `review` should see review even for an active consult; the source plan DL-17 commits to manual override always winning auto-select.
- Consider parameterizing the test using `it.each(...)` so failures point at the exact failing row.
- The `'in_clinic' → 'telemed-video'` fallback is per DL-13 (in-clinic out of scope) and V2-D16 (in-clinic-specific layout templates deferred). When in-clinic gets its own plan, add a fifth `CockpitTemplate` literal and update the dispatcher.
