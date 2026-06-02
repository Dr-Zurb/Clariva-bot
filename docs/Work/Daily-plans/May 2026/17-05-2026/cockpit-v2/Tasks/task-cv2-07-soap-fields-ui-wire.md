# Task cv2-07: wire new SOAP fields through UI + persistence + autosave round-trip

## 17 May 2026 — Batch [Cockpit v2 — Phase 1](../plan-cockpit-v2-batch.md) — Wave 4, Lane single — **M, ~10h**

---

## Task overview

Step 3 of the `PrescriptionForm.tsx` Strangler Fig refactor (DL-26). cv2-05 owned state. cv2-06 extracted four section components with "Coming in cv2-07" stub banners. This task **replaces those four stubs with real structured inputs**, ensures the backend autosave + send paths persist the new cv2-04 fields, and round-trips them through reload.

After this task:

- `<ObjectiveSection>` renders a **structured vitals grid** (BP, HR, Temp, SpO₂, weight, height) inline alongside the legacy free-text vitals input + an `examination_findings` textarea.
- `<AssessmentSection>` renders a **differential diagnosis chip list** alongside the existing provisional diagnosis input.
- `<PlanSection>` renders a **structured follow-up picker** (value + unit), an **advice** textarea, a **referral** textarea, and a **test results** textarea — all alongside the existing free-text follow-up + investigations_orders + medicines + patient_education + clinical_notes.
- The autosave payload includes all new fields. The send-Rx payload includes all new fields. Reloading the page re-hydrates all new fields correctly.
- The four "Coming in cv2-07" stub banners are gone.

This task is the **UI completion of the SOAP refactor.** Backend already accepts the fields (cv2-04). Provider already types them (cv2-05). Sections already exist (cv2-06). This is the last connection.

**Estimated time:** ~10h (2h vitals grid + 1.5h ddx chips + 2h structured follow-up + 1.5h advice/referral/test_results + 1h autosave payload audit + 2h round-trip + visual verification).

**Status:** Pending.

**Hard deps:** cv2-04 (backend columns), cv2-05 (provider types), cv2-06 (section components).

