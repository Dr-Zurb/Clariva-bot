# ccd-02 · Snapshot pane — live draft vitals

> **Status:** ✅ **DONE** (2026-05-26) — `<SnapshotVitalsSection>` merges `listPatientVitals` + `useOptionalRxForm()` draft; per-vital "Live draft" badges; `<ChartRailEmptyState>` when empty; 6 unit tests green.

> **Wave 1 / Lane α step 1** of [cockpit-chart-density](../plan-cockpit-chart-density-batch.md). Consumes ccd-01's shared empty-state.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | S (~60 LOC delta + ~60 LOC tests) |
| **Model** | Auto |
| **Wave** | 1 |
| **Depends on** | ccd-01 |
| **Blocks** | ccd-04 (close-out) |

---

## Goal

`<SnapshotPane>` reads current-visit vitals from `useOptionalRxForm()` and merges them into the displayed snapshot (DL-3). When the merged display has data, the persisted `patient_chart` values are shown alongside a "Live draft" badge on any fields sourced from the unsaved draft. When fully empty (no patient_chart row + no draft data), `<ChartRailEmptyState>` renders.

---

## What to do

### 1. Open `frontend/components/patient-profile/panes/SnapshotPane.tsx`

Locate the existing data-fetch + render logic. The current behavior likely:

- Fetches `patient_chart` via `usePatientChart(appointmentId, token)` or similar.
- Renders height, weight, BP, HR, etc. as labeled rows.

### 2. Add the live-draft merge

```tsx
import { useOptionalRxForm } from "@/components/cockpit/rx/RxFormContext";

// inside the component:
const rxForm = useOptionalRxForm();
const draftFields = rxForm?.fields;

// Merge: prefer draft values when set; fall back to persisted patient_chart.
const displayed = {
  heightCm: draftFields?.heightCm ?? patientChart?.height_cm ?? null,
  weightKg: draftFields?.weightKg ?? patientChart?.weight_kg ?? null,
  bp:
    draftFields?.bpSystolic && draftFields?.bpDiastolic
      ? `${draftFields.bpSystolic}/${draftFields.bpDiastolic}`
      : patientChart?.bp ?? null,
  hr: draftFields?.heartRate ?? patientChart?.heart_rate ?? null,
  // ...etc for all vitals shown in Snapshot...
};

// Per-field: was this sourced from draft? (used for the "Live draft" badge)
function isDraftValue<T>(
  draft: T | null | undefined,
  persisted: T | null | undefined,
): boolean {
  return draft != null && draft !== persisted;
}

const isDraftMap = {
  heightCm: isDraftValue(draftFields?.heightCm, patientChart?.height_cm),
  weightKg: isDraftValue(draftFields?.weightKg, patientChart?.weight_kg),
  // ...etc...
};
```

(Adjust field names to the actual `RxFormFields` shape — grep `frontend/components/cockpit/rx/RxFormContext.tsx` for the exact field names; the snippet above is illustrative.)

### 3. Render the "Live draft" badge

```tsx
import { Badge } from "@/components/ui/badge";

// Helper component for a vital row:
function VitalRow({ label, value, isDraft }: { label: string; value: string | null; isDraft: boolean }) {
  if (value == null) return null;
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-medium tabular-nums">{value}</span>
        {isDraft ? (
          <Badge
            variant="outline"
            className="text-[10px]"
            title="These vitals are from the current draft. They'll be saved when you send the Rx."
          >
            Live draft
          </Badge>
        ) : null}
      </span>
    </div>
  );
}
```

Render each vital via `<VitalRow />`.

### 4. Empty-state wire-up

Use `<ChartRailEmptyState>` from ccd-01:

```tsx
import { ChartRailEmptyState } from "./ChartRailEmptyState";
import { Heart } from "lucide-react";

const hasAnyData =
  displayed.heightCm != null ||
  displayed.weightKg != null ||
  displayed.bp != null ||
  displayed.hr != null;

if (!hasAnyData) {
  return (
    <ChartRailEmptyState
      icon={Heart}
      headline="No vitals on file"
      compact
    />
  );
}
```

(Skip the CTA — vitals are entered via the cockpit's `<VitalsGrid>` in the Objective section, not via a button here.)

### 5. Tooltip on the badge

The `title="..."` attribute on the `<Badge>` provides native-tooltip behavior. For a Radix tooltip (richer), wrap in `<Tooltip>` per DL-7. Keep this simple — native tooltip is acceptable for v1.

### 6. Tests in `__tests__/SnapshotPane.test.tsx`

```tsx
describe("SnapshotPane live draft vitals (ccd-02)", () => {
  it("shows persisted patient_chart values when no draft", () => {
    renderWithProvider({
      patientChart: { height_cm: 170, weight_kg: 65 },
      draftFields: null,
    });
    expect(screen.getByText("170")).toBeInTheDocument();
    expect(screen.queryByText("Live draft")).not.toBeInTheDocument();
  });

  it("merges draft values and shows Live draft badge", () => {
    renderWithProvider({
      patientChart: { height_cm: 170, weight_kg: 65 },
      draftFields: { heightCm: 172, weightKg: null },
    });
    expect(screen.getByText("172")).toBeInTheDocument();
    const badges = screen.getAllByText("Live draft");
    expect(badges.length).toBe(1); // only height differs from persisted
  });

  it("renders empty-state when no data anywhere", () => {
    renderWithProvider({ patientChart: null, draftFields: null });
    expect(screen.getByText("No vitals on file")).toBeInTheDocument();
  });

  it("badge disappears after persistence (draft === persisted)", () => {
    renderWithProvider({
      patientChart: { height_cm: 172 },
      draftFields: { heightCm: 172 },
    });
    expect(screen.queryByText("Live draft")).not.toBeInTheDocument();
  });
});
```

### 7. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test components/patient-profile/panes/__tests__/SnapshotPane.test.tsx
```

---

## Acceptance gate

- [x] `<SnapshotPane>` subscribes to `useOptionalRxForm()`; degrades to persisted-only when no provider.
- [x] Vital values prefer draft when set; fall back to persisted.
- [x] Per-vital "Live draft" badge appears for draft-sourced rows; hidden for persisted-only rows.
- [x] Fully-empty state renders `<ChartRailEmptyState>` per DL-1.
- [x] Tests cover all four scenarios.
- [x] tsc + lint clean.

---

## Anti-goals

- ❌ Don't write to `patient_chart` from here — Snapshot is read-only.
- ❌ Don't add a side-by-side "draft vs persisted" comparison view — capture-inbox.
- ❌ Don't auto-persist on send — that's existing behavior; we're not changing the send flow.
- ❌ Don't make the badge interactive (click to expand) — capture-inbox.

---

## Notes

- The exact field names in `RxFormFields` need verification — read `frontend/components/cockpit/rx/RxFormContext.tsx` to confirm. The snippet assumes `heightCm`, `weightKg`, `bpSystolic`, `bpDiastolic`, `heartRate`; adjust as needed.
- The "Live draft" badge tone matters: subdued (outline variant, small text) so it doesn't compete with the value. Doctors notice it but it doesn't shout.
- For SSR safety, `useOptionalRxForm()` returns `null` outside its provider — guard accordingly.
