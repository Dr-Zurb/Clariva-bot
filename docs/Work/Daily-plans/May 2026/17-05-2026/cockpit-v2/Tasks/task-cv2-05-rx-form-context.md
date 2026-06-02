# Task cv2-05: `<RxFormContext>` extraction + autosave wiring

## 17 May 2026 — Batch [Cockpit v2 — Phase 1](../plan-cockpit-v2-batch.md) — Wave 3, Lane β step 0 — **S, ~6h**

---

## Task overview

Step 1 of the `PrescriptionForm.tsx` Strangler Fig refactor (DL-26 / DL-27). The existing component (1,717 LOC) owns the form state directly via local `useState` / `useReducer` blocks within its body. This task **moves that state into a new `<RxFormProvider>` + `useRxForm()` context** living at `frontend/components/cockpit/rx/RxFormContext.tsx` — **without changing what JSX `<PrescriptionForm>` renders.**

After this task:

- The existing `<PrescriptionForm>` body becomes a thin shell that mounts `<RxFormProvider>` and renders its current monolithic JSX inside it. The JSX is unchanged; it just consumes `useRxForm()` instead of reading from local hooks. Visual diff vs pre-task is zero.
- All form state — fields, autosave debounce, dirty tracking, submission state — lives in the provider.
- The provider's typed surface includes the **new SOAP fields** from cv2-04 (`vitals_*`, `examination_findings`, `differential_diagnosis`, `advice`, `follow_up_value`, `follow_up_unit`, `referral`, `test_results`, `investigations_orders`) — typed but **no UI inputs yet** (cv2-07 adds the inputs).
- The provider's autosave path persists those new fields when set, alongside the existing ones.

This task is a **state ownership move + typed-surface extension.** No section component extraction (cv2-06's job). No new UI (cv2-07's job).

**Estimated time:** ~6h (1h discovery / mapping of current state in `PrescriptionForm.tsx` + 2h provider + reducer extraction + 1h autosave hook extraction + 1h legacy compatibility + 1h verification).

**Status:** Pending.

