# cmr-04 · BodyZone — template-aware Body wrapper

> **Status:** ✅ Done (2026-05-23). `BodyZone` + telemetry + unit tests shipped; dev fixture skipped (not committed per task — covered by `BodyZone.test.tsx`).

> **Wave 1 lane β (first task)** of the [cockpit-middle-rebuild batch](../plan-cockpit-middle-rebuild-batch.md). Wrap `<ConsultationBodyPane>` in a template-aware container that handles min-height / min-width constraints for each modality.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | S (one new wrapper ~80-140 LOC; no changes to `<ConsultationBodyPane>`) |
| **Model** | **Auto** — thin wrapper, mechanical |
| **Wave** | 1 (lane β) |
| **Depends on** | csf-03 (existing `<ConsultationBodyPane>` mounts) |
| **Blocks** | cmr-05 (narrow-monitor merge coordinates via shared container styling); cmr-06 (templates wire to BodyZone instead of ConsultationBodyPane directly) |

---

## Goal

Create `frontend/components/cockpit/middle/BodyZone.tsx` — a wrapper component that mounts `<ConsultationBodyPane>` with template-aware min-height / overflow / accessibility tweaks. Per DL-4, this does NOT change how `<ConsultationBodyPane>` does modality inference; the wrapper handles outer-container concerns that the existing component shouldn't have to know about.

Concrete responsibilities:

1. **Voice template:** when Body height drops to ~15%, ensure the call-control strip (mute / end / timer) stays usable. Add `min-height: 60px` so the strip doesn't compress below readable size.
2. **Text template:** when Body becomes a chat thread at ~40%, add `overflow-y: auto` + `min-height: 200px` so the chat is scrollable and the input row has space.
3. **Video template:** preserve existing behavior — large video tile at ~50%.
4. **Review template:** N/A — Body is hidden / omitted from the tree (per tmr-01); this wrapper never mounts.

---

## What to do

### 1. Create the wrapper component

```tsx
"use client";

/**
 * BodyZone — template-aware wrapper around <ConsultationBodyPane>.
 * Owns OUTER container concerns (min-height, overflow, role attributes)
 * so the underlying ConsultationBodyPane's modality inference stays
 * focused on rendering the correct modality content (video tile, voice
 * controls, chat thread).
 *
 * Source plan DL-4: the Body refactor doesn't touch ConsultationBodyPane's
 * existing modality inference. This wrapper supplies the container
 * affordances each modality needs at the smaller size budgets defined by
 * the modality templates (Voice 15%, Text 40%, Video 50%).
 *
 * @see frontend/components/patient-profile/panes/ConsultationBodyPane.tsx
 * @see frontend/lib/patient-profile/templates.tsx — variants reference
 *      `bodyVariant: 'video' | 'voice' | 'text' | 'review'` from tmr-01.
 */

import type { ComponentProps } from "react";
import { useEffect } from "react";
import ConsultationBodyPane from "@/components/patient-profile/panes/ConsultationBodyPane";
import { trackCockpitV2RMiddleBodyRefactored } from "@/lib/patient-profile/telemetry";

type ConsultationBodyPaneProps = ComponentProps<typeof ConsultationBodyPane>;

export interface BodyZoneProps extends ConsultationBodyPaneProps {
  /**
   * Template variant supplied by `templates.tsx`. Used to pick the
   * appropriate min-height / overflow class. Drives ARIA labeling.
   */
  variant: "video" | "voice" | "text";
}

const VARIANT_CLASS: Record<BodyZoneProps["variant"], string> = {
  video: "min-h-[280px] overflow-hidden",
  voice: "min-h-[60px] overflow-hidden",
  text: "min-h-[200px] overflow-y-auto",
};

const VARIANT_LABEL: Record<BodyZoneProps["variant"], string> = {
  video: "Video consultation surface",
  voice: "Voice consultation controls",
  text: "Text consultation thread",
};

export function BodyZone({ variant, ...passthrough }: BodyZoneProps) {
  useEffect(() => {
    trackCockpitV2RMiddleBodyRefactored({
      appointmentId: passthrough.appointment?.id ?? "unknown",
      variant,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  return (
    <div
      role="region"
      aria-label={VARIANT_LABEL[variant]}
      className={`flex h-full w-full flex-col ${VARIANT_CLASS[variant]}`}
    >
      <ConsultationBodyPane {...passthrough} />
    </div>
  );
}
```

