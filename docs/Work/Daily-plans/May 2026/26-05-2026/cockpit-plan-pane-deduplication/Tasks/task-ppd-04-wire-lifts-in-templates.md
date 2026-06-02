# ppd-04 · Wire lifts into `templates.tsx`

> **Wave 2 / Lane γ** of [cockpit-plan-pane-deduplication](../plan-cockpit-plan-pane-deduplication-batch.md). Activates the lift behavior — the only file that flips the four props to `true`.

| Property | Value |
|---|---|
| **Status** | ✅ Done (2026-05-26) |
| **Owner** | Frontend |
| **Size** | XS (~5 LOC delta + ~20 LOC test deltas) |
| **Model** | Auto |
| **Wave** | 2 |
| **Depends on** | ppd-01 |
| **Blocks** | ppd-05 (close-out) |

---

## Goal

The cockpit shell sets all four lifts to `true` so its Plan pane is the structurally-correct (single-source-of-truth) surface.

---

## What to do

### 1. Open `frontend/lib/patient-profile/templates.tsx`

Locate `makeMiddleBottomRow` (line ~260). The Plan leaf currently renders:

```tsx
      {
        id: 'plan',
        title: 'Plan (Rx)',
        icon: Pill,
        render: () => (
          <div className="flex h-full flex-col">
            <InvestigationsAutoMerge
              state={ctx.state}
              appointmentId={appointment.id}
            />
            <RxPane
              appointment={appointment}
              token={ctx.token}
              state={ctx.state}
              onRxSent={ctx.onRxSent}
              onFinishVisit={ctx.onFinishVisit}
              onMedicineCountChange={ctx.onMedicineCountChange}
              hideHeader
              actionsInFooter
              dxLifted
              safetyLifted
            />
          </div>
        ),
        // ...
      },
```

Add the four lift props to the `<RxPane>` JSX:

```tsx
            <RxPane
              appointment={appointment}
              token={ctx.token}
              state={ctx.state}
              onRxSent={ctx.onRxSent}
              onFinishVisit={ctx.onFinishVisit}
              onMedicineCountChange={ctx.onMedicineCountChange}
              hideHeader
              actionsInFooter
              dxLifted
              safetyLifted
              subjectiveLifted
              objectiveLifted
              entryModeLifted
              photoLifted
            />
```

Six lifts total — mirrors the existing two; matches the pattern.

### 2. Update the file-level docstring

Append to the pane-id table (lines 20-29):

```ts
 * ppd-04 (2026-05-26): `<RxPane>` now also receives `subjectiveLifted`,
 * `objectiveLifted`, `entryModeLifted`, `photoLifted` — see
 * `plan-cockpit-plan-pane-deduplication-batch.md` for rationale.
```

### 3. Tests in the existing `templates.test.ts` (if it exists) or new

Search: `Glob frontend/lib/patient-profile/__tests__/templates*.test.*`. If the file exists, add:

```ts
  it("Plan leaf receives all six lift props", () => {
    const ctx = makeTestCtx(); // existing helper
    const layout = getTelemedVideoTemplate(ctx);
    const middleColumn = layout.find((p) => p.id === "middle-column");
    const middleBottom = middleColumn?.children?.find(
      (p) => p.id === "middle-bottom",
    );
    const planLeaf = middleBottom?.children?.find((p) => p.id === "plan");
    // Render the leaf and assert the lifts are passed.
    const { container } = render(<>{planLeaf?.render()}</>);
    // The <RxPane> component sees the lifts; test by mocking it or by
    // probing for the structural effect (Subjective hidden, etc.).
    // …
  });
```

If template testing happens elsewhere (e.g., snapshot tests), the cheapest verification is: render the Plan leaf in a test wrapper and assert `screen.queryByText("Prescription type")` returns `null` (delegate to ppd-03's tests for the actual gate behavior).

If no template test file exists, add a sentence to capture-inbox during ppd-05 to backfill template integration tests in a future micro-batch — do NOT block this task on new test scaffolding.

### 4. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
```

---

## Acceptance gate

- [x] `templates.tsx` `makeMiddleBottomRow`'s Plan `<RxPane>` includes `subjectiveLifted`, `objectiveLifted`, `entryModeLifted`, `photoLifted`.
- [x] File-level docstring lists the four new lifts.
- [x] tsc + lint clean.
- [x] (If template tests exist) at least one test confirms the lifts flow through.

---

## Anti-goals

- ❌ Don't lift anything else from `<RxPane>` here — only the four ppd lifts.
- ❌ Don't change other template factories (`getTelemedVoiceTemplate`, `getTelemedTextTemplate`, `getReviewTemplate`) — they all call `makeMiddleBottomRow`, so the change is shared automatically.
- ❌ Don't gate the lifts on modality (e.g., "only lift for video") — DL-1 says "cockpit mode lifts all". All four modalities use the same Plan leaf shape.

---

## Notes

- This is a 4-line addition. The smallest task in the batch.
- All four template factories share `makeMiddleBottomRow`, so the change applies uniformly to video / voice / text / review.
- `<RxPane>` defaults all four to `false`, so any other call site (test fixtures, hypothetical future surfaces) sees no behavioral change.
