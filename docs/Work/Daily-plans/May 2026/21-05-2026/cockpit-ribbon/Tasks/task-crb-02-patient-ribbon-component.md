# crb-02 · PatientRibbon component

> **Wave 2** of the [cockpit-ribbon batch](../plan-cockpit-ribbon-batch.md). Build the ribbon UI component; smoke at a dev fixture page (NOT yet in production).

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | M (one new file, ~200-280 LOC) |
| **Model** | **Auto** — presentational component with overflow detection + skeleton; per-message escalation to Opus only if Auto stalls on overflow chip detection or CLS guarantee |
| **Wave** | 2 |
| **Depends on** | crb-01 (data hook); cv2-05 (`RxFormContext`, already shipped); cv2-06 (`<AssessmentSection>` with `id="diagnosis"`, already shipped); csf-01 ideally merged so `<RxFormProvider>` is available at the parent level — but **not strictly required for this task's smoke fixture** (the fixture can wrap its own provider locally) |
| **Blocks** | crb-03 (production mount) |

---

## Goal

Build `<PatientRibbon>` — a 52px-tall full-width strip that displays:

1. **Identity slot** — `42 y · M · 68 kg` (age · sex · weight). NO name (DL-1 — name lives in the existing header above).
2. **Allergies slot** — chips, max 3 visible + `+N more` overflow pill.
3. **Chronic conditions slot** — chips, max 3 visible + `+N more` overflow pill.
4. **Active meds count slot** — `💊 4 active` badge (or `💊 0` dimmed if zero).
5. **🎯 Treating Dx slot** — `🎯 Treating: URI with productive cough` mirror of the Plan pane's Dx field. Empty value renders dimmed `🎯 Treating: —`.

Layout: horizontal flex, slots left-to-right with consistent spacing. Slot 5 (🎯 Treating) is right-aligned to balance the strip; slots 1-4 are left-aligned.

Behaviour:
- **Skeleton state** during load (52px tall placeholders for each slot, identical container height to loaded state — CLS = 0).
- **Click chip** → tooltip popover with full chip detail (allergy reaction + severity, chronic since-date, etc.).
- **Click `+N more` pill** → popover listing all overflow chips for that slot.
- **Click `🎯` segment** → focus + scroll-into-view the `id="diagnosis"` Dx input (DL-4).
- **Live Dx mirror** via `useRxForm()` (DL-5) — updates within one React commit cycle.
- **Walk-in fallback** (`appointment.patient_id == null`) → component returns `null`.

---

## What to do

### 1. Create the file

`frontend/components/patient-profile/PatientRibbon.tsx`

Sibling to `PatientProfileHeader.tsx`. Top of file:

```tsx
"use client";

/**
 * PatientRibbon (cockpit-ribbon batch · crb-02)
 *
 * 52px full-width strip rendered between <PatientProfileHeader> and
 * <PatientProfileShell> inside <PatientProfilePage>. Surfaces always-visible
 * patient context across all panes:
 *
 *   ┌────────────────────────────────────────────────────────────────────────┐
 *   │ 42 y · M · 68 kg │ ⚠️ Penicillin · Sulfa · +2 │ 🩺 HTN · DM · COPD │ 💊 4 │ 🎯 URI │
 *   └────────────────────────────────────────────────────────────────────────┘
 *
 * Subscribes to <RxFormProvider> (lifted by csf-01) for the Dx live-mirror via
 * useRxForm(). The 🎯 click handler focuses #diagnosis (the Dx input id from
 * cv2-06's <AssessmentSection>).
 *
 * Walk-in (appointment.patient_id == null) → component returns null.
 * Mobile (<lg) → handled by parent (<PatientProfilePage> doesn't mount us).
 */
```

### 2. Component signature

```tsx
export interface PatientRibbonProps {
  appointment: AppointmentDetailResponse; // existing type
  token: string;
}

export function PatientRibbon({ appointment, token }: PatientRibbonProps) {
  // walk-in fallback per DL-6
  if (!appointment.patient_id) {
    return null;
  }

  const data = usePatientRibbonData(appointment.patient_id, token);
  const { state } = useRxForm();
  const dxValue = state.fields.provisionalDiagnosis;

  // ... render
}
```

