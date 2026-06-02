# Task cv2-06: extract Subjective / Objective / Assessment / Plan section components

## 17 May 2026 — Batch [Cockpit v2 — Phase 1](../plan-cockpit-v2-batch.md) — Wave 3, Lane β step 1 — **M, ~10h**

---

## Task overview

Step 2 of the `PrescriptionForm.tsx` Strangler Fig refactor (DL-26). cv2-05 moved the form's state into `<RxFormProvider>` without changing what's rendered. This task **splits the monolithic JSX inside `<PrescriptionFormBody>` into four section components**, each owning one quadrant of the SOAP form, and mounts them via a new composition root.

After this task:

- `frontend/components/cockpit/rx/sections/SubjectiveSection.tsx` (CC, HOPI).
- `frontend/components/cockpit/rx/sections/ObjectiveSection.tsx` (legacy vitals_text + examination_findings stub).
- `frontend/components/cockpit/rx/sections/AssessmentSection.tsx` (provisional_diagnosis + differential_diagnosis stub).
- `frontend/components/cockpit/rx/sections/PlanSection.tsx` (medicines + investigations_orders + advice/follow_up/referral/test_results + patient_education + clinical_notes).
- `frontend/components/cockpit/rx/PrescriptionFormCompositionRoot.tsx` — the new shell that mounts `<RxFormProvider>` + the four sections + the "Send Rx & finish ▸" CTA in a single column (matches the existing visual layout).
- The legacy `frontend/components/consultation/PrescriptionForm.tsx` becomes a **deprecation re-export** that renders the new composition root. All three existing mount surfaces (appointment-detail page, in-call mini-panel, post-call summary) still work — they import the legacy path and get the new composition root transparently.

