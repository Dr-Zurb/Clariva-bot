# cmr-05 · Narrow-monitor auto-merge — Investigations into Plan chip-row

> **Status:** ✅ Done (2026-05-23)
>
> **Wave 1 lane β (second task)** of the [cockpit-middle-rebuild batch](../plan-cockpit-middle-rebuild-batch.md). Add a CSS container query at the bottom-row level that auto-merges Investigations into a chip-row at the top of Plan when bottom-row width drops below ~720px.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | S (one wrapper component or inline merge logic ~100-160 LOC; possible polyfill dependency) |
| **Model** | **Auto** — container-query setup + conditional render |
| **Wave** | 1 (lane β) |
| **Depends on** | cmi-01 (`<InvestigationsChipRow>` extracted); cmr-04 (BodyZone wrapper sets container context) |
| **Blocks** | cmr-06 (wires into templates) |

---

## Goal

When the bottom-row's container width drops below 720px (typical 1366px viewport with a slim left/right column), the bottom-row's PanelGroup auto-collapses Investigations into a chip-row pinned at the top of Plan. Source plan §"Narrow monitor (≤ 1366px container)" + DL-20 + V2-Q9.

The auto-merge is **container-query-driven**, not viewport-query-driven — the trigger is the bottom-row's actual rendered width, not the browser window. This is per source plan V2-Q9 ("container query, not viewport query").

---

## What to do

### 1. Verify container-query support

Run `Glob` on `package.json` and check for `@container-query-polyfill`. If absent, decide:

- **Option A: Ship without polyfill.** All target browsers (Chrome 105+, Safari 16+, Firefox 110+) support `@container` queries natively. Doctors on older browsers degrade gracefully — they see the un-merged bottom-row even on narrow monitors. Capture-inbox a follow-up if/when an older-browser report surfaces.
- **Option B: Ship the polyfill.** ~3KB gzipped (per V2-Q9 lean). One-time setup cost; broader browser support.

Pick Option B per V2-Q9's lean (polyfill). Run:

```sh
pnpm --filter frontend add @container-query-polyfill
```

If the project doesn't already wire polyfills at root, add a one-line import in `frontend/app/layout.tsx`:

```tsx
import '@container-query-polyfill/dist/index.js';
```

Polyfill is no-op in browsers that natively support container queries.

### 2. Mark the bottom-row as a query container

In `frontend/lib/patient-profile/templates.tsx` (cmr-06 owns this edit), the bottom-row's wrapping div gets a `container-type: inline-size` style. cmr-05 just owns the styling that USES the container query; cmr-06 sets up the container.

Add the CSS-in-JS or Tailwind classes:

```tsx
<div
  className="@container/middle-bottom flex h-full flex-col"
  style={{ containerType: 'inline-size', containerName: 'middle-bottom' }}
>
  {/* bottom-row content */}
</div>
```

If the project uses Tailwind container queries (via `@tailwindcss/container-queries` plugin), use the Tailwind syntax: `@container/middle-bottom`. Else use raw CSS via a `style` prop or a generated class.

### 3. Build the auto-merge component

`frontend/components/cockpit/middle/InvestigationsAutoMerge.tsx`:

```tsx
"use client";

/**
 * InvestigationsAutoMerge — container-query-driven merge of the
 * Investigations leaf into the top of Plan when the bottom-row container
 * width is below ~720px. Source plan §"Narrow monitor (≤ 1366px container)"
 * + DL-20 + V2-Q9 lean (use container queries, not viewport queries).
 *
 * Renders two states:
 *   1. Wide (>= 720px): empty render — the Investigations leaf renders
 *      separately in the bottom-row PanelGroup (templates.tsx).
 *   2. Narrow (< 720px): renders <InvestigationsChipRow> inline at top
 *      of Plan; templates.tsx separately HIDES the Investigations leaf
 *      via a visibility class also triggered by the container query.
 *
 * The HIDE side is in templates.tsx; the INLINE side is here.
 *
 * @see frontend/components/cockpit/rx/inputs/InvestigationsChipRow.tsx
 * @see frontend/lib/patient-profile/templates.tsx (cmr-06)
 */

import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { InvestigationsChipRow } from "@/components/cockpit/rx/inputs/InvestigationsChipRow";
import { canEditPrescriptionDraft, type CockpitState } from "@/lib/patient-profile/state";
import { useEffect } from "react";
import { trackCockpitV2RMiddleNarrowMergeLanded } from "@/lib/patient-profile/telemetry";

export interface InvestigationsAutoMergeProps {
  state: CockpitState;
}

export function InvestigationsAutoMerge({ state }: InvestigationsAutoMergeProps) {
  const { state: rxFormState, setField } = useRxForm();
  const value = rxFormState.fields.investigationsOrders;
  const isEditable = canEditPrescriptionDraft(state);

  useEffect(() => {
    trackCockpitV2RMiddleNarrowMergeLanded({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // one-shot per session

  return (
    // The @container syntax: only render visibly when the named container
    // (middle-bottom) has width below 720px. Outside that range, this div
    // is `display: none` and the bottom-row's Investigations leaf renders
    // instead. Toggled purely by CSS — no JS resize listener.
    <div className="hidden @[720px]/middle-bottom:block">
      <InvestigationsChipRow
        value={value}
        onChange={(next) => setField("investigationsOrders", next)}
        disabled={!isEditable}
      />
    </div>
  );
}
```

Wait — that's inverted. Let me re-think.

- Wide (>= 720px) → leaf renders separately; merge component HIDDEN.
- Narrow (< 720px) → leaf hidden by templates.tsx; merge component VISIBLE.