**Hard deps:** cv2-04 (the regenerated backend types this task's provider state-shape consumes).

**Source:** [plan-cockpit-v2-batch.md § Wave 3 Lane β](../plan-cockpit-v2-batch.md#wave-3--shell-continuation--rx-form-refactor-4-tasks-24h-with-parallelism-2-parallel-lanes-after-wave-2-ships) + DL-26..DL-27 in [Product plans/plan-cockpit-v2.md](../../../Product%20plans/plan-cockpit-v2.md).

---

## Model & execution guidance

**Recommended model:** **Auto** (default). State / hook extraction from one file into one new file with zero behaviour change. The hardest decision (where the autosave hook lives) is locked in DL-27.

**Per-message escalation rule:** if Auto stalls on the reducer's discriminated-union action shape (lots of fields → lots of action types; TypeScript narrowing can confuse models), escalate that **one message** to Opus 4.7 Extra High.

**New chat?** **Yes** — fresh chat. Pre-load:

- This task file.
- `frontend/components/consultation/PrescriptionForm.tsx` (the 1,717-LOC file being refactored — pay attention to the state-owning sections at the top: `useState` blocks, `useReducer` calls, `useEffect` for autosave debounce, `useRef` for last-saved comparison).
- `backend/src/types/database.ts` (post-cv2-04 — the new prescription column types the provider state-shape consumes).
- `frontend/lib/api/prescriptions.ts` (the autosave POST/PUT caller; if the path is different, find via `rg "saveRx\|updatePrescription\|patchPrescription" frontend/lib`).
- `frontend/types/prescription.ts` (or wherever the existing typed prescription shape lives — verify with `rg "interface Prescription\b" frontend/types`).
- Source plan §DL-26..DL-27.

**Estimated turns:** 3–4 turns (1 discovery + 1 provider + reducer, 1 autosave hook + legacy compatibility, 1 verification).

---

## Acceptance criteria

### Step 1 — Inventory current state in `PrescriptionForm.tsx`

Before writing any new code, scan the existing component and enumerate every piece of state. Document in a comment at the top of the new `RxFormContext.tsx` file (so future maintainers see the mapping):

- [ ] Run `rg "useState\(|useReducer\(" frontend/components/consultation/PrescriptionForm.tsx` — list every state hook + its initial value + what it represents.
- [ ] Run `rg "useEffect\(" frontend/components/consultation/PrescriptionForm.tsx | head -20` — identify the autosave debounce effect, the dirty-detection effect, the initial-load effect.
- [ ] Run `rg "saveRx\|saveAsDraft\|sendPrescription" frontend/components/consultation/PrescriptionForm.tsx` — identify every persistence call.

**Document the inventory in a JSDoc block at the top of `RxFormContext.tsx`.** Example:

```ts
/**
 * RxFormContext — state owner for the cockpit-v2 prescription form refactor
 * (cv2-05). Extracted from PrescriptionForm.tsx's local hooks per DL-26 / DL-27.
 *
 * Inventory of state moved (vs PrescriptionForm.tsx as of 2026-05-17):
 *
 *  - cc, hopi (string, useState)              → fields.cc, fields.hopi
 *  - provisional_diagnosis (string, useState) → fields.provisional_diagnosis
 *  - medicines (Medicine[], useReducer)       → fields.medicines (reducer-managed)
 *  - investigations (string, useState)        → fields.investigations_orders (renamed per cv2-04)
 *  - follow_up (string, useState)             → fields.follow_up (legacy free-text; preserved)
 *  - patient_education (string)               → fields.patient_education
 *  - clinical_notes (string)                  → fields.clinical_notes
 *  - vitals_text (string, legacy free-text)   → fields.vitals_text (DEPRECATED — preserved during cv2-07's UI migration)
 *  - autosaveTimer (useRef)                   → encapsulated in useAutosave hook
 *  - isDirty (boolean)                        → fields.isDirty (derived)
 *  - lastSavedAt (ISO string)                 → fields.lastSavedAt
 *  - isSaving (boolean)                       → fields.isSaving
 *  - isSubmitting (boolean)                   → fields.isSubmitting
 *  - submitError (string | null)              → fields.submitError
 *
 * NEW fields (cv2-04 migration; typed here, no UI yet — cv2-07 adds inputs):
 *  - vitals_bp_systolic / vitals_bp_diastolic / vitals_hr / vitals_temp_c /
 *    vitals_spo2 / vitals_wt_kg / vitals_ht_cm
 *  - examination_findings
 *  - differential_diagnosis (string[])
 *  - advice
 *  - follow_up_value (number) + follow_up_unit ('days' | 'weeks' | 'months' | 'as_needed')
 *  - referral
 *  - test_results
 *  - investigations_orders (renamed from investigations)
 */
```

### Step 2 — Define the provider shape

- [ ] **New file** `frontend/components/cockpit/rx/RxFormContext.tsx`:

  ```tsx
  'use client';

  import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useReducer,
    useRef,
  } from 'react';

  // ---------------------------------------------------------------------------
  // Types — surface the prescription form state-shape including cv2-04's
  // new SOAP fields. Optional fields are explicitly NULL-able to mirror the
  // backend's CHECK-constrained NULL semantics.
  // ---------------------------------------------------------------------------

  export type FollowUpUnit = 'days' | 'weeks' | 'months' | 'as_needed';

  export interface RxMedicine {
    id: string;
    medicine_name: string;
    dosage?: string;
    route?: string;
    frequency?: string;
    duration?: string;
    instructions?: string;
    sort_order: number;
  }

  export interface RxFormFields {
    // Subjective
    cc: string;
    hopi: string;

    // Objective — legacy free-text (DEPRECATED in Phase 1; preserved here for
    // backwards-compat until cv2-07's new structured vitals UI ships).
    vitals_text: string;

    // Objective — new structured vitals (cv2-04; UI in cv2-07).
    vitals_bp_systolic: number | null;
    vitals_bp_diastolic: number | null;
    vitals_hr: number | null;
    vitals_temp_c: number | null;
    vitals_spo2: number | null;
    vitals_wt_kg: number | null;
    vitals_ht_cm: number | null;

    // Objective — exam findings (cv2-04; UI in cv2-07).
    examination_findings: string;

    // Assessment
    provisional_diagnosis: string;
    differential_diagnosis: string[]; // cv2-04; UI in cv2-07.

    // Plan — orders + medicines.
    investigations_orders: string;     // renamed from investigations in cv2-04.
    medicines: RxMedicine[];

    // Plan — advice / referral / test results / follow-up.
    advice: string;                    // cv2-04.
    follow_up: string;                 // legacy free-text; preserved during deprecation.
    follow_up_value: number | null;    // cv2-04.
    follow_up_unit: FollowUpUnit | null; // cv2-04.
    referral: string;                  // cv2-04.
    test_results: string;              // cv2-04.

    patient_education: string;
    clinical_notes: string;
  }

  export interface RxFormState {
    fields: RxFormFields;
    /** Has any field been changed since the last successful save? */
    isDirty: boolean;
    /** Currently sending an autosave POST/PUT. */
    isSaving: boolean;
    /** Currently sending the final send-Rx POST. */
    isSubmitting: boolean;
    /** ISO timestamp of the last successful save. */
    lastSavedAt: string | null;
    /** Error from the most recent save attempt, if any. */
    submitError: string | null;
  }

  // ---------------------------------------------------------------------------
  // Actions — discriminated union for the reducer.
  // ---------------------------------------------------------------------------

  export type RxFormAction =
    | { type: 'SET_FIELD'; key: keyof RxFormFields; value: RxFormFields[keyof RxFormFields] }
    | { type: 'SET_MEDICINES'; medicines: RxMedicine[] }
    | { type: 'ADD_MEDICINE'; medicine: RxMedicine }
    | { type: 'REMOVE_MEDICINE'; id: string }
    | { type: 'UPDATE_MEDICINE'; id: string; patch: Partial<RxMedicine> }
    | { type: 'ADD_DDX'; entry: string }
    | { type: 'REMOVE_DDX'; index: number }
    | { type: 'SAVE_START' }
    | { type: 'SAVE_SUCCESS'; lastSavedAt: string }
    | { type: 'SAVE_ERROR'; error: string }
    | { type: 'SUBMIT_START' }
    | { type: 'SUBMIT_SUCCESS' }
    | { type: 'SUBMIT_ERROR'; error: string }
    | { type: 'RESET'; initialFields: RxFormFields };

  // ---------------------------------------------------------------------------
  // Reducer — pure; no side effects.
  // ---------------------------------------------------------------------------

  export function rxFormReducer(state: RxFormState, action: RxFormAction): RxFormState {
    switch (action.type) {
      case 'SET_FIELD':
        return {
          ...state,
          fields: { ...state.fields, [action.key]: action.value },
          isDirty: true,
          submitError: null,
        };
      case 'SET_MEDICINES':
        return {
          ...state,
          fields: { ...state.fields, medicines: action.medicines },
          isDirty: true,
          submitError: null,
        };
      // ... (other action handlers — mirror the existing PrescriptionForm.tsx
      // logic exactly; the goal is byte-equivalent behaviour) ...
      case 'SAVE_START':
        return { ...state, isSaving: true, submitError: null };
      case 'SAVE_SUCCESS':
        return { ...state, isSaving: false, isDirty: false, lastSavedAt: action.lastSavedAt };
      case 'SAVE_ERROR':
        return { ...state, isSaving: false, submitError: action.error };
      case 'SUBMIT_START':
        return { ...state, isSubmitting: true, submitError: null };
      case 'SUBMIT_SUCCESS':
        return { ...state, isSubmitting: false, isDirty: false };
      case 'SUBMIT_ERROR':
        return { ...state, isSubmitting: false, submitError: action.error };
      case 'RESET':
        return {
          fields: action.initialFields,
          isDirty: false,
          isSaving: false,
          isSubmitting: false,
          lastSavedAt: null,
          submitError: null,
        };
      default:
        return state;
    }
  }

  // ---------------------------------------------------------------------------
  // Context — shape exposed to consumers.
  // ---------------------------------------------------------------------------

  export interface RxFormContextValue {
    state: RxFormState;
    dispatch: React.Dispatch<RxFormAction>;
    /** Convenience setter; equivalent to dispatching SET_FIELD. */
    setField: <K extends keyof RxFormFields>(key: K, value: RxFormFields[K]) => void;
    /** Convenience for the legacy isDirty check used by the unsaved-changes guard. */
    isDirty: boolean;
    /** Used by the send-Rx button (cv2-07 wires; placeholder shape here). */
    submitDisabled: boolean;
  }

  const RxFormContext = createContext<RxFormContextValue | null>(null);

  // ---------------------------------------------------------------------------
  // Provider.
  // ---------------------------------------------------------------------------

  export interface RxFormProviderProps {
    appointmentId: string;
    /** Initial fields — fetched from the server by the parent before render. */
    initialFields: RxFormFields;
    children: React.ReactNode;
  }

  export function RxFormProvider({
    appointmentId,
    initialFields,
    children,
  }: RxFormProviderProps): JSX.Element {
    const [state, dispatch] = useReducer(rxFormReducer, {
      fields: initialFields,
      isDirty: false,
      isSaving: false,
      isSubmitting: false,
      lastSavedAt: null,
      submitError: null,
    });

    // Autosave debounce — preserves the existing PrescriptionForm.tsx behaviour.
    useAutosave({
      appointmentId,
      fields: state.fields,
      isDirty: state.isDirty,
      isSaving: state.isSaving,
      onSaveStart: () => dispatch({ type: 'SAVE_START' }),
      onSaveSuccess: (savedAt) => dispatch({ type: 'SAVE_SUCCESS', lastSavedAt: savedAt }),
      onSaveError: (err) => dispatch({ type: 'SAVE_ERROR', error: err }),
    });

    const setField = useCallback(<K extends keyof RxFormFields>(key: K, value: RxFormFields[K]) => {
      dispatch({ type: 'SET_FIELD', key, value });
    }, []);

    const submitDisabled = state.isSubmitting || (state.fields.medicines.length === 0 && !state.fields.advice && !state.fields.provisional_diagnosis);

    const value: RxFormContextValue = useMemo(
      () => ({ state, dispatch, setField, isDirty: state.isDirty, submitDisabled }),
      [state, setField, submitDisabled],
    );

    return <RxFormContext.Provider value={value}>{children}</RxFormContext.Provider>;
  }

  // ---------------------------------------------------------------------------
  // Consumer hook.
  // ---------------------------------------------------------------------------

  export function useRxForm(): RxFormContextValue {
    const ctx = useContext(RxFormContext);
    if (!ctx) {
      throw new Error('useRxForm must be called inside an <RxFormProvider>.');
    }
    return ctx;
  }

  // ---------------------------------------------------------------------------
  // Autosave hook — extracted from PrescriptionForm.tsx's autosave useEffect.
  // ---------------------------------------------------------------------------

  interface UseAutosaveArgs {
    appointmentId: string;
    fields: RxFormFields;
    isDirty: boolean;
    isSaving: boolean;
    onSaveStart: () => void;
    onSaveSuccess: (savedAt: string) => void;
    onSaveError: (err: string) => void;
  }

  function useAutosave(args: UseAutosaveArgs): void {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSavedFieldsRef = useRef<RxFormFields | null>(null);

    useEffect(() => {
      if (!args.isDirty || args.isSaving) return;
      // (Mirror existing debounce delay — verify the exact ms in
      // PrescriptionForm.tsx before this task. Typical: 1500ms.)
      const DELAY = 1500;
      timerRef.current = setTimeout(async () => {
        args.onSaveStart();
        try {
          // Call the existing autosave endpoint; preserve the request shape
          // exactly as PrescriptionForm.tsx does today. Add the new SOAP
          // fields to the payload — backend accepts them post-cv2-04.
          const res = await fetch(`/api/v1/appointments/${args.appointmentId}/prescription/draft`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(args.fields),
          });
          if (!res.ok) throw new Error(`Save failed: ${res.status}`);
          lastSavedFieldsRef.current = args.fields;
          args.onSaveSuccess(new Date().toISOString());
        } catch (err) {
          args.onSaveError(err instanceof Error ? err.message : 'Unknown error');
        }
      }, DELAY);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }, [args.fields, args.isDirty, args.isSaving, args.appointmentId]); // eslint-disable-line react-hooks/exhaustive-deps
  }
  ```

  *(Adapt every detail — endpoint URL, request shape, debounce delay — to match `PrescriptionForm.tsx`'s exact existing behaviour. The pre-load lists the file for this reason.)*

### Step 3 — Wrap `PrescriptionForm.tsx` body in `<RxFormProvider>`

- [ ] In `frontend/components/consultation/PrescriptionForm.tsx`:

  - At the top, **import** the new provider + hook:

    ```tsx
    import { RxFormProvider, useRxForm, type RxFormFields } from '@/components/cockpit/rx/RxFormContext';
    ```

  - **Extract** the current `useState` / `useReducer` / autosave `useEffect` blocks. They move to the provider; remove them from `PrescriptionForm.tsx`.

  - **Replace** the component body with a wrapper:

    ```tsx
    export default function PrescriptionForm({ appointmentId, ...otherProps }: PrescriptionFormProps) {
      const initialFields = useInitialPrescriptionFields(appointmentId); // existing fetch logic stays here for this task
      if (!initialFields) return <LoadingSpinner />; // existing loading UX stays
      return (
        <RxFormProvider appointmentId={appointmentId} initialFields={initialFields}>
          <PrescriptionFormBody {...otherProps} />
        </RxFormProvider>
      );
    }

    function PrescriptionFormBody({ ...otherProps }: PrescriptionFormBodyProps) {
      const { state, setField, dispatch } = useRxForm();
      // The original monolithic JSX — every field input that used to read
      // from a local useState now reads from `state.fields.<x>` and writes
      // via `setField('<x>', value)` or `dispatch({ type: ..., ... })`.
      return (/* ...the existing JSX, minimally modified... */);
    }
    ```

- [ ] **Mechanical JSX edits inside `PrescriptionFormBody`:**

  - Every `value={ccLocal}` becomes `value={state.fields.cc}`.
  - Every `onChange={(e) => setCcLocal(e.target.value)}` becomes `onChange={(e) => setField('cc', e.target.value)}`.
  - Every `medicinesReducer.dispatch(...)` becomes `dispatch(...)` (the reducer is the same; only its location moves).
  - The `<SaveStatusIndicator />` (or whatever shows "Saving..." / "Saved at HH:MM") reads from `state.isSaving` and `state.lastSavedAt`.
  - **NO new JSX added.** No new inputs for the cv2-04 SOAP fields — those go in cv2-07.

- [ ] **Visual diff: zero modulo whitespace.** Open `/dashboard/appointments/[id]` pre and post-task; compare. The form looks and behaves identically.

### Step 4 — Initial-fields fetch + RESET on appointment change

- [ ] The existing `useInitialPrescriptionFields` (or however the initial fields are fetched) stays in `PrescriptionForm.tsx` for this task. cv2-06 may move it; cv2-05 keeps the surface stable.
- [ ] If the appointmentId changes (rare; happens during patient-flow advance), the provider's `useEffect` fires a `RESET` action with the new initial fields. Verify by manually navigating between two appointment ids' detail pages — the form clears + reloads.

### Step 5 — Verification (deterministic)

- [ ] **Type-check:** `pnpm --filter frontend tsc --noEmit` clean. `RxFormFields` includes every new column from cv2-04.

- [ ] **Lint:** `pnpm --filter frontend lint` clean.

- [ ] **`rg "useState\(|useReducer\(" frontend/components/consultation/PrescriptionForm.tsx`** returns near-zero matches (any residual `useState` calls are for local UI state like "menu open" — clearly not form state).

- [ ] **`rg "<RxFormProvider\|useRxForm" frontend/components`** returns the provider's definition + `PrescriptionForm.tsx`'s consumer.

- [ ] **Manual smoke on `/dashboard/appointments/[id]` (appointment-detail mount):**
  - Open an existing appointment with a draft prescription. Form loads with prior values.
  - Type into CC. Wait > 1.5s. "Saving..." indicator appears, then "Saved at HH:MM:SS". Refresh page. Value persists.
  - Add a medicine row. Autosave fires. Refresh. Medicine persists.
  - Delete a medicine row. Autosave fires. Refresh. Medicine gone.
  - Submit (send) the prescription. The submit flow works unchanged.
  - **Visual diff vs pre-task:** zero modulo dynamic content.
  - **No console errors** related to context (e.g. "useRxForm must be called inside an RxFormProvider").

- [ ] **Same smoke against the in-call mini-panel mount** (open a consult, mount the PrescriptionForm mini-panel, type into CC, verify autosave works). Same against the post-call summary mount.

---

## Out of scope

- **Section component extractions** (`<SubjectiveSection>`, `<ObjectiveSection>`, `<AssessmentSection>`, `<PlanSection>`). cv2-06.
- **Composition root `PrescriptionFormCompositionRoot.tsx`** that replaces `PrescriptionForm.tsx`'s body. cv2-06.
- **UI inputs for the new cv2-04 SOAP fields.** cv2-07. This task only types the form state; the inputs come later.
- **Removing the legacy free-text `vitals_text` field.** Phase 3 — after the structured vitals UI from cv2-07 has soaked.
- **`<RxFormProvider>` mounted outside the legacy `PrescriptionForm.tsx`** (e.g. for the new `/v2-tree` Plan placeholder). The placeholder doesn't render the form; only the three mount surfaces (appointment-detail, in-call, post-call) consume the provider in Phase 1.
- **Optimistic UI updates on autosave.** Existing behaviour preserved (form values update immediately; autosave POST happens in the background).
- **Conflict resolution** if two browsers edit the same appointment simultaneously. Out of scope — pre-existing limitation; Phase 3 may address.
- **Telemetry on autosave / send.** Existing telemetry (if any) is preserved by the mechanical move; no new events.

---

## Files expected to touch

**New:**

- `frontend/components/cockpit/rx/RxFormContext.tsx` (~250 LOC — provider + reducer + autosave hook + types).

**Modified:**

- `frontend/components/consultation/PrescriptionForm.tsx` (~400 LOC delta — extract local hooks; wrap body in `<RxFormProvider>`; rewire JSX to consume `useRxForm()`). Net change is a reduction in file size by ~100 LOC; the bulk of the file (the JSX) stays in place with mechanical edits.

**Read but do not modify:**

- `frontend/components/consultation/MedicineRow.tsx` (consumer of the medicines reducer; no changes needed if `dispatch` is forwarded via `useRxForm()`).
- `backend/src/types/database.ts` (post-cv2-04 — source of new field types).
- `frontend/lib/api/prescriptions.ts` (autosave / send endpoints; no changes needed).

**Tests:** No new test files. Manual smoke covers the verification. Adding RTL tests for the provider is Phase 3 work (after section extractions stabilise the consumer surface).

---

## Notes / open decisions

1. **Why one big reducer vs many `useState` calls?** Two reasons. (a) Atomic updates — autosave needs to see the latest field values; many `useState` calls fire async commits in unpredictable order. A single reducer guarantees atomicity. (b) Discriminated-union actions make the persistence path (cv2-07's send-Rx flow) easier to reason about.

2. **Why is `setField` typed with `<K extends keyof RxFormFields>` instead of plain `(key: string, value: any)`?** Type safety. `setField('cc', 'fever')` checks; `setField('cc', 42)` errors. Critical for the new structured fields (vitals as `number | null`, follow_up_unit as a literal union).

3. **Why include `submitDisabled` in the context?** The "Send Rx & finish" button needs to know when to disable. Computing it inside the reducer is overkill; computing it inside the consumer is fine but every section component would re-derive it. Putting it in the context value is the simplest.

4. **Why keep the legacy `vitals_text` field?** The current `<PrescriptionForm>` UI has a free-text vitals input. cv2-07 replaces it with structured inputs. During the transition (cv2-05 → cv2-07), preserving the field means the form still works between these two tasks landing on the same branch. Phase 3 (rx-polish-densification) drops it.

5. **What about race conditions in autosave?** The existing PrescriptionForm.tsx already handles this with a `timerRef` + `isSaving` guard. The extracted `useAutosave` preserves the pattern. If two saves are queued, the second debounce reset means only the latest payload sends.

6. **Why does the provider accept `initialFields` as a prop rather than fetching internally?** Separation of concerns — the fetch is a side effect (Suspense / loading state / error UI). Hoisting it to the parent (PrescriptionForm.tsx for now; PrescriptionFormCompositionRoot in cv2-06) keeps the provider pure. The provider only knows about reducing state, not loading it.

7. **Could `useAutosave` be tested in isolation?** Yes — it's a hook with a clean signature. But automated tests aren't part of this batch's scope per `plan-cockpit-v2-batch.md` — Phase 3 may add coverage when the form has stabilised.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Source decisions:** [Product plans/plan-cockpit-v2.md § DL-26..DL-27](../../../Product%20plans/plan-cockpit-v2.md).
- **Wave gate:** [`EXECUTION-ORDER-cockpit-v2.md` § Wave 3 gate](./EXECUTION-ORDER-cockpit-v2.md#wave-3-gate-after-cv2-02--cv2-03--cv2-05--cv2-06).
- **Previous task (cross-lane dep):** [`task-cv2-04-soap-fields-migration.md`](./task-cv2-04-soap-fields-migration.md) — must be merged so the provider's typed fields align with the backend columns.
- **Next task in lane:** [`task-cv2-06-section-component-extractions.md`](./task-cv2-06-section-component-extractions.md) — Wave 3 Lane β step 1. Consumes the provider.

---

**Owner:** TBD
**Created:** 2026-05-17
**Status:** Pending