This task is a **pure presentational refactor.** Zero new fields shown in the UI (cv2-07's job). Zero new persistence (cv2-05 already handles it). The "Send Rx & finish ▸" primary CTA stays — DL-9 is locked.

**Estimated time:** ~10h (2h JSX mapping from `PrescriptionForm.tsx` to four sections + 4h section extractions + 2h composition root + 1h three-mount-surface compatibility shim + 1h verification).

**Status:** Pending.

**Hard deps:** cv2-05 (`<RxFormProvider>` + `useRxForm()` must exist).

**Source:** [plan-cockpit-v2-batch.md § Wave 3 Lane β](../plan-cockpit-v2-batch.md#wave-3--shell-continuation--rx-form-refactor-4-tasks-24h-with-parallelism-2-parallel-lanes-after-wave-2-ships) + DL-9, DL-19, DL-26 in [Product plans/plan-cockpit-v2.md](../../../Product%20plans/plan-cockpit-v2.md).

---

## Model & execution guidance

**Recommended model:** **Auto** (default). Mechanical JSX extraction. The hard architecture decisions are locked.

**Per-message escalation rule:** if Auto produces components that drift visually (e.g. extra wrappers / margins introduced) compared to the legacy `PrescriptionForm.tsx`, **don't escalate to Opus** — the discipline here is reviewer-driven (pixel diff). Just iterate with Auto on the specific component.

**New chat?** **Yes** — fresh chat. Pre-load:

- This task file.
- The new `frontend/components/cockpit/rx/RxFormContext.tsx` (from cv2-05 — the consumer surface this task wires).
- `frontend/components/consultation/PrescriptionForm.tsx` (post-cv2-05 — the JSX being split, now thinner since state has moved).
- `frontend/components/consultation/MedicineRow.tsx` + `frontend/components/consultation/MedicineList.tsx` (consumed by `<PlanSection>`).
- Source plan § DL-9 + § DL-19 + § DL-26.

**Estimated turns:** 5–6 turns (1 JSX inventory + 1 per section × 4 + 1 composition root + 1 compat shim).

---

## Acceptance criteria

### Step 1 — JSX inventory (decide what goes where)

Before extracting, scan the legacy `PrescriptionForm.tsx`'s JSX body and decide the boundary between sections. The SOAP framing is the guide — each section owns the fields in its quadrant.

- [ ] Run `rg "fields\.\w+|state\.fields\.\w+" frontend/components/consultation/PrescriptionForm.tsx | sort -u`. The output enumerates every field-read. Cross-check vs the inventory in `RxFormContext.tsx`'s JSDoc.
- [ ] Decide the assignment (matches DL-26):

  | Section | Owns these fields | Phase 1 UI |
  |---|---|---|
  | `<SubjectiveSection>` | `cc`, `hopi` | Existing inputs |
  | `<ObjectiveSection>` | `vitals_text` (legacy), `examination_findings` (cv2-04, **stub** for cv2-07) | Legacy free-text vitals input + placeholder banner for new structured fields |
  | `<AssessmentSection>` | `provisional_diagnosis`, `differential_diagnosis` (cv2-04, **stub**) | Existing input + placeholder for ddx |
  | `<PlanSection>` | `investigations_orders` (renamed), `medicines`, `advice` (cv2-04, **stub**), `follow_up` (legacy), `follow_up_value` + `follow_up_unit` (cv2-04, **stub**), `referral` (cv2-04, **stub**), `test_results` (cv2-04, **stub**), `patient_education`, `clinical_notes` | Existing medicines list + investigations input + free-text follow-up + patient ed + clinical notes; new fields are placeholders with "Coming soon" labels |

  *(Stub = the section component renders a stub element for the new cv2-04 field — typically a disabled input or a labelled placeholder. cv2-07 swaps the stub for the real input. Reason: cv2-06's deliverable is the structural split; cv2-07's deliverable is the new structured inputs.)*

### Step 2 — Extract `<SubjectiveSection>`

- [ ] **New file** `frontend/components/cockpit/rx/sections/SubjectiveSection.tsx`:

  ```tsx
  'use client';

  import { useRxForm } from '@/components/cockpit/rx/RxFormContext';
  import { Label } from '@/components/ui/label';
  import { Textarea } from '@/components/ui/textarea';

  export interface SubjectiveSectionProps {
    /** Section heading label. Defaults to "Subjective" — pass null to hide
     * (used by the legacy mount where the section is part of a flat form
     * with one outer heading). */
    heading?: string | null;
  }

  export function SubjectiveSection({ heading = 'Subjective' }: SubjectiveSectionProps) {
    const { state, setField } = useRxForm();
    return (
      <section aria-label="Subjective" className="space-y-3">
        {heading !== null && (
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {heading}
          </h3>
        )}
        <div className="space-y-2">
          <Label htmlFor="rx-cc">Chief complaint</Label>
          <Textarea
            id="rx-cc"
            value={state.fields.cc}
            onChange={(e) => setField('cc', e.target.value)}
            placeholder="e.g. Fever and cough for 3 days"
            rows={2}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rx-hopi">History of present illness</Label>
          <Textarea
            id="rx-hopi"
            value={state.fields.hopi}
            onChange={(e) => setField('hopi', e.target.value)}
            placeholder="Onset, duration, severity, associated symptoms…"
            rows={4}
          />
        </div>
      </section>
    );
  }
  ```

  *(The exact input components — `<Textarea>` vs the project's existing custom inputs — should match what `PrescriptionForm.tsx` uses today. Don't introduce a new input library.)*

### Step 3 — Extract `<ObjectiveSection>`

- [ ] **New file** `frontend/components/cockpit/rx/sections/ObjectiveSection.tsx`:

  ```tsx
  'use client';

  import { useRxForm } from '@/components/cockpit/rx/RxFormContext';
  import { Label } from '@/components/ui/label';
  import { Textarea } from '@/components/ui/textarea';

  export interface ObjectiveSectionProps {
    heading?: string | null;
  }

  export function ObjectiveSection({ heading = 'Objective' }: ObjectiveSectionProps) {
    const { state, setField } = useRxForm();
    return (
      <section aria-label="Objective" className="space-y-3">
        {heading !== null && (
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {heading}
          </h3>
        )}

        {/* Legacy free-text vitals — preserved until cv2-07 ships structured inputs. */}
        <div className="space-y-2">
          <Label htmlFor="rx-vitals">Vitals (free-text)</Label>
          <Textarea
            id="rx-vitals"
            value={state.fields.vitals_text}
            onChange={(e) => setField('vitals_text', e.target.value)}
            placeholder="e.g. BP 130/85, HR 78, Temp 37.8°C, SpO₂ 98%"
            rows={2}
          />
        </div>

        {/* Stub for cv2-07: structured vitals + examination_findings.
            Renders a subtle, dismissable banner so the section is visibly
            "incomplete" without breaking the existing form's flow. */}
        <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-3 text-xs text-muted-foreground">
          <strong className="font-medium">Coming in cv2-07:</strong> structured vitals
          (BP / HR / Temp / SpO₂ / weight / height) and examination findings.
          Field columns already exist in the backend; UI wiring lands next task.
        </div>
      </section>
    );
  }
  ```

### Step 4 — Extract `<AssessmentSection>`

- [ ] **New file** `frontend/components/cockpit/rx/sections/AssessmentSection.tsx`:

  ```tsx
  'use client';

  import { useRxForm } from '@/components/cockpit/rx/RxFormContext';
  import { Label } from '@/components/ui/label';
  import { Textarea } from '@/components/ui/textarea';

  export interface AssessmentSectionProps {
    heading?: string | null;
  }

  export function AssessmentSection({ heading = 'Assessment' }: AssessmentSectionProps) {
    const { state, setField } = useRxForm();
    return (
      <section aria-label="Assessment" className="space-y-3">
        {heading !== null && (
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {heading}
          </h3>
        )}
        <div className="space-y-2">
          <Label htmlFor="rx-pdx">Provisional diagnosis</Label>
          <Textarea
            id="rx-pdx"
            value={state.fields.provisional_diagnosis}
            onChange={(e) => setField('provisional_diagnosis', e.target.value)}
            placeholder="e.g. Viral pharyngitis"
            rows={2}
          />
        </div>

        {/* Stub for cv2-07: differential diagnosis as a tag-list / chips input. */}
        <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-3 text-xs text-muted-foreground">
          <strong className="font-medium">Coming in cv2-07:</strong> differential
          diagnosis as a chip list. Backend column <code>differential_diagnosis TEXT[]</code>
          already exists; UI wiring lands next task.
        </div>
      </section>
    );
  }
  ```

### Step 5 — Extract `<PlanSection>`

This is the largest section — it owns medicines (a list with its own reducer-driven sub-component), investigations, follow-up, advice, referral, test results, patient education, and clinical notes.

- [ ] **New file** `frontend/components/cockpit/rx/sections/PlanSection.tsx`:

  ```tsx
  'use client';

  import { useRxForm } from '@/components/cockpit/rx/RxFormContext';
  import { Label } from '@/components/ui/label';
  import { Textarea } from '@/components/ui/textarea';
  // The existing medicines list component is reused as-is — it already consumes
  // dispatch via props or via useRxForm() after cv2-05's wiring.
  import { MedicineList } from '@/components/consultation/MedicineList';

  export interface PlanSectionProps {
    heading?: string | null;
  }

  export function PlanSection({ heading = 'Plan' }: PlanSectionProps) {
    const { state, setField } = useRxForm();
    return (
      <section aria-label="Plan" className="space-y-4">
        {heading !== null && (
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {heading}
          </h3>
        )}

        {/* Medicines list — the bread-and-butter of every consult. Kept at the
            top of the section per DL-19 (medicine writing is the 65 % path). */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Medicines</h4>
          <MedicineList />
        </div>

        {/* Investigations orders — renamed from "investigations" per cv2-04. */}
        <div className="space-y-2">
          <Label htmlFor="rx-investigations-orders">Investigations / orders</Label>
          <Textarea
            id="rx-investigations-orders"
            value={state.fields.investigations_orders}
            onChange={(e) => setField('investigations_orders', e.target.value)}
            placeholder="e.g. CBC, CRP, throat swab"
            rows={2}
          />
        </div>

        {/* Legacy follow-up free-text — preserved until cv2-07 ships structured. */}
        <div className="space-y-2">
          <Label htmlFor="rx-followup">Follow-up (free-text)</Label>
          <Textarea
            id="rx-followup"
            value={state.fields.follow_up}
            onChange={(e) => setField('follow_up', e.target.value)}
            placeholder="e.g. Review in 5 days if symptoms persist"
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="rx-pted">Patient education</Label>
          <Textarea
            id="rx-pted"
            value={state.fields.patient_education}
            onChange={(e) => setField('patient_education', e.target.value)}
            placeholder="e.g. Drink fluids, rest, return-precautions"
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="rx-notes">Clinical notes (private)</Label>
          <Textarea
            id="rx-notes"
            value={state.fields.clinical_notes}
            onChange={(e) => setField('clinical_notes', e.target.value)}
            placeholder="Visible only to you and your team"
            rows={2}
          />
        </div>

        {/* Stub for cv2-07: structured follow-up (value + unit), advice, referral,
            test_results. */}
        <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-3 text-xs text-muted-foreground">
          <strong className="font-medium">Coming in cv2-07:</strong> structured
          follow-up (X days / weeks / months / as-needed), explicit advice,
          referral, test results. Backend columns already exist; UI wiring lands
          next task.
        </div>
      </section>
    );
  }
  ```

### Step 6 — Create the composition root

- [ ] **New file** `frontend/components/cockpit/rx/PrescriptionFormCompositionRoot.tsx`:

  ```tsx
  'use client';

  import { RxFormProvider, type RxFormFields } from '@/components/cockpit/rx/RxFormContext';
  import { SubjectiveSection } from '@/components/cockpit/rx/sections/SubjectiveSection';
  import { ObjectiveSection } from '@/components/cockpit/rx/sections/ObjectiveSection';
  import { AssessmentSection } from '@/components/cockpit/rx/sections/AssessmentSection';
  import { PlanSection } from '@/components/cockpit/rx/sections/PlanSection';
  import { SendRxFinishButton } from '@/components/cockpit/rx/SendRxFinishButton'; // exists pre-task; see notes

  export interface PrescriptionFormCompositionRootProps {
    appointmentId: string;
    initialFields: RxFormFields;
    /** Visual variant. 'flat' = all four sections in one column (legacy mount).
     * 'split' = sections rendered separately by an outer layout (Phase 2 — the
     * new pane tree mounts each section in its own pane; cv2-06 doesn't ship
     * 'split' but the prop is reserved so cv2-07 / Phase 2 can opt in.) */
    variant?: 'flat' | 'split';
    /** Hide the primary CTA (used when the parent renders its own footer). */
    hideSubmitButton?: boolean;
  }

  export default function PrescriptionFormCompositionRoot({
    appointmentId,
    initialFields,
    variant = 'flat',
    hideSubmitButton = false,
  }: PrescriptionFormCompositionRootProps) {
    return (
      <RxFormProvider appointmentId={appointmentId} initialFields={initialFields}>
        {variant === 'flat' ? (
          <div className="space-y-6">
            <SubjectiveSection />
            <ObjectiveSection />
            <AssessmentSection />
            <PlanSection />
            {!hideSubmitButton && <SendRxFinishButton />}
          </div>
        ) : (
          // 'split' variant — exposed so the future pane tree can render only
          // one section per pane via the named exports. The default composition
          // here still renders all four so this branch remains usable for any
          // mount that prefers to render explicit children.
          <>
            <SubjectiveSection />
            <ObjectiveSection />
            <AssessmentSection />
            <PlanSection />
            {!hideSubmitButton && <SendRxFinishButton />}
          </>
        )}
      </RxFormProvider>
    );
  }

  // Re-export the section components and provider — this is the single
  // surface Phase 2 layouts will consume to mount one section per pane.
  export { RxFormProvider } from '@/components/cockpit/rx/RxFormContext';
  export { useRxForm } from '@/components/cockpit/rx/RxFormContext';
  export { SubjectiveSection } from '@/components/cockpit/rx/sections/SubjectiveSection';
  export { ObjectiveSection } from '@/components/cockpit/rx/sections/ObjectiveSection';
  export { AssessmentSection } from '@/components/cockpit/rx/sections/AssessmentSection';
  export { PlanSection } from '@/components/cockpit/rx/sections/PlanSection';
  ```

- [ ] **`<SendRxFinishButton>` shim:** if no such component exists today, extract the existing "Send Rx & finish ▸" button from `PrescriptionForm.tsx`'s footer JSX into `frontend/components/cockpit/rx/SendRxFinishButton.tsx`. It consumes `useRxForm()` for `submitDisabled`, `dispatch` (to fire SUBMIT_*), and `state.fields` (to build the send payload). The submit handler is the same code that already exists; it's just moved into a leaf component. DL-9 lock: primary CTA wording is unchanged.

### Step 7 — Compatibility shim: legacy `PrescriptionForm.tsx`

The three existing mount surfaces import `<PrescriptionForm>` from `@/components/consultation/PrescriptionForm`. Keep that import path valid so this task doesn't touch every mount.

- [ ] **Modify** `frontend/components/consultation/PrescriptionForm.tsx`:

  ```tsx
  /**
   * @deprecated 2026-05-17 — internals moved to @/components/cockpit/rx.
   * This file is a compatibility re-export. New code should import directly
   * from @/components/cockpit/rx/PrescriptionFormCompositionRoot.
   *
   * Removal scheduled for Phase 3 (rx-polish-densification).
   */

  export { default } from '@/components/cockpit/rx/PrescriptionFormCompositionRoot';
  export type { PrescriptionFormCompositionRootProps as PrescriptionFormProps } from '@/components/cockpit/rx/PrescriptionFormCompositionRoot';
  ```

  *(Keep the file. Don't delete it. Removing it breaks all three mount surfaces immediately. Phase 3 will rewrite the imports across the codebase and then delete this file.)*

- [ ] The `useInitialPrescriptionFields` hook stays where it is (`frontend/components/consultation/usePrescriptionDraft.ts` or wherever cv2-05 left it). The composition root receives `initialFields` as a prop — the parent mount still calls the fetch hook. No change to the three mount surfaces' code.

### Step 8 — Mount surface check (no edits, only verification)

The three mount surfaces are:

1. **Appointment-detail page** — `frontend/app/dashboard/appointments/[id]/page.tsx` (or wherever `<PrescriptionForm>` is mounted from the appointment detail).
2. **In-call mini-panel** — `frontend/components/consultation/InCallMiniPanel.tsx` (or wherever the in-call surface mounts the form).
3. **Post-call summary** — `frontend/components/consultation/PostCallSummary.tsx` (or similar).

- [ ] Find all three: `rg "import PrescriptionForm\|from.*PrescriptionForm" frontend`. Confirm exactly three meaningful import sites (plus the compat shim's own internal references). If more than three, list them in the task notes — they'll all benefit from this task without modification.
- [ ] Smoke each: form renders unchanged, autosave still works, send still works, primary CTA label is still "Send Rx & finish ▸".

### Step 9 — Verification (deterministic)

- [ ] **Type-check:** `pnpm --filter frontend tsc --noEmit` clean.
- [ ] **Lint:** `pnpm --filter frontend lint` clean.
- [ ] **`rg "<SubjectiveSection\|<ObjectiveSection\|<AssessmentSection\|<PlanSection" frontend/components`** returns the four definitions + their composition root usage.
- [ ] **`rg "import.*from.*'@/components/consultation/PrescriptionForm'" frontend`** returns the existing mount surfaces, unchanged.
- [ ] **`rg "fields\.\w+" frontend/components/consultation/PrescriptionForm.tsx`** returns zero matches (the file is now a re-export; all field reads live in the section components).
- [ ] **`wc -l frontend/components/consultation/PrescriptionForm.tsx`** ≤ 20 LOC (just the deprecation banner + re-exports).
- [ ] **Visual diff** at `/dashboard/appointments/[id]`: zero modulo whitespace. The four sections render in the same order they did pre-task; the "Coming in cv2-07" banners are the only visible new elements (and they're intentionally subtle).
- [ ] **In-call mini-panel** smoke: open a consult, mount the form, type into each section, autosave fires per section, no console errors.
- [ ] **Post-call summary** smoke: open a completed appointment, mount the form, verify field values render correctly (read-only or editable depending on existing behaviour — preserve it).

---

## Out of scope

- **The new SOAP UI inputs** for cv2-04 fields (structured vitals chips, ddx chips, follow-up value+unit picker, advice, referral, test_results inputs). cv2-07. This task only stubs them with "Coming in cv2-07" banners.
- **The `/v2-tree` route mounting one section per pane.** Phase 2. cv2-06 only ships the 'flat' variant — the 'split' variant prop is reserved + scaffolded.
- **Replacing the legacy `vitals_text` and `follow_up` free-text fields.** Phase 3 (after the structured inputs from cv2-07 have soaked).
- **Removing `frontend/components/consultation/PrescriptionForm.tsx`** and rewriting the three mount surfaces to import the new path. Phase 3.
- **Per-section autosave** (saving only the modified section's fields rather than the whole form). Phase 3 optimisation; out of scope.
- **Per-section dirty indicators** ("Subjective ●", "Plan ●"). Phase 3.
- **Section keyboard navigation / focus management** between sections. Phase 3 / accessibility polish.
- **Section-level collapsibility within the flat mount.** Out of scope — flat mount is intentionally one continuous form so existing behaviour is preserved.

---

## Files expected to touch

**New:**

- `frontend/components/cockpit/rx/sections/SubjectiveSection.tsx` (~50 LOC).
- `frontend/components/cockpit/rx/sections/ObjectiveSection.tsx` (~55 LOC, includes stub banner).
- `frontend/components/cockpit/rx/sections/AssessmentSection.tsx` (~50 LOC, includes stub banner).
- `frontend/components/cockpit/rx/sections/PlanSection.tsx` (~100 LOC — the biggest, includes medicines list + multiple fields + stub banner).
- `frontend/components/cockpit/rx/PrescriptionFormCompositionRoot.tsx` (~80 LOC).
- `frontend/components/cockpit/rx/SendRxFinishButton.tsx` (only if the existing button isn't already isolated; ~40 LOC).

**Modified:**

- `frontend/components/consultation/PrescriptionForm.tsx` (collapses to ≤ 20 LOC — deprecation banner + re-export).

**Read but do not modify:**

- `frontend/components/cockpit/rx/RxFormContext.tsx` (cv2-05's provider; the consumer surface).
- `frontend/components/consultation/MedicineList.tsx` + `MedicineRow.tsx` (reused as-is by `<PlanSection>`).
- The three mount surfaces (verification only).

**Tests:** No new automated tests. Manual smoke covers verification.

---

## Notes / open decisions

1. **Why a `variant` prop on the composition root?** Forward-compatibility with Phase 2's pane tree. When the new layout mounts one section per pane, the parent layout shouldn't render a Subjective and a Plan section inside one container — it should mount the sections individually. The `variant: 'split'` branch demonstrates that the four section components are usable in isolation. Phase 2 will likely move from `variant: 'split'` back to direct mounting per pane.

2. **Why don't the section components accept the field values + setters as props (dependency-injection style)?** Two reasons. (a) Every section would have ten props for state + ten for setters; the prop surface explodes. (b) The provider exists for exactly this — share form state across deeply nested consumers. The context pattern is idiomatic React.

3. **Why "Coming in cv2-07" banners rather than just nothing?** Two reasons. (a) Reviewers see the visible "incomplete" state and won't think this task is broken / forgot to wire something. (b) Doctors using the form during the brief gap between cv2-06 and cv2-07 merging know to expect the new fields.

4. **What if the existing `PrescriptionForm.tsx` JSX has sections that don't map cleanly to SOAP (e.g. a "billing / payment" block)?** Put it under `<PlanSection>` at the bottom and add an inline comment `// FIXME: non-SOAP section; relocate in Phase 2`. Don't invent a fifth section.

5. **What about the "Send Rx & finish ▸" button?** It must stay the primary CTA per DL-9. The `<SendRxFinishButton>` extraction preserves the existing label, primary colour, submit handler, and disabled-state logic exactly. If the existing button does anything fancy (e.g. shows "Sending…" while in-flight), preserve it.

6. **Why is `<PlanSection>` the largest?** Because the Plan in SOAP is genuinely the largest section — medicines + investigations + advice + follow-up + referral + test_results + patient_education + clinical_notes. The medicines list itself can be 20+ rows. This is unavoidable.

7. **What if a section reaches > 200 LOC?** That's fine. The goal is a clean SOAP split, not a uniform-size split. cv2-07 may add sub-components inside (e.g. `<StructuredVitalsInputs>` inside `<ObjectiveSection>`); that's the right place for further decomposition, not in cv2-06.

8. **Why are the sections in `frontend/components/cockpit/rx/sections/` and not `frontend/components/cockpit/rx/`?** Scaling — Phase 2 may add `frontend/components/cockpit/rx/chips/`, `frontend/components/cockpit/rx/inputs/`, etc. Keeping the four top-level sections in a sub-folder mirrors that future organisation.

9. **What about i18n?** Out of scope. The existing labels are English; preserve them. If the project later adopts i18n, the section components are easy to thread through.

10. **What about server components?** All section components are `'use client'` (they consume `useRxForm()` which is a hook). The composition root is also `'use client'`. The compat shim is a pass-through and inherits whichever mode its consumer uses. No mount surface needs to be reconverted.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Source decisions:** [Product plans/plan-cockpit-v2.md § DL-9 (Primary CTA preserved), § DL-19 (medicine writing is the 65 % path), § DL-26 (SOAP boundary)](../../../Product%20plans/plan-cockpit-v2.md).
- **Wave gate:** [`EXECUTION-ORDER-cockpit-v2.md` § Wave 3 gate](./EXECUTION-ORDER-cockpit-v2.md#wave-3-gate-after-cv2-02--cv2-03--cv2-05--cv2-06).
- **Previous task in lane:** [`task-cv2-05-rx-form-context.md`](./task-cv2-05-rx-form-context.md) — provides `<RxFormProvider>` + `useRxForm()`.
- **Next task in lane (Wave 4):** [`task-cv2-07-soap-fields-ui-wire.md`](./task-cv2-07-soap-fields-ui-wire.md) — replaces the four "Coming in cv2-07" stubs with real structured inputs.

---

**Owner:** TBD
**Created:** 2026-05-17
**Status:** Pending