Tailwind's `@[720px]:` modifier matches "width is at least 720px." So:
- `hidden @[720px]/middle-bottom:hidden` is wrong (always hidden).
- `block @[720px]/middle-bottom:hidden` = visible by default (narrow), hide when ≥720px (wide). That's what we want.

So:

```tsx
<div className="block @[720px]/middle-bottom:hidden">
  <InvestigationsChipRow ... />
</div>
```

For the OTHER side (the Investigations leaf needs to be HIDDEN when narrow), cmr-06's templates.tsx wraps the Investigations leaf with:

```tsx
<div className="hidden @[720px]/middle-bottom:block">
  {/* Investigations leaf content */}
</div>
```

So both halves use container queries to toggle visibility based on the same threshold. CSS-only, no JS resize listener. The PanelGroup itself doesn't care — when the leaf's content is hidden via `display: none`, the panel's content just looks empty (which is fine because the merge component renders the chip-row inline at top of Plan, taking up the visual real estate that the leaf "would have").

For a cleaner result, cmr-06 may also collapse the panel itself via `naturalSizePct: 0` when narrow — but that's a JS-side decision. Simpler: just hide the leaf content and let the panel sit empty (or collapse via min-size enforcement). The shell's existing min-size guarantees may need a tweak (capture-inbox if so).

### 4. Smoke at dev fixture (NOT committed)

Build a fixture with a resizable container that wraps the merge component AND a sibling Investigations leaf simulator:

```tsx
<RxFormProvider initialFields={{ investigationsOrders: '' }}>
  <div
    style={{ width: '900px', containerType: 'inline-size', containerName: 'middle-bottom' }}
    className="@container/middle-bottom resize-x overflow-auto border"
  >
    <InvestigationsAutoMerge state="live" />
    <div className="hidden @[720px]/middle-bottom:block">
      [Investigations leaf would render here when wide]
    </div>
  </div>
</RxFormProvider>
```

Drag the corner to resize. Verify:
- At 900px: merge component hidden; leaf simulator visible.
- At 600px: merge component visible; leaf simulator hidden.
- Resize smoothly back and forth.

### 5. Tailwind config update (if needed)

If the project's `tailwind.config.ts` doesn't have the container-queries plugin enabled, add it:

```ts
import containerQueries from '@tailwindcss/container-queries';

export default {
  // ...
  plugins: [containerQueries, /* … existing plugins */],
};
```

Capture-inbox if Tailwind config changes are sensitive in this codebase.

---

## Files touched

- **New:** `frontend/components/cockpit/middle/InvestigationsAutoMerge.tsx` (~100-160 LOC).
- **New:** `frontend/components/cockpit/middle/__tests__/InvestigationsAutoMerge.test.tsx` (~50 LOC).
- **Modified (possibly):** `frontend/tailwind.config.ts` — add `@tailwindcss/container-queries` plugin.
- **Modified (possibly):** `frontend/app/layout.tsx` — import the polyfill.
- **Modified:** `frontend/package.json` — add `@container-query-polyfill` + (optionally) `@tailwindcss/container-queries` deps.
- **(Dev fixture, not committed):** `frontend/app/dashboard/_dev/narrow-merge-fixture/page.tsx`.

---

## Acceptance gate

- [x] `InvestigationsAutoMerge` exports from new file.
- [x] Container query engages: at < 720px container width, merge component visible; >= 720px, hidden.
- [x] Telemetry event `cockpit_v2.r_middle_narrow_merge_landed` fires on first mount.
- [x] Polyfill loaded (if Option B picked); verified by Network tab.
- [x] Tailwind config has container-queries plugin OR raw `@container` CSS works in production build.
- [x] Unit test passes (mocking container width is tricky — test the render structure; rely on dev-fixture for visual verification).
- [x] Dev fixture verified locally; deleted before commit.
- [x] `pnpm --filter frontend tsc --noEmit` + `lint` + `build` clean. Verify the polyfill doesn't break the build. *(lint + unit tests green; build compiles cmr-05 artifacts — pre-existing `VoiceConsultRoom.tsx:1299` type error blocks full build.)*
- [x] Bundle size impact captured in commit message (`container-query-polyfill` ~9KB compressed, loaded conditionally).

---

## Anti-goals

- ❌ Don't use a viewport query (`@media`). The bottom-row's width depends on the left/right columns and the user's saved layout — viewport queries miss those signals. Container queries are the right tool.
- ❌ Don't add a JS resize listener. CSS handles the trigger.
- ❌ Don't introduce a different chip-row component — reuse `<InvestigationsChipRow>` from cmi-01.
- ❌ Don't make the threshold (720px) configurable per-doctor — DL-20 locks it. Future polish can revisit.
- ❌ Don't double-mount the chip-row. The Investigations leaf hides when narrow; the auto-merge shows. Never both.

---

## Notes

- 720px is the bottom-row container width threshold, NOT the viewport. On a 1920px monitor with the default 22/56/22 column split, the bottom-row is ~1075px → wide. On a 1366px monitor with the same split, bottom-row is ~765px → still wide. The doctor would need to either:
  - Drag the left/right columns wider, pushing the middle column narrower; OR
  - Be on a small laptop screen (1280×800 with default split: bottom-row ~717px → triggers merge).
- The threshold is sensitive — empirically, 720px is the smallest at which Investigations + Plan side-by-side feels usable. Below that, the chip-row paradigm is better.
- If the polyfill conflicts with another Tailwind plugin or Next.js feature, fall back to Option A (no polyfill) and capture-inbox.
- The Tailwind `@[720px]/middle-bottom:` syntax assumes the container-queries plugin is installed. If it's not, the raw CSS approach works equally well: a `<style>` block with `@container middle-bottom (width < 720px) { .auto-merge { display: block; } }`.
