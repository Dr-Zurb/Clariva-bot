# ppd-02 · Hide duplicate Subjective + Objective in `PrescriptionFormCompositionRoot`

> **Wave 2 / Lane α** of [cockpit-plan-pane-deduplication](../plan-cockpit-plan-pane-deduplication-batch.md). Resolves issues #1 + #2 from the day-26 dogfood crosswalk.

| Property | Value |
|---|---|
| **Status** | ✅ Done (2026-05-26) |
| **Owner** | Frontend |
| **Size** | S (~30 LOC delta + ~60 LOC tests) |
| **Model** | Auto |
| **Wave** | 2 |
| **Depends on** | ppd-01 |
| **Blocks** | ppd-05 (close-out) |

---

## Goal

When `subjectiveLifted === true`, `<PrescriptionFormCompositionRoot>` omits `<SubjectiveSection />`. When `objectiveLifted === true`, it omits `<ObjectiveSection />`. The remaining sections (Assessment, Plan) render normally.

This is the surgical fix that eliminates the duplicate Subjective + Objective inputs in the cockpit Plan column.

---

## What to do

### 1. Open `frontend/components/cockpit/rx/PrescriptionFormCompositionRoot.tsx`

The current `sections` JSX (lines 90-97):

```tsx
  const sections = (
    <>
      <SubjectiveSection heading={null} disabled={disabled} />
      <ObjectiveSection heading={null} />
      <AssessmentSection heading={null} disabled={disabled} dxLifted={dxLifted} />
      <PlanSection {...planProps} />
    </>
  );
```

Rewrite as conditional inclusions (DL-3):

```tsx
  const sections = (
    <>
      {!subjectiveLifted && (
        <SubjectiveSection heading={null} disabled={disabled} />
      )}
      {!objectiveLifted && <ObjectiveSection heading={null} />}
      <AssessmentSection heading={null} disabled={disabled} dxLifted={dxLifted} />
      <PlanSection {...planProps} />
    </>
  );
```

Two boolean checks; nothing else changes in this file.

### 2. Update the existing JSDoc block (lines 41-45)

Add a sentence to the existing docstring:

```ts
/**
 * SOAP section shell — must render inside `<RxFormProvider>`.
 * Headings are hidden (heading=null) to match the legacy flat form layout;
 * cv2-07 may enable per-section headings when structured inputs ship.
 *
 * ppd-02 (2026-05-26): when `subjectiveLifted` / `objectiveLifted` are true,
 * the corresponding section is omitted. Cockpit mounts set both to true so
 * the right column's `<SubjectivePane>` / `<ObjectivePane>` own the inputs.
 */
```

### 3. Create `frontend/components/cockpit/rx/__tests__/PrescriptionFormCompositionRoot.test.tsx`

If the file already exists, add the cases below; if not, create with the standard imports (search the repo for `import { render, screen } from "@testing-library/react";` for the existing pattern).

Tests:

- `"default — renders all four SOAP sections"` — no props passed; expect `<SubjectiveSection>` + `<ObjectiveSection>` + `<AssessmentSection>` + `<PlanSection>` in the DOM (test by data-testid or by section headings if present in test rendering).
- `"subjectiveLifted — omits SubjectiveSection"` — pass `subjectiveLifted={true}`; expect no Subjective subtree but Objective + Assessment + Plan still present.
- `"objectiveLifted — omits ObjectiveSection"` — symmetric.
- `"both lifted — only Assessment + Plan render"` — pass both `true`.
- `"defaults preserved"` — confirm that omitting both props is equivalent to passing `false`.

Reference test pattern: see `__tests__/AssessmentSection.test.tsx` in the same folder for testing-library setup with `<RxFormProvider>`.

If `<RxFormProvider>` setup is heavy, wrap each test in a helper:

```tsx
function renderWithProvider(props: Partial<PrescriptionFormCompositionRootProps> = {}) {
  return render(
    <RxFormProvider {...defaultProviderProps}>
      <PrescriptionFormCompositionRoot
        token="t"
        medicineInstanceIds={[]}
        setMedicineInstanceIds={vi.fn()}
        generateInstanceIds={() => []}
        drugMasterIndex={new Map()}
        setDrugMasterIndex={vi.fn()}
        allergies={[]}
        ddiInteractions={[]}
        isAcked={() => false}
        onAcknowledge={vi.fn()}
        onAckDdi={vi.fn()}
        {...props}
      />
    </RxFormProvider>
  );
}
```

(Snapshot the existing `defaultProviderProps` pattern from sibling tests.)

### 4. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend test components/cockpit/rx/__tests__/PrescriptionFormCompositionRoot.test.tsx
```

---

## Acceptance gate

- [x] `<PrescriptionFormCompositionRoot subjectiveLifted>` does NOT render `<SubjectiveSection>` (testable via DOM query).
- [x] `<PrescriptionFormCompositionRoot objectiveLifted>` does NOT render `<ObjectiveSection>`.
- [x] `<PrescriptionFormCompositionRoot subjectiveLifted objectiveLifted>` renders only Assessment + Plan.
- [x] Defaults preserved: `<PrescriptionFormCompositionRoot />` renders all four sections (subject to other required props).
- [x] tsc + lint clean.
- [x] Tests pass.

---

## Anti-goals

- ❌ Don't change AssessmentSection or PlanSection branches — they stay unconditional.
- ❌ Don't add data-only state changes — only render branches.
- ❌ Don't expose props from `useRxForm()` to gate Subjective/Objective (e.g., "hide if context says hidden"). The gate is purely prop-driven.
- ❌ Don't move the conditional to a sibling component — keep it inline.

---

## Notes

- Why fragment with conditional `{x && <C />}` instead of an array filter: cleaner React key stability for unconditional siblings. No `key` prop needed.
- The right column's `<SubjectivePane>` + `<ObjectivePane>` (which own the lifted inputs) ALREADY subscribe to `RxFormContext` — verified by csf-03 wiring. Data flow is unchanged; only the rendering surface relocates.
