# crb-03 · Mount `<PatientRibbon>` in `PatientProfilePage`

> **Wave 3** of the [cockpit-ribbon batch](../plan-cockpit-ribbon-batch.md). Render the ribbon in production between the existing header and the shell, INSIDE the lifted `<RxFormProvider>` from csf-01.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | XS (~10 LOC delta in one existing file) |
| **Model** | **Composer 2 Fast** — small, mechanical edit on a known file; same pattern as csf-04 / cce-04 |
| **Wave** | 3 |
| **Depends on** | crb-02 (ribbon component); **csf-04 merged** (production cutover; otherwise the merge conflict on `PatientProfilePage.tsx` is large) |
| **Blocks** | crb-04 (verification + close-out) |

---

## ⚠️ Cross-batch dependency

This task is **gated on the [`cockpit-shell-flip`](../../../19-05-2026/cockpit-shell-flip/) batch's csf-04 merge**.

Both this task and csf-04 modify `PatientProfilePage.tsx`. csf-04 replaces `builtInPanes` with `useTelemedVideoTemplate(ctx)`; crb-03 adds one new line above `<PatientProfileShell>`. If you run them in the wrong order, the merge conflict is non-trivial.

**Practical scheduling:** Wait for csf-04 to land on `main`. Rebase the cockpit-ribbon branch on the latest `main`. Then run this task.

---

## Goal

In `frontend/app/dashboard/appointments/[id]/page.tsx` (or wherever `PatientProfilePage` lives — task verifies the path), render `<PatientRibbon appointment={appointment} token={token} />` between `<PatientProfileHeader>` and `<PatientProfileShell>`, INSIDE the lifted `<RxFormProvider>` from csf-01 so the ribbon can subscribe to form state.

The conditional structure:
- **Walk-in** (`!showChart` / `appointment.patient_id == null`) → DON'T render the ribbon (per DL-6).
- **Mobile** (`<lg`) → DON'T render the ribbon (per DL-7).
- **Otherwise** (desktop telemed with known patient) → render the ribbon.

---

## What to do

### 1. Locate `PatientProfilePage.tsx` (post-csf-04)

After csf-04 lands, the page should look something like:

```tsx
export default function PatientProfilePage(props: ...) {
  const { appointment, token, /* ... */ } = props;
  const showChart = appointment.patient_id != null;
  const ctx: TelemedVideoContext = { /* ... */ };
  const panes = useTelemedVideoTemplate(ctx);

  if (!showChart) {
    return (
      // walk-in 2-pane fallback
      <RxFormProvider>
        <PatientProfileHeader appointment={appointment} />
        <WalkinTwoPaneLayout /* ... */ />
      </RxFormProvider>
    );
  }

  return (
    <RxFormProvider>
      <PatientProfileHeader appointment={appointment} />
      <PatientProfileShell panes={panes} appointment={appointment} token={token} />
    </RxFormProvider>
  );
}
```

(The exact JSX may differ; the task verifies against the current file before editing.)

### 2. Insert `<PatientRibbon>` in the desktop telemed branch

Between `<PatientProfileHeader>` and `<PatientProfileShell>`, add a `<MediaQuery>` or `useIsLargeViewport`-gated mount:

```tsx
<RxFormProvider>
  <PatientProfileHeader appointment={appointment} />
  <DesktopOnly>
    <PatientRibbon appointment={appointment} token={token} />
  </DesktopOnly>
  <PatientProfileShell panes={panes} appointment={appointment} token={token} />
</RxFormProvider>
```

Where `<DesktopOnly>` is a one-liner Tailwind wrapper:
```tsx
<div className="hidden lg:block">{children}</div>
```

OR a `useMediaQuery('(min-width: 1024px)')` JS gate if the codebase already has that hook. Pick whichever matches the existing `MobilePillBar` mounting pattern. Do not introduce a new media-query primitive.

### 3. Walk-in branch UNCHANGED

The walk-in branch (`!showChart`) does NOT render the ribbon. Don't add the ribbon there. The 2-pane horizontal fallback layout is unchanged.

### 4. Verify the cv2-08 single-provider invariant