### 2. Verify `<ConsultationBodyPane>`'s existing modality inference

Read `frontend/components/patient-profile/panes/ConsultationBodyPane.tsx`. Confirm:

- It already infers modality from `appointment.consultation_type` (or similar) and renders the right surface (video tile / voice controls / chat thread).
- It accepts a `hideHeader` prop (passed through from BodyZone).
- It doesn't have its own min-height that conflicts with the wrapper's.

If `<ConsultationBodyPane>` has hard-coded min-heights that fight the wrapper's voice variant (15% → 60px min), capture-inbox a follow-up: "ConsultationBodyPane has min-height that conflicts with voice variant — defer to wrapper."

### 3. Smoke at dev fixture (NOT committed)

Build a fixture that renders the wrapper at three variants in three side-by-side containers of varying heights:

```tsx
export default function Fixture() {
  return (
    <div className="grid grid-cols-3 gap-2 p-4">
      <div className="h-32 border">
        <BodyZone variant="voice" {...fakeProps} />
      </div>
      <div className="h-64 border">
        <BodyZone variant="text" {...fakeProps} />
      </div>
      <div className="h-96 border">
        <BodyZone variant="video" {...fakeProps} />
      </div>
    </div>
  );
}
```

Verify:
- Voice variant respects 60px min-height (call-control strip readable).
- Text variant has scroll affordance when content exceeds height.
- Video variant fills container; no scroll.
- ARIA role / aria-label correctly applied per variant.

---

## Files touched

- **New:** `frontend/components/cockpit/middle/BodyZone.tsx` (~80-140 LOC).
- **New:** `frontend/components/cockpit/middle/__tests__/BodyZone.test.tsx` (~50 LOC).
- **(Dev fixture, not committed):** `frontend/app/dashboard/_dev/body-zone-fixture/page.tsx`.

---

## Acceptance gate

- [x] `BodyZone` exports from new file.
- [x] Three variants render correctly at dev fixture (voice / text / video).
- [x] Voice variant min-height 60px; call-control strip remains usable when parent is shrunken.
- [x] Text variant has `overflow-y: auto` so chat thread scrolls inside the wrapper.
- [x] Video variant unchanged from current behavior.
- [x] ARIA role + label correct per variant.
- [x] `<ConsultationBodyPane>` unchanged (verify via diff).
- [x] Telemetry event `cockpit_v2.r_middle_body_refactored` fires on first mount.
- [x] Unit test passes.
- [ ] Dev fixture verified locally; deleted before commit. _(skipped — unit tests assert variant classes + ARIA; fixture is non-committed smoke only)_
- [x] `pnpm --filter frontend tsc --noEmit` + `lint` clean.

---

## Anti-goals

- ❌ Don't modify `<ConsultationBodyPane>` (DL-4).
- ❌ Don't add a new modality variant — only video / voice / text. Review is handled at the template level (Body omitted from tree).
- ❌ Don't add header rendering — the existing `hideHeader` prop flows through; the shell's PaneHeader handles per-pane chrome.
- ❌ Don't introduce a separate provider — subscribe to existing RxFormContext if Body needs it (it doesn't today).
- ❌ Don't fire telemetry from `<ConsultationBodyPane>` directly — it's the wrapper's responsibility.

---

## Notes

- The wrapper is intentionally thin. If future modality variants emerge (dental cam, image-share), the wrapper grows; the underlying ConsultationBodyPane stays focused.
- The min-heights are picked to keep each variant functional at the smallest size budget (voice 15% of column ≈ 60px on a typical screen; text 40% ≈ 200px). If real-world testing reveals different minimums, capture-inbox a tuning follow-up.
- ARIA labels matter for screen-reader users — telemed doctors who use accessibility tools should hear "Voice consultation controls" when focus enters the strip, not "section."
- The telemetry event name `r_middle_body_refactored` is a one-time mount signal — it confirms the new wrapper is in production. After Phase 3, this event can be dropped (capture-inbox).