**Source:** [plan-cockpit-v2-batch.md § Wave 4](../plan-cockpit-v2-batch.md#wave-4--rx-form-ui-completion--mount-surface-verification-2-tasks-12h-single-lane) + DL-20..DL-25 in [Product plans/plan-cockpit-v2.md](../../../Product%20plans/plan-cockpit-v2.md).

---

## Model & execution guidance

**Recommended model:** **Auto** (default). Mostly mechanical form input wiring; the only genuinely novel components are the structured vitals grid + ddx chip list, both of which have well-known shadcn/ui patterns.

**Per-message escalation rule:** if Auto produces ddx chip-list interaction code that drops focus on Enter or doesn't properly debounce the input, escalate **that one message** to Composer 2-Fast — chip lists are heavy on micro-UX details that Composer handles well.

**New chat?** **Yes** — fresh chat. Pre-load:

- This task file.
- `frontend/components/cockpit/rx/RxFormContext.tsx` (cv2-05 — typed state surface).
- `frontend/components/cockpit/rx/sections/ObjectiveSection.tsx` (cv2-06 — stub to replace).
- `frontend/components/cockpit/rx/sections/AssessmentSection.tsx` (cv2-06 — stub to replace).
- `frontend/components/cockpit/rx/sections/PlanSection.tsx` (cv2-06 — stubs to replace).
- `backend/migrations/103_prescription_soap_fields_expansion.sql` (cv2-04 — CHECK constraints to validate against).
- `backend/src/services/prescription-service.ts` (or wherever the prescription draft/send service lives — find via `rg "updatePrescription\|saveDraft" backend/src/services`). This task verifies the backend service accepts and persists the new fields. If it doesn't, this task fixes it.
- Source plan § DL-20..DL-25.

**Estimated turns:** 5–6 turns (1 inventory + 1 per new input cluster × 4 + 1 backend service audit + 1 round-trip).

---

## Acceptance criteria

### Step 1 — Backend service audit (do this FIRST)

Before touching the UI, confirm the backend service that handles autosave (`PUT /api/v1/appointments/:id/prescription/draft`) and send (`POST /api/v1/appointments/:id/prescription/send`) accepts and persists the new fields. If it doesn't, this task adds them.

- [ ] `rg "prescription.*draft\|prescription.*send\|investigations_orders\|vitals_bp_systolic" backend/src` — locate the route handlers + service.
- [ ] Read the request validation schema (Zod / Joi / yup, whichever the project uses) for the prescription draft + send endpoints. Confirm it allows the new fields. If not, **extend the schema** to accept (all optional):
  - `vitals_bp_systolic`, `vitals_bp_diastolic` (integers, CHECK-validated ranges)
  - `vitals_hr`, `vitals_temp_c`, `vitals_spo2`, `vitals_wt_kg`, `vitals_ht_cm`
  - `examination_findings`, `advice`, `referral`, `test_results` (text, max ~5000 chars)
  - `differential_diagnosis` (string array, max 20 entries, each entry ≤ 200 chars)
  - `follow_up_value` (integer 0..3650), `follow_up_unit` ('days' | 'weeks' | 'months' | 'as_needed')
  - `investigations_orders` (rename — accept both `investigations` and `investigations_orders` for backwards-compat; map both to the renamed column). The `prescriptions_legacy_v` view from cv2-04 covers reads; the service handler maps the writes.
- [ ] Read the SQL `UPDATE` / `INSERT` statement in the service. Confirm it includes the new columns. If not, **extend the parameterised SQL** to include them.
- [ ] **Verify constraints stay enforced at the application layer too.** The Zod / validation schema should reject `vitals_bp_systolic = 500` before the request hits Postgres (gives a friendlier error than the CHECK constraint violation). Mirror the migration's CHECK ranges in the schema.
- [ ] **Add backend tests** in `backend/tests/integration/api/prescriptions.test.ts` (or wherever prescription tests live) for:
  - Saving a draft with `vitals_bp_systolic = 130` succeeds.
  - Saving a draft with `vitals_bp_systolic = 500` fails with 400 + a validation message.
  - Saving a draft with `differential_diagnosis = ['Pharyngitis', 'Tonsillitis']` succeeds; reloading the appointment returns the same array.
  - Saving with both `investigations` and `investigations_orders` set — server prefers `investigations_orders`.
  - Run: `pnpm --filter backend test prescriptions.test.ts`.

### Step 2 — Build the structured vitals grid

- [ ] **New file** `frontend/components/cockpit/rx/inputs/VitalsGrid.tsx`:

  ```tsx
  'use client';

  import { useRxForm } from '@/components/cockpit/rx/RxFormContext';
  import { Input } from '@/components/ui/input';
  import { Label } from '@/components/ui/label';

  // Mirror migration 103's CHECK constraints so client-side validation
  // matches server-side and DB-level.
  const RANGES = {
    bp_systolic:  { min: 30,  max: 300, step: 1,   suffix: 'mmHg' },
    bp_diastolic: { min: 20,  max: 200, step: 1,   suffix: 'mmHg' },
    hr:           { min: 20,  max: 250, step: 1,   suffix: 'bpm' },
    temp_c:       { min: 25,  max: 45,  step: 0.1, suffix: '°C' },
    spo2:         { min: 50,  max: 100, step: 1,   suffix: '%' },
    wt_kg:        { min: 0.5, max: 400, step: 0.1, suffix: 'kg' },
    ht_cm:        { min: 20,  max: 300, step: 0.5, suffix: 'cm' },
  } as const;

  export function VitalsGrid() {
    const { state, setField } = useRxForm();

    const onChangeNumeric = (
      key:
        | 'vitals_bp_systolic'
        | 'vitals_bp_diastolic'
        | 'vitals_hr'
        | 'vitals_temp_c'
        | 'vitals_spo2'
        | 'vitals_wt_kg'
        | 'vitals_ht_cm',
    ) =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        if (raw === '') {
          setField(key, null);
          return;
        }
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        setField(key, n);
      };

    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* BP rendered as a paired "systolic / diastolic" group. */}
        <div className="col-span-2 space-y-1.5 sm:col-span-2">
          <Label className="text-xs">Blood pressure (mmHg)</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              inputMode="numeric"
              min={RANGES.bp_systolic.min}
              max={RANGES.bp_systolic.max}
              step={RANGES.bp_systolic.step}
              value={state.fields.vitals_bp_systolic ?? ''}
              onChange={onChangeNumeric('vitals_bp_systolic')}
              placeholder="120"
              className="w-20"
              aria-label="Systolic"
            />
            <span className="text-muted-foreground">/</span>
            <Input
              type="number"
              inputMode="numeric"
              min={RANGES.bp_diastolic.min}
              max={RANGES.bp_diastolic.max}
              step={RANGES.bp_diastolic.step}
              value={state.fields.vitals_bp_diastolic ?? ''}
              onChange={onChangeNumeric('vitals_bp_diastolic')}
              placeholder="80"
              className="w-20"
              aria-label="Diastolic"
            />
          </div>
        </div>

        <NumericField
          label="HR"
          suffix={RANGES.hr.suffix}
          {...RANGES.hr}
          value={state.fields.vitals_hr ?? ''}
          onChange={onChangeNumeric('vitals_hr')}
        />
        <NumericField
          label="Temp"
          suffix={RANGES.temp_c.suffix}
          {...RANGES.temp_c}
          value={state.fields.vitals_temp_c ?? ''}
          onChange={onChangeNumeric('vitals_temp_c')}
        />
        <NumericField
          label="SpO₂"
          suffix={RANGES.spo2.suffix}
          {...RANGES.spo2}
          value={state.fields.vitals_spo2 ?? ''}
          onChange={onChangeNumeric('vitals_spo2')}
        />
        <NumericField
          label="Weight"
          suffix={RANGES.wt_kg.suffix}
          {...RANGES.wt_kg}
          value={state.fields.vitals_wt_kg ?? ''}
          onChange={onChangeNumeric('vitals_wt_kg')}
        />
        <NumericField
          label="Height"
          suffix={RANGES.ht_cm.suffix}
          {...RANGES.ht_cm}
          value={state.fields.vitals_ht_cm ?? ''}
          onChange={onChangeNumeric('vitals_ht_cm')}
        />
      </div>
    );
  }

  interface NumericFieldProps {
    label: string;
    min: number;
    max: number;
    step: number;
    suffix: string;
    value: number | '';
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  }

  function NumericField({ label, min, max, step, suffix, value, onChange }: NumericFieldProps) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}</Label>
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={onChange}
            placeholder="—"
            className="w-full"
            aria-label={`${label} value in ${suffix}`}
          />
          <span className="whitespace-nowrap text-xs text-muted-foreground">{suffix}</span>
        </div>
      </div>
    );
  }
  ```

- [ ] **Modify** `frontend/components/cockpit/rx/sections/ObjectiveSection.tsx`:
  - Remove the "Coming in cv2-07" stub banner.
  - Add the `<VitalsGrid />` between the legacy free-text vitals input and a new `examination_findings` `<Textarea>`.
  - Final structure:
    1. Legacy `vitals_text` (free-text) — labelled "Vitals (free-text — legacy)".
    2. `<VitalsGrid />` — labelled "Vitals (structured)".
    3. `examination_findings` `<Textarea>` — labelled "Examination findings".

### Step 3 — Build the differential diagnosis chip list

- [ ] **New file** `frontend/components/cockpit/rx/inputs/DdxChipList.tsx`:

  ```tsx
  'use client';

  import { useRxForm } from '@/components/cockpit/rx/RxFormContext';
  import { Input } from '@/components/ui/input';
  import { Label } from '@/components/ui/label';
  import { Badge } from '@/components/ui/badge';
  import { X } from 'lucide-react';
  import { useCallback, useState } from 'react';

  const MAX_ENTRIES = 20;
  const MAX_ENTRY_LENGTH = 200;

  export function DdxChipList() {
    const { state, dispatch } = useRxForm();
    const [input, setInput] = useState('');

    const addDdx = useCallback(
      (raw: string) => {
        const entry = raw.trim();
        if (!entry) return;
        if (entry.length > MAX_ENTRY_LENGTH) return;
        if (state.fields.differential_diagnosis.includes(entry)) return; // dedup
        if (state.fields.differential_diagnosis.length >= MAX_ENTRIES) return;
        dispatch({ type: 'ADD_DDX', entry });
        setInput('');
      },
      [state.fields.differential_diagnosis, dispatch],
    );

    const removeDdx = useCallback(
      (index: number) => dispatch({ type: 'REMOVE_DDX', index }),
      [dispatch],
    );

    return (
      <div className="space-y-2">
        <Label htmlFor="rx-ddx-input">Differential diagnosis</Label>
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5">
          {state.fields.differential_diagnosis.map((entry, index) => (
            <Badge key={`${entry}-${index}`} variant="secondary" className="gap-1">
              {entry}
              <button
                type="button"
                onClick={() => removeDdx(index)}
                aria-label={`Remove ${entry}`}
                className="rounded-sm opacity-60 hover:opacity-100"
              >
                <X size={12} />
              </button>
            </Badge>
          ))}
          <Input
            id="rx-ddx-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addDdx(input);
              } else if (e.key === 'Backspace' && input === '' && state.fields.differential_diagnosis.length > 0) {
                removeDdx(state.fields.differential_diagnosis.length - 1);
              }
            }}
            onBlur={() => { if (input.trim()) addDdx(input); }}
            placeholder={
              state.fields.differential_diagnosis.length === 0
                ? 'Type a differential then press Enter…'
                : 'Add another…'
            }
            className="min-w-[10rem] flex-1 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
            maxLength={MAX_ENTRY_LENGTH}
            disabled={state.fields.differential_diagnosis.length >= MAX_ENTRIES}
          />
        </div>
        {state.fields.differential_diagnosis.length >= MAX_ENTRIES && (
          <p className="text-xs text-muted-foreground">
            Max {MAX_ENTRIES} differentials. Remove some to add more.
          </p>
        )}
      </div>
    );
  }
  ```

- [ ] **Modify** `frontend/components/cockpit/rx/sections/AssessmentSection.tsx`:
  - Remove the "Coming in cv2-07" stub banner.
  - Mount `<DdxChipList />` below the provisional diagnosis input.

### Step 4 — Build the structured follow-up picker

- [ ] **New file** `frontend/components/cockpit/rx/inputs/FollowUpPicker.tsx`:

  ```tsx
  'use client';

  import { useRxForm } from '@/components/cockpit/rx/RxFormContext';
  import { Input } from '@/components/ui/input';
  import { Label } from '@/components/ui/label';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
  import type { FollowUpUnit } from '@/components/cockpit/rx/RxFormContext';

  const UNITS: { value: FollowUpUnit; label: string }[] = [
    { value: 'days', label: 'days' },
    { value: 'weeks', label: 'weeks' },
    { value: 'months', label: 'months' },
    { value: 'as_needed', label: 'as needed' },
  ];

  export function FollowUpPicker() {
    const { state, setField } = useRxForm();
    const isAsNeeded = state.fields.follow_up_unit === 'as_needed';
    return (
      <div className="space-y-1.5">
        <Label>Follow-up (structured)</Label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">in</span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={3650}
            step={1}
            value={isAsNeeded ? '' : (state.fields.follow_up_value ?? '')}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') {
                setField('follow_up_value', null);
                return;
              }
              const n = Number(raw);
              if (Number.isFinite(n)) setField('follow_up_value', Math.round(n));
            }}
            disabled={isAsNeeded}
            placeholder="0"
            className="w-20"
            aria-label="Follow-up value"
          />
          <Select
            value={state.fields.follow_up_unit ?? ''}
            onValueChange={(v) => {
              const next = (v || null) as FollowUpUnit | null;
              setField('follow_up_unit', next);
              if (next === 'as_needed') setField('follow_up_value', null);
            }}
          >
            <SelectTrigger className="w-36" aria-label="Follow-up unit">
              <SelectValue placeholder="unit…" />
            </SelectTrigger>
            <SelectContent>
              {UNITS.map((u) => (
                <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          Leave blank if no follow-up needed, or use the free-text below for special instructions.
        </p>
      </div>
    );
  }
  ```

### Step 5 — Wire advice + referral + test_results in `<PlanSection>`

- [ ] **Modify** `frontend/components/cockpit/rx/sections/PlanSection.tsx`:
  - Remove the "Coming in cv2-07" stub banner.
  - Mount `<FollowUpPicker />` directly above the legacy free-text follow-up input.
  - Add three new `<Textarea>` blocks below the patient education input:
    - `advice` — labelled "Advice / lifestyle".
    - `referral` — labelled "Referral".
    - `test_results` — labelled "Test results".
  - **Reorder for clinical priority** (DL-19, medicines-first):
    1. Medicines (top — keep).
    2. Investigations / orders (renamed — keep).
    3. **`<FollowUpPicker />`** (NEW — structured).
    4. Follow-up (free-text legacy — keep, labelled "Follow-up notes (free-text)").
    5. Advice / lifestyle (NEW).
    6. Patient education (keep).
    7. Referral (NEW).
    8. Test results (NEW).
    9. Clinical notes (private) (keep — last).

### Step 6 — Verify autosave payload includes the new fields

- [ ] Open the browser network tab. Type into `<VitalsGrid>` BP systolic. Wait > 1.5s. Verify the `PUT .../prescription/draft` request body includes `vitals_bp_systolic: 120` (or whatever value).
- [ ] Repeat for each new input cluster: vitals grid, ddx chips, follow-up picker, advice, referral, test_results.
- [ ] Verify the response is 200 and contains the persisted record with the new fields echoed back.
- [ ] **Reload the page.** Verify every new field hydrates correctly:
  - VitalsGrid shows the saved BP / HR / Temp / SpO₂ / Wt / Ht.
  - DdxChipList shows the saved differentials as chips.
  - FollowUpPicker shows the saved value + unit.
  - Advice / referral / test_results textareas show the saved text.
- [ ] **Send the prescription.** Verify the `POST .../prescription/send` request body includes the new fields. Verify the patient PDF (if it's rendered) shows them (or, if not yet — that's a Phase 2 / future concern; this task just verifies the persistence pipeline, not the rendered output).

### Step 7 — `investigations_orders` migration UX

The backend column was renamed from `investigations` to `investigations_orders` in cv2-04. The compatibility view `prescriptions_legacy_v` covers reads from any legacy consumer. This task verifies the new code path uses the new name end-to-end:

- [ ] `rg "'investigations'\b" frontend/components/cockpit/rx` — should return zero matches (everything uses `investigations_orders` now).
- [ ] `rg "investigations:\s" backend/src/services` — verify the prescription service writes to the new column name. Any legacy aliases are handled in the request schema (Step 1), not deep in the service.
- [ ] Smoke: load an old appointment with a populated legacy `investigations` value. Confirm it appears in the new `investigations_orders` input (because the value lives in the renamed column — the rename is data-preserving). Edit it; autosave; reload. Value persists.

### Step 8 — Visual & UX verification

- [ ] **Visual diff at `/dashboard/appointments/[id]`:** the form now has visible structured inputs in Objective + Assessment + Plan. No "Coming in cv2-07" banners remain.
- [ ] **Form-flow smoke:**
  - Fill a complete fictional appointment: CC, HOPI, structured vitals (BP 130/85, HR 78, Temp 37.8, SpO₂ 98), examination_findings, provisional dx, 2 differentials, 1 medicine, investigations, follow-up (in 5 days), advice, referral, test_results, patient education, clinical notes.
  - Send the prescription. Confirm success.
  - Reload. Confirm all values are preserved.
- [ ] **Validation UX:**
  - Type BP systolic = 500. Browser stops accepting (HTML5 max=300 from VitalsGrid range), or if the user pastes, the backend rejects with a 400 + a visible toast/error. Either is acceptable; pick the project's existing pattern.
  - Add 21 differentials. The 21st is rejected; the input is disabled with a help-text explaining the limit.
  - Set follow_up_unit = 'as_needed'. The value input is disabled and cleared.
- [ ] **Type-check:** `pnpm --filter frontend tsc --noEmit` clean.
- [ ] **Lint:** `pnpm --filter frontend lint` clean.
- [ ] **Backend test suite:** `pnpm --filter backend test prescriptions.test.ts` passes including the new assertions.
- [ ] **No console errors** on the appointment-detail page, in-call panel, or post-call summary.

---

## Out of scope

- **Patient-facing prescription PDF** rendering of the new fields. Phase 2 — `R-RX-PDF` (not in Phase 1). The pipeline gets the data; rendering on the PDF is a separate task.
- **Doctor-facing "summary card"** rendering of the new fields. Phase 2.
- **Doctor templates / saved presets** for the new structured fields (e.g. "BP cuff loaded" macro for vitals). Phase 2 / Phase 3.
- **AI auto-fill** of any of these fields from a chat transcript. Phase 3 (R-AI-ASSIST).
- **Removing the legacy `vitals_text` and free-text `follow_up` fields.** Phase 3 — after the structured inputs have soaked in production.
- **Per-section autosave** (only sending the modified section's fields). Phase 3.
- **Reordering medicines** within `<MedicineList>`. Pre-existing functionality preserved; not re-touched here.
- **Drug interaction warnings** when entering medicines. Phase 2+ (separate batch).
- **ICD-10 picker** for `provisional_diagnosis` / `differential_diagnosis`. Phase 3 — clinical coding is a separate concern.
- **Multi-language label support.** Out of scope.

---

## Files expected to touch

**New:**

- `frontend/components/cockpit/rx/inputs/VitalsGrid.tsx` (~150 LOC).
- `frontend/components/cockpit/rx/inputs/DdxChipList.tsx` (~100 LOC).
- `frontend/components/cockpit/rx/inputs/FollowUpPicker.tsx` (~80 LOC).

**Modified:**

- `frontend/components/cockpit/rx/sections/ObjectiveSection.tsx` (~30 LOC delta — drop stub banner, mount `<VitalsGrid />`, add `examination_findings` textarea).
- `frontend/components/cockpit/rx/sections/AssessmentSection.tsx` (~20 LOC delta — drop stub banner, mount `<DdxChipList />`).
- `frontend/components/cockpit/rx/sections/PlanSection.tsx` (~60 LOC delta — drop stub banner, mount `<FollowUpPicker />`, add advice / referral / test_results textareas, reorder for medicines-first).
- `backend/src/routes/api/v1/...prescriptions.ts` or `backend/src/services/prescription-service.ts` (extending the validation schema + SQL to accept the new fields — `~50-100 LOC delta` depending on existing patterns).
- `backend/tests/integration/api/prescriptions.test.ts` (~80 LOC of new tests).

**Read but do not modify:**

- `frontend/components/cockpit/rx/RxFormContext.tsx` (cv2-05 — already typed for these fields).
- `backend/migrations/103_prescription_soap_fields_expansion.sql` (cv2-04 — source of CHECK ranges to mirror).
- The three mount surfaces (verification only — they consume the form via the existing path).

---

## Notes / open decisions

1. **Why a vitals grid + a legacy free-text input?** Migration safety. Doctors who already have muscle memory for the free-text vitals input keep it. The structured grid is additive; the two coexist in Phase 1. Phase 3 drops the free-text. Reviewers should NOT delete the legacy field in this task — DL-22 explicitly preserves the legacy fields during the transition.

2. **Why HTML5 `<input type="number">` instead of a custom numeric input?** Native is sufficient — keyboards on mobile pop the numeric keypad, browser handles range constraints, accessibility is free. The project's `<Input>` wraps this. No need to build a custom one.

3. **Why don't ddx chips support inline edit (only add + delete)?** Simplicity. Doctors usually re-type rather than fiddle with inline edit. If a chip is wrong, delete-and-retype. cv2 keeps the chip list dumb; Phase 3 can add inline edit if needed.

4. **Why is `follow_up_value` an integer (not float)?** Doctors say "in 3 days" not "in 3.5 days". The migration enforces INTEGER. The picker rounds. Simpler.

5. **What if the existing free-text follow-up has structured-looking content like "in 5 days"?** No migration / parsing. The free-text stays free-text. New entries flow into the structured picker. Old entries stay as legacy notes. Phase 3 may add a one-time migration helper.

6. **Why does the structured follow-up picker live above the free-text one?** Per DL-21 — the structured one is the primary input; the free-text one is a notes field for cases that don't fit the structure ("come back if X happens"). Labels reinforce: "Follow-up (structured)" vs "Follow-up notes (free-text)".

7. **Why is advice a separate field from patient education?** Clinical convention. Patient education = how to take meds + warning signs. Advice = lifestyle / diet / activity / behavioural. They're distinct in the SOAP framework. DL-23.

8. **What about validation of differential_diagnosis entries (e.g. requiring they be valid ICD codes)?** Out of scope — see "Out of scope". The chip list accepts any string ≤ 200 chars.

9. **What if a doctor enters values outside the CHECK ranges by pasting?** Browser native max= is advisory; the request still flies. The Zod / validation schema (Step 1) rejects with a 400. The autosave hook (cv2-05) surfaces the error as `submitError`. The UI shows it (the existing error-display block). DB-level CHECK is the final backstop — but the error surfaces before it.

10. **What about doctor-saved presets / templates for the new structured fields?** Out of scope. The existing template system (if any) doesn't yet know about these fields; extending it is Phase 2+.

11. **Why is the test_results field a textarea and not a structured "test + result + unit" grid?** Most tests in telemed practice are referenced by name + a verbal report ("CBC normal, CRP 12, throat swab pending"). A grid would force premature structuring. Phase 3 may revisit once usage data exists.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Source decisions:** [Product plans/plan-cockpit-v2.md § DL-20 (structured vitals), § DL-21 (structured follow-up), § DL-22 (legacy field preservation), § DL-23 (advice vs patient education), § DL-24 (referral), § DL-25 (test_results)](../../../Product%20plans/plan-cockpit-v2.md).
- **Wave gate:** [`EXECUTION-ORDER-cockpit-v2.md` § Wave 4 gate](./EXECUTION-ORDER-cockpit-v2.md#wave-4-gate-after-cv2-07--cv2-08).
- **Previous task:** [`task-cv2-06-section-component-extractions.md`](./task-cv2-06-section-component-extractions.md) — provides the section components this task fills in.
- **Cross-batch dep:** [`task-cv2-04-soap-fields-migration.md`](./task-cv2-04-soap-fields-migration.md) — provides the backend columns + CHECK ranges this task mirrors.
- **Next task:** [`task-cv2-08-mount-surface-verification.md`](./task-cv2-08-mount-surface-verification.md) — verifies all three mount surfaces accept the now-complete form.

---

**Owner:** TBD
**Created:** 2026-05-17
**Status:** Pending