After the edit, React DevTools should show **exactly one `<RxFormProvider>`** in the tree. The ribbon, the shell, and (transitively) the `<AssessmentSection>` inside the Plan pane all consume the same provider.

If a duplicate provider appears (e.g., `<PrescriptionForm>`'s self-mount fallback fires when it shouldn't), debug — csf-01's contract is that `PrescriptionForm` only self-mounts a provider if it's NOT already nested inside one. Check `csf-01`'s implementation if the invariant is broken.

### 5. Smoke at `/dashboard/appointments/[id]`

Open a known telemed-video appointment with a known patient. Verify:
- Ribbon visible between header and pane grid.
- Ribbon strip matches the 52px height of crb-02's component.
- Skeleton state visible briefly during initial load (open DevTools Network tab → throttle to "Slow 3G" to see the skeleton state).
- Loaded state renders all 5 slots correctly.
- Type in the Plan pane's Dx input → `🎯 Treating` slot updates live.
- Click `🎯` slot → focus jumps to the Dx input (or scrolls if offscreen).

Then verify the negative paths:
- Open a walk-in appointment (`patient_id == null`) → ribbon does NOT render. 2-pane horizontal layout unchanged.
- DevTools viewport `<lg` (e.g., iPhone 12 Pro) → ribbon does NOT render. MobilePillBar flow unchanged.
- Add `?v1=1` to the URL → kill-switch fallback renders the legacy 3-pane layout WITHOUT the ribbon.

---

## Files touched

- **Modified:** `frontend/app/dashboard/appointments/[id]/page.tsx` (or wherever `PatientProfilePage` lives — task discovers and modifies). ~10 LOC delta.
  - Add import: `import { PatientRibbon } from '@/components/patient-profile/PatientRibbon';`
  - Insert one `<DesktopOnly><PatientRibbon ... /></DesktopOnly>` block between `<PatientProfileHeader>` and `<PatientProfileShell>`.
  - (Maybe add a small inline `function DesktopOnly` or import a media-query helper.)

That's it. No other files.

---

## Acceptance gate

- [ ] `pnpm --filter frontend tsc --noEmit` clean. `pnpm --filter frontend lint` clean. `pnpm --filter frontend build` clean.
- [ ] `/dashboard/appointments/[id]` for a known-patient telemed-video appointment renders the ribbon strip between `<PatientProfileHeader>` and `<PatientProfileShell>`.
- [ ] React DevTools confirms exactly one `<RxFormProvider>` in the tree.
- [ ] Live Dx mirror works: type in Plan pane Dx input → ribbon's `🎯 Treating` updates within 200ms.
- [ ] Click `🎯` segment → focus jumps to `id="diagnosis"`.
- [ ] Walk-in (`patient_id == null`) → ribbon does NOT render. 2-pane horizontal layout unchanged.
- [ ] Mobile (`<lg`) → ribbon does NOT render. MobilePillBar flow unchanged.
- [ ] Kill-switch (`?v1=1`) → legacy 3-pane layout renders without the ribbon. No console errors.
- [ ] No new console errors. No new Sentry errors in 5-min smoke session opening 3 different appointments + typing in the Dx field.

---

## Anti-goals

- ❌ Don't introduce a second `<RxFormProvider>`. The ribbon subscribes to csf-01's lifted provider.
- ❌ Don't refactor `<PatientProfileHeader>` (DL-2 defers).
- ❌ Don't add the ribbon to the walk-in branch.
- ❌ Don't add the ribbon to the mobile branch.
- ❌ Don't introduce a new media-query primitive — match the existing pattern (Tailwind `hidden lg:block` or `useMediaQuery`).
- ❌ Don't fire any telemetry from this task — that's crb-04's job.

---

## Notes

- This is the smallest of the four tasks. ~10 LOC delta. Composer 2 Fast can handle it in 1-2 turns.
- If post-csf-04 merge there's an unexpected layout artifact (e.g., the ribbon adds 52px of height that pushes the shell below the viewport fold), don't fix it here — capture in `docs/Work/capture/inbox.md` and let crb-04 / a follow-up batch handle the layout polish. This task is purely the mount.
- Reminder: csf-01's `<RxFormProvider>` lift wraps the shell; after this task, it ALSO wraps the ribbon. Both are siblings under the same provider.
