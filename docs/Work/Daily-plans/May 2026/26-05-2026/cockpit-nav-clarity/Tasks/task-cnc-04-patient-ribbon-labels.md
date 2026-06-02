# cnc-04 · PatientRibbon indicator labels + tooltips

> **Wave 2 / Lane γ** of [cockpit-nav-clarity](../plan-cockpit-nav-clarity-batch.md). Resolves issue #9 — header safety + treating indicators are mystery icons.

| Property | Value |
|---|---|
| **Status** | ✅ Done (2026-05-26) |
| **Owner** | Frontend |
| **Size** | S (~50 LOC delta + ~50 LOC tests) |
| **Model** | Auto |
| **Wave** | 2 |
| **Depends on** | — |
| **Blocks** | cnc-05 (close-out) |

---

## Goal

Add `aria-label` + Radix `<Tooltip>` to the safety + treating indicators in `<PatientRibbon>`. Replace the `"--"` placeholder with explicit "not assigned" copy (DL-6 + DL-7).

---

## What to do

### 1. Open `frontend/components/patient-profile/PatientRibbon.tsx`

Locate the safety indicator (icon-only render block). Likely structure:

```tsx
<div className="flex items-center gap-1">
  <Shield className="h-4 w-4 text-amber-500" />
  {/* maybe a count badge */}
</div>
```

Wrap in a Radix `<Tooltip>`:

```tsx
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

<Tooltip>
  <TooltipTrigger asChild>
    <button
      type="button"
      aria-label={safetyLabel}
      className="flex items-center gap-1 rounded p-0.5 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Shield className="h-4 w-4 text-amber-500" />
      <span className="sr-only">{safetyLabel}</span>
    </button>
  </TooltipTrigger>
  <TooltipContent>
    <p>{safetyTooltipText}</p>
  </TooltipContent>
</Tooltip>
```

Compute `safetyLabel` + `safetyTooltipText` based on safety state. For v1 (no live signal):

```tsx
const safetyLabel = "Safety status — review required";
const safetyTooltipText = "Check allergies, interactions, and contraindications before sending.";
```

(If `<RxSafetyContext>` exposes severity, derive copy from it; otherwise use the generic v1 copy and capture-inbox for a richer derivation.)

### 2. Treating indicator

Locate the "Treating: --" render. Likely:

```tsx
<span className="text-sm text-muted-foreground">
  Treating: {patient.treating_doctor ?? "--"}
</span>
```

Replace per DL-7:

```tsx
const treatingLabel = patient.treating_doctor
  ? `Treating: Dr. ${patient.treating_doctor}`
  : "Treating: not assigned";

<Tooltip>
  <TooltipTrigger asChild>
    <span
      className="text-sm text-muted-foreground cursor-help"
      aria-label={treatingLabel}
    >
      {treatingLabel}
    </span>
  </TooltipTrigger>
  <TooltipContent>
    <p>The doctor currently assigned to manage this patient&apos;s care.</p>
  </TooltipContent>
</Tooltip>
```

(Adjust `patient.treating_doctor` field name to whatever the real prop is — grep first to confirm.)

### 3. Tooltip provider check

If the Ribbon isn't already wrapped in `<TooltipProvider>` (Radix requirement), add one at the component root or higher in the tree. Search for existing `<TooltipProvider>` instances; if `PatientProfilePage` or `Shell` already mounts one, no change needed.

### 4. Tests in `frontend/components/patient-profile/__tests__/PatientRibbon.test.tsx` (mod or new)

```tsx
describe("PatientRibbon indicator labels (cnc-04)", () => {
  it("safety indicator has aria-label", () => {
    renderWithProvider();
    const safety = screen.getByLabelText(/safety status/i);
    expect(safety).toBeInTheDocument();
  });

  it("treating indicator shows 'not assigned' when null", () => {
    renderWithProvider({ patient: { ...defaultPatient, treating_doctor: null } });
    expect(screen.getByText(/treating: not assigned/i)).toBeInTheDocument();
  });

  it("treating indicator shows doctor name when set", () => {
    renderWithProvider({ patient: { ...defaultPatient, treating_doctor: "Smith" } });
    expect(screen.getByText(/treating: dr\. smith/i)).toBeInTheDocument();
  });

  it("treating indicator never renders the legacy '--' placeholder", () => {
    renderWithProvider({ patient: { ...defaultPatient, treating_doctor: null } });
    expect(screen.queryByText(/treating: --/)).not.toBeInTheDocument();
  });

  it("tooltip content appears on hover (or via aria-describedby)", async () => {
    const user = userEvent.setup();
    renderWithProvider();
    await user.hover(screen.getByLabelText(/safety status/i));
    expect(await screen.findByText(/check allergies/i)).toBeInTheDocument();
  });
});
```

### 5. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test components/patient-profile/__tests__/PatientRibbon.test.tsx
```

---

## Acceptance gate

- [x] Safety indicator has an `aria-label` and a Radix tooltip on hover/focus.
- [x] Treating indicator shows `"Treating: not assigned"` when the field is null/undefined.
- [x] Treating indicator shows diagnosis text when provisional diagnosis is set (ribbon mirrors RxForm, not `treating_doctor`).
- [x] The literal `"--"` placeholder is removed entirely from `<PatientRibbon>`.
- [x] Tooltip content is readable / not cut off in normal layouts.
- [x] Tests cover both populated + null cases.
- [x] tsc + lint clean.

---

## Anti-goals

- ❌ Don't make the safety indicator clickable to open a side-sheet — capture-inbox for a richer interaction.
- ❌ Don't make the treating indicator a picker — capture-inbox for the assign-flow.
- ❌ Don't add a third indicator — scope is limited to existing safety + treating.
- ❌ Don't change the icon shape — only labels + tooltips.

---

## Notes

- Radix `<Tooltip>` is available via `@/components/ui/tooltip` — pattern used elsewhere in the codebase (search for examples).
- For screen-reader testing, the `aria-label` alone is sufficient; the tooltip is a visual enhancement.
- The "not assigned" copy is explicit by design — "--" is ambiguous; "not assigned" tells the doctor the field is editable / waiting for input.

### Implementation notes (2026-05-26)

- Ribbon never had `treating_doctor` or a Shield slot (crb-02 ships identity / allergies / chronic / meds / 🎯 Dx mirror). cnc-04 added `<SafetySlot>` (Shield + `useOptionalRxSafety`) and updated `<TreatingSlot>` for provisional diagnosis: empty → `Treating: not assigned` (replaces em-dash `—`).
- Tests: `frontend/components/patient-profile/__tests__/PatientRibbon.test.tsx`.
