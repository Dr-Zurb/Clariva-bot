# cmr-02 · SafetyStickyStrip — allergy clash + DDI chips pinned above bottom-row

> **Wave 1 lane α (second task)** of the [cockpit-middle-rebuild batch](../plan-cockpit-middle-rebuild-batch.md). Lift the allergy clash banner + DDI chips out of `<RxWorkspace>` / `<PrescriptionForm>` into a dedicated sticky strip pinned at the top of the bottom-row.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | M (one new component ~150-220 LOC; minor extraction from RxWorkspace if banners weren't already standalone) |
| **Model** | **Auto** — wraps existing components with sticky positioning; resolves the long-standing TODO β-1 in `RxWorkspace.tsx` |
| **Wave** | 1 (lane α) |
| **Depends on** | Existing `<AllergyClashBanner>` + `<InteractionChips>` (and their data hooks); cv2-05 (`RxFormContext`) |
| **Blocks** | cmr-06 (wires into templates); cmr-07 (telemetry) |

---

## Goal

Create `frontend/components/cockpit/middle/SafetyStickyStrip.tsx` — a `position: sticky; top: 0` overlay rendered inside the bottom-row's render path. Hosts:

1. **Allergy clash banner** — when any current medicine clashes with a known patient allergy (cv2-04 / existing data flow).
2. **DDI (drug-drug interaction) chips** — when current medicines interact with each other.
3. Empty state (no clashes / no DDIs) — strip is not rendered or renders as a thin 0-height shell (don't take vertical space if nothing to show).

Resolves the long-standing TODO β-1 in `RxWorkspace.tsx`: "Pin AllergyClashBanner + InteractionChips above form scroll."

---

## What to do

### 1. Inventory existing banner / chip components

Find:
- `<AllergyClashBanner>` — likely at `frontend/components/consultation/AllergyClashBanner.tsx` or similar.
- `<InteractionChips>` (DDI) — likely at `frontend/components/consultation/InteractionChips.tsx` or similar.
- Their data hooks — they likely consume `RxFormContext.fields.medicines` plus patient allergy + DDI rule fetches.

Document the inventory at the top of the new file. Goal: the new strip is a thin wrapper that mounts both components in a sticky container.

### 2. Decide: re-extract or reuse-in-place?

**Reuse-in-place (preferred):** Import `<AllergyClashBanner>` + `<InteractionChips>` as-is into the strip. The data hooks they own continue to work because `RxFormContext` is the same provider.

**Re-extract:** If the existing components are tightly coupled to `<RxWorkspace>`'s inner render (e.g., they consume a `<RxWorkspace>`-internal prop), extract them to standalone components first. This is a refactor that exceeds the batch scope; if needed, the executor capture-inboxes a follow-up and ships a minimal extraction here.

Aim for reuse-in-place. The TODO β-1 says "requires PrescriptionForm to expose allergy/DDI state via a ref or context" — but cv2-05 already exposes the form state via `RxFormContext`, so the strip can subscribe directly without needing PrescriptionForm to expose anything new.

### 3. Build the strip component

```tsx
"use client";

/**
 * SafetyStickyStrip — sticky-top overlay inside the bottom-row of the
 * cockpit-v2 middle column. Pins allergy clash banner + DDI chips above
 * Investigations + Plan content so they never scroll off (source plan DL-9).
 *
 * Resolves TODO β-1 in `RxWorkspace.tsx`: the existing AllergyClashBanner +
 * InteractionChips lived inside the form's body scroll; now they live in a
 * sticky overlay rendered by the template, NOT by the form.
 *
 * Empty state (no clashes, no DDIs) → returns null. No reserved height.
 *
 * @see frontend/components/consultation/AllergyClashBanner.tsx — banner UI.
 * @see frontend/components/consultation/InteractionChips.tsx — DDI chip UI.
 * @see frontend/components/cockpit/rx/RxFormContext.tsx — data source.
 * @see docs/Work/Daily-plans/May 2026/21-05-2026/cockpit-middle-rebuild/
 *      Tasks/task-cmr-02-safety-sticky-strip.md
 */

import { useEffect, useMemo } from "react";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { useAllergyClash } from "@/hooks/useAllergyClash"; // or wherever the hook lives
import { useDrugInteractions } from "@/hooks/useDrugInteractions"; // ditto
import { AllergyClashBanner } from "@/components/consultation/AllergyClashBanner";
import { InteractionChips } from "@/components/consultation/InteractionChips";
import { trackCockpitV2RMiddleSafetyLanded } from "@/lib/patient-profile/telemetry";

export interface SafetyStickyStripProps {
  patientId: string;
  token: string;
  appointmentId: string;
}

export function SafetyStickyStrip({
  patientId,
  token,
  appointmentId,
}: SafetyStickyStripProps) {
  const { state } = useRxForm();
  const medicines = state.fields.medicines;
  const clashes = useAllergyClash(patientId, token, medicines);
  const interactions = useDrugInteractions(medicines);

  const hasClashes = clashes.length > 0;
  const hasInteractions = interactions.length > 0;
  const visible = hasClashes || hasInteractions;

  useEffect(() => {
    if (visible) {
      trackCockpitV2RMiddleSafetyLanded({
        appointmentId,
        clashes_count: clashes.length,
        ddi_count: interactions.length,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]); // fire once when strip first becomes visible

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Drug safety warnings"
      className="sticky top-0 z-10 flex flex-col gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2"
    >
      {hasClashes && <AllergyClashBanner clashes={clashes} />}
      {hasInteractions && <InteractionChips interactions={interactions} />}
    </div>
  );
}
```

(Adjust hook names + prop signatures to match the actual existing hooks. The inventory in §1 surfaces them.)

### 4. Verify the existing components handle the lift gracefully

Open `<RxWorkspace>` and find where `<AllergyClashBanner>` + `<InteractionChips>` were rendered inline. After cmr-06 wires the new strip, `<RxWorkspace>` no longer renders them itself (the strip does, in a position that's above `<RxWorkspace>`).

But `<RxWorkspace>` continues rendering its inner content (the prescription form sections). The strip is OUTSIDE `<RxWorkspace>` — it's a sibling rendered by the bottom-row's render function in templates.tsx.

If `<RxWorkspace>` has internal logic that gated rendering of the banners (e.g., a `showBanners` flag), simplify by deleting that gate — the new strip self-gates via the empty-state check.

If `<RxWorkspace>` consumed banner state in unrelated logic (e.g., disabling Send when a severe clash exists), keep that gate but extract it to `useAllergyClash` so both the strip and `<RxWorkspace>` consume the same source of truth.

### 5. Unit test

`frontend/components/cockpit/middle/__tests__/SafetyStickyStrip.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { SafetyStickyStrip } from '../SafetyStickyStrip';
import { RxFormProvider } from '@/components/cockpit/rx/RxFormContext';
// Mock the hooks.

describe('SafetyStickyStrip', () => {
  it('returns null when no clashes and no interactions', () => {
    // mock useAllergyClash → []; useDrugInteractions → [];
    const { container } = render(/* … */);
    expect(container.firstChild).toBeNull();
  });

  it('renders banner when clashes present', () => {
    // mock useAllergyClash → [{ medicineId, allergyName, ... }];
    render(/* … */);
    expect(screen.getByText(/allergy/i)).toBeInTheDocument();
  });

  it('renders chips when DDIs present', () => {
    // mock useDrugInteractions → [{ a, b, severity }];
    render(/* … */);
    expect(screen.getByText(/interaction/i)).toBeInTheDocument();
  });
});
```

### 6. Smoke at dev fixture (NOT committed)

Build a fixture that provides fake clashes + DDIs and renders the strip in a scroll container. Verify:
- Sticky-top positioning works when scrolling the parent.
- Empty state renders null (no reserved height).
- Banner + chips render side-by-side or stacked depending on the strip's vertical layout choice.

---

## Files touched

- **New:** `frontend/components/cockpit/middle/SafetyStickyStrip.tsx` (~150-220 LOC).
- **Modified (possibly):** `frontend/components/consultation/AllergyClashBanner.tsx` — only if extraction is needed; otherwise unchanged.
- **Modified (possibly):** `frontend/components/consultation/InteractionChips.tsx` — same.
- **Modified:** `frontend/components/consultation/cockpit/RxWorkspace.tsx` — remove inline banner rendering (lift to the strip); clear the TODO β-1 comment.
- **New:** `frontend/components/cockpit/middle/__tests__/SafetyStickyStrip.test.tsx` (~70 LOC).
- **(Dev fixture, not committed):** `frontend/app/dashboard/_dev/safety-strip-fixture/page.tsx`.

---

## Acceptance gate

- [x] `SafetyStickyStrip` exports from new file. Compiles.
- [x] Sticky-top positioning verified at dev fixture (parent scrolls; strip stays). *(dev fixture built + removed; `sticky top-0` on strip root)*
- [x] Empty state returns null; no reserved vertical space.
- [x] Banner + chips render correctly when their data hooks return non-empty.
- [x] `<RxWorkspace>` no longer renders the inline banners. The TODO β-1 comment is removed (replaced by a "moved to SafetyStickyStrip" note).
- [x] Unit tests pass.
- [x] Existing allergy / DDI tests in `RxWorkspace.test.tsx` (if any) still pass. *(none present)*
- [x] Dev fixture verified locally; deleted before commit.
- [x] No new packages installed.
- [x] `pnpm --filter frontend tsc --noEmit` + `lint` clean. *(vitest + tsc via npx)*

---

## Anti-goals

- ❌ Don't change the banner / chip components' UI. Lift only.
- ❌ Don't introduce a new data fetch — reuse existing hooks.
- ❌ Don't add dismiss / close affordances to the banner — keeping per source plan DL-9 (always visible during medicines edit).
- ❌ Don't add a second RxFormProvider — subscribe to the lifted provider.
- ❌ Don't render the strip outside the bottom-row. It's an overlay INSIDE the bottom-row's render path so its `position: sticky` anchors against the bottom-row's scroll container, not the page.

---

## Notes

- The "sticky inside bottom-row" pattern works because the bottom-row's render function in templates.tsx will wrap the existing PanelGroup with a div that has `overflow-y: auto`. The strip's `position: sticky; top: 0` anchors against THAT scroll container. cmr-06 sets up the wrapping div; this task just builds the strip component.
- If the existing AllergyClashBanner is severity-tinted (red for severe, amber for moderate), the strip's outer wrapper picks the strongest severity for its border color. Defer to the existing component if it handles its own coloring.
- The TODO β-1 has been in `RxWorkspace.tsx` since pre-cv2. Closing it is a small but symbolic win — flag it in the commit message.
- The DDI chips component may need a small refactor to render in a horizontal scroll when too many chips exist. Capture-inbox if it doesn't fit gracefully in the strip's space.
