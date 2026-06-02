# cpv-01 · AssessmentStrip zero-state

> **Status:** ✅ Done (2026-05-26). `ready` / `lobby` map to plan “waiting” (`CockpitState` has no `waiting` literal).

> **Wave 1 step 0** of [cockpit-polish-visual](../plan-cockpit-polish-visual-batch.md). Resolves issue #13 — AssessmentStrip too tall + empty during `waiting` state.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | S (~30 LOC delta + ~30 LOC tests) |
| **Model** | Auto |
| **Wave** | 1 |
| **Depends on** | — |
| **Blocks** | cpv-02 (next step in Wave 1) |

---

## Goal

When `state === "waiting"` AND no Dx is entered, `<AssessmentStrip>` collapses to ~24px with a muted hint copy `"Diagnosis appears here once the doctor enters one"` (DL-1).

When state transitions to `"live"` OR a Dx is entered, the strip expands to its full height per cmr-01.

---

## What to do

### 1. Open `frontend/components/cockpit/middle/AssessmentStrip.tsx`

Read the existing implementation. Note the props (likely `{ state, appointmentId }`) and how it reads Dx data — most likely via `useOptionalRxForm()` or a dedicated `useAssessmentData` hook.

### 2. Compute the zero-state signal

```tsx
import { useOptionalRxForm } from "@/components/cockpit/rx/RxFormContext";

const rxForm = useOptionalRxForm();
const diagnosis = rxForm?.fields.diagnosis ?? "";
const isZeroState = state === "waiting" && diagnosis.trim() === "";
```

(Adjust the field path if `diagnosis` lives under a nested key per `RxFormFields`.)

### 3. Render the zero-state branch

```tsx
if (isZeroState) {
  return (
    <div
      role="status"
      aria-label="Assessment strip — waiting for diagnosis"
      className="flex h-6 items-center px-3 text-xs text-muted-foreground/70"
    >
      Diagnosis appears here once the doctor enters one
    </div>
  );
}

// Existing full-height render path below…
```

The `h-6` (~24px) matches DL-1. No padding beyond `px-3` (no top/bottom padding) — the strip is a thin reminder, not a panel.

### 4. Preserve aria semantics

The existing strip presumably has an `aria-live` region for screen readers when Dx updates. Keep that pattern; the zero-state has its own `role="status"` so SR users know the strip is intentional.

### 5. Tests in `__tests__/AssessmentStrip.test.tsx`

Add or modify:

```tsx
describe("AssessmentStrip zero-state (cpv-01)", () => {
  it("collapses to ~24px hint when state=waiting and no Dx", () => {
    renderWithProvider({ state: "waiting", diagnosis: "" });
    expect(
      screen.getByText(/diagnosis appears here once the doctor enters one/i),
    ).toBeInTheDocument();
  });

  it("expands when state transitions to live", () => {
    renderWithProvider({ state: "live", diagnosis: "" });
    expect(
      screen.queryByText(/diagnosis appears here/i),
    ).not.toBeInTheDocument();
    // Assert presence of full-strip markup (data-testid, role, or known text).
  });

  it("expands when Dx is entered even in waiting state", () => {
    renderWithProvider({ state: "waiting", diagnosis: "URI" });
    expect(
      screen.queryByText(/diagnosis appears here/i),
    ).not.toBeInTheDocument();
  });
});
```

### 6. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test components/cockpit/middle/__tests__/AssessmentStrip.test.tsx
```

---

## Acceptance gate

- [x] Zero-state branch renders the muted hint at ~24px height.
- [x] Branch is gated on `state === "waiting"` AND empty Dx.
- [x] State transitions (waiting → live) expand the strip.
- [x] Entering Dx expands the strip even in waiting.
- [x] Aria semantics preserved.
- [x] Tests cover all three branches.
- [x] tsc + lint clean.

---

## Anti-goals

- ❌ Don't add animation — capture-inbox.
- ❌ Don't change the full-height render path — only the zero-state branch.
- ❌ Don't compute additional zero-state copy variants per modality — single string.
- ❌ Don't fire telemetry from here — close-out task owns the per-batch event.

---

## Notes

- The `h-6` Tailwind class is 1.5rem (24px) — matches DL-1's "~24px".
- The hint copy is intentionally low-key (`text-muted-foreground/70`) so it fades into the background; doctors notice it on first load but ignore it during normal flow.
- For waiting state with no Dx but an existing Assessment trail (DDx, etc.), the zero-state still applies — the strip is gated on Dx specifically, not on the whole Assessment object.