### 3. Slot rendering

Use a horizontal flex container with fixed 52px height and consistent gap:

```tsx
<div
  role="region"
  aria-label="Patient context ribbon"
  className="flex h-[52px] w-full items-center gap-4 border-b bg-card px-4"
>
  <IdentitySlot identity={data.identity} isLoading={data.isLoading} />
  <Separator orientation="vertical" />
  <AllergiesSlot chips={data.allergies} isLoading={data.isLoading} />
  <Separator orientation="vertical" />
  <ChronicSlot chips={data.chronicConditions} isLoading={data.isLoading} />
  <Separator orientation="vertical" />
  <ActiveMedsSlot count={data.activeMedsCount} isLoading={data.isLoading} />
  <div className="flex-1" /> {/* spacer pushes 🎯 to the right */}
  <TreatingSlot dxValue={dxValue} />
</div>
```

Each slot is a sub-component within the same file (or extract to `frontend/components/patient-profile/ribbon/` if it gets large — task's call).

### 4. Slot specifics

**IdentitySlot:**
- Render `42 y · M · 68 kg`. Skip individual fields if null (e.g., `42 y · M` if weight unknown).
- Skeleton: a single 100px-wide 16px-tall skeleton bar.

**AllergiesSlot + ChronicSlot:**
- Render up to 3 chips. Each chip is a small badge with a colored background (allergies: amber/red severity-tinted; chronic: blue).
- If `chips.length > 3`, show 3 chips + `+N more` pill where `N = chips.length - 3`.
- **Click on a chip** → open a tooltip popover (use existing `Tooltip` from `frontend/components/ui/tooltip.tsx`) with the full detail.
- **Click on the `+N more` pill** → open a `Popover` (use existing `frontend/components/ui/popover.tsx` if present; if not, fall back to a `DropdownMenu`) listing all chips with their full details.
- Empty data → render dimmed `No known allergies` / `No chronic conditions` inline label (DL-8 — no collapsed empty space).
- Skeleton: 3 chip-sized skeleton placeholders.

**ActiveMedsSlot:**
- Render `💊 {count}`. If `count === 0`, dim it (`text-muted-foreground`).
- Tooltip on hover: "X active medications on the most recent prescription."
- Skeleton: a 50px skeleton badge.

**TreatingSlot:**
- Render `🎯 Treating: {dxValue || '—'}`. Truncate dxValue with ellipsis at ~40 chars (full value visible on hover via tooltip).
- Make the entire slot clickable as a button (`role="button"`, keyboard-accessible via `<button>` or `<div tabIndex={0}>`).
- On click:
  ```tsx
  const dxInput = document.getElementById('diagnosis');
  if (dxInput instanceof HTMLInputElement) {
    dxInput.focus();
    dxInput.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  ```
- Empty Dx (`dxValue === ''`) → render dimmed `🎯 Treating: —`. Click still works; just focuses the empty input.
- Tooltip on hover: "Click to edit the diagnosis in the Plan pane."

### 5. Live Dx mirror — verify the 200ms acceptance bound

The mirror is automatic via React's commit cycle. To verify the 200ms ceiling, the task adds a one-time `performance.mark` measurement in dev builds:

```tsx
useEffect(() => {
  if (process.env.NODE_ENV === 'development') {
    performance.mark(`ribbon-dx-mirror-${Date.now()}`);
  }
}, [dxValue]);
```

Then in DevTools Performance tab, type a character in the Dx input and confirm the ribbon's mirror update lands < 50ms (well below the 200ms ceiling).

### 6. Smoke fixture (dev-only, NOT committed)

Build a temporary fixture page at `frontend/app/dashboard/_dev/ribbon-fixture/page.tsx`:

```tsx
"use client";
import { RxFormProvider } from '@/components/cockpit/rx/RxFormContext';
import { PatientRibbon } from '@/components/patient-profile/PatientRibbon';

export default function RibbonFixturePage() {
  const fakeAppointment = { patient_id: 'KNOWN_PATIENT_UUID', /* ... */ } as any;
  return (
    <RxFormProvider initialFields={{ provisionalDiagnosis: '' }}>
      <PatientRibbon appointment={fakeAppointment} token="DEV_TOKEN" />
      <RxFormDxInputForFixture />
    </RxFormProvider>
  );
}
```

Verify all behaviors (skeleton → loaded transition, overflow chips, click 🎯, tooltip, walk-in null fallback). **Do NOT commit this file.**

---

## Files touched

- **New:** `frontend/components/patient-profile/PatientRibbon.tsx` (~220 LOC).
- **(Dev fixture, not committed):** `frontend/app/dashboard/_dev/ribbon-fixture/page.tsx`.

---

## Acceptance gate

- [ ] `<PatientRibbon>` exports from the new file. `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean for the new file.
- [ ] All five slots render. Identity slot shows `age · sex · weight` with null handling.
- [ ] Skeleton state during load. Container height fixed at 52px in both states. CLS = 0 measured in DevTools Performance tab.
- [ ] Allergies slot: max 3 chips visible. 5+ allergies → 3 chips + `+2 more` pill that opens a popover with all 5.
- [ ] Chronic slot: same overflow handling as allergies.
- [ ] Active meds count slot: `💊 4` for 4 active meds; `💊 0` dimmed for zero.
- [ ] 🎯 Treating slot: live-mirrors `state.fields.provisionalDiagnosis` from `useRxForm()`. Empty Dx → dimmed `🎯 Treating: —`.
- [ ] Click 🎯 slot → focus + scroll-into-view `id="diagnosis"` (verify by adding the AssessmentSection to the fixture).
- [ ] Click chip → tooltip popover with full detail.
- [ ] Walk-in (`appointment.patient_id == null`) → component returns `null`. Smoke at fixture by passing a fake walk-in appointment.
- [ ] No keyboard accessibility regressions: 🎯 slot is keyboard-focusable; Enter triggers the focus action.
- [ ] No new packages installed. Reuses existing `Tooltip`, `Popover` (or `DropdownMenu` fallback), `Badge`, `Separator` from `frontend/components/ui/`.
- [ ] Dev fixture page is NOT committed.

---

## Anti-goals

- ❌ Don't fetch any data inside `<PatientRibbon>`. All fetches happen in `usePatientRibbonData`.
- ❌ Don't introduce a second `<RxFormProvider>` — the ribbon SUBSCRIBES to the existing one (csf-01's lift).
- ❌ Don't add edit affordances. Source plan locks the ribbon as read-only.
- ❌ Don't add new ribbon slots beyond the 5 spec'd ones.
- ❌ Don't refactor `<PatientProfileHeader>` (DL-2 defers that to Phase 3).
- ❌ Don't make this responsive for mobile — DL-7 hides the ribbon on `<lg` viewports; the parent (`<PatientProfilePage>` in crb-03) handles the conditional mount.

---

## Notes

- The 5-slot layout is locked left-to-right per source plan. Do NOT reorder.
- The 52px height matches the source plan's "48-56px" range. Pick the mid-value for the headroom for icons + chip spacing.
- If the `Popover` primitive doesn't exist in `frontend/components/ui/`, fall back to `DropdownMenu` (used elsewhere in the cockpit) and capture-inbox a follow-up: "Add Popover primitive to ui/."
- Live mirror is automatic via React; no `useEffect` polling, no `requestAnimationFrame`, no debouncing. Trust React's commit cycle.
- Click-to-focus uses `document.getElementById` instead of a ref because the Dx input lives in a sibling subtree (`<PatientProfileShell>` body pane). Cross-subtree imperative focus via DOM ID is the simplest pattern; future R-MIDDLE batch may move the Dx input but the ID stays.
