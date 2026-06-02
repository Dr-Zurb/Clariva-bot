# Task ppr-01: New route, empty page shell, ESLint zone

## 13 May 2026 — Batch [Patient profile shell rebuild](../plan-patient-profile-shell-rebuild-batch.md) — Wave 1, Lane α step 0 — **XS, ~45min**

---

## Task overview

Stand up the **new route, scaffolding, and architectural guardrail** for the v2 shell. This task does NOT render any panes — it just makes `/dashboard/appointments/[id]/v2` resolve to an empty `<PatientProfilePage>` and locks the DL-2 constraint ("shell knows zero medical concepts") as an ESLint rule from commit one.

This is the keystone of the Strangler Fig migration. Every later task adds something to this skeleton; nothing exists yet, but the SHAPE is correct.

**Estimated time:** ~45min (10 min route, 15 min scaffold, 15 min ESLint zone, 5 min smoke).

**Status:** Pending.

**Hard deps:** none.

**Source:** [plan-patient-profile-shell-rebuild-batch.md § Wave 1](../plan-patient-profile-shell-rebuild-batch.md) + `R1.1`, `R1.2`, `R1.6` in [Product plans/plan-patient-profile-shell-rebuild.md](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh small chat. Pre-load:
- This task file.
- `frontend/app/dashboard/appointments/[id]/page.tsx` (the server component pattern we mirror — auth + fetch + error states).
- `frontend/.eslintrc.json` (the existing ESLint config — we extend it).

**Estimated turns:** 2–3 turns.

---

## Acceptance criteria

### New folder layout

```
frontend/
├── app/dashboard/appointments/[id]/
│   ├── page.tsx                ← unchanged (still renders <ConsultationCockpit>)
│   └── v2/
│       └── page.tsx            ← NEW: server component, mirrors page.tsx but mounts <PatientProfilePage>
└── components/patient-profile/
    └── PatientProfilePage.tsx  ← NEW: thin client island; renders a placeholder for now
```

### `frontend/app/dashboard/appointments/[id]/v2/page.tsx`

- [ ] Create the file. Server component. Mirror the auth + fetch + error states of `[id]/page.tsx` exactly — same `createClient`, same `getAppointmentById`, same redirect-on-401, same 404 / 403 error blocks.
- [ ] The only difference: render `<PatientProfilePage appointment={appointment} token={token} />` instead of `<ConsultationCockpit>`.
- [ ] JSDoc at the top:

  ```tsx
  /**
   * v2 patient profile page (Strangler Fig migration — `plan-patient-profile-shell-rebuild`).
   *
   * Side-by-side with the existing `[id]/page.tsx` for the duration of the
   * rebuild. Once parity QA (ppr-11) passes, ppr-12 makes this the canonical
   * route by editing `[id]/page.tsx` directly and deleting this file. Until
   * then, `/dashboard/appointments/[id]/v2` is the dev-only entrypoint for
   * the new shell.
   */
  ```

### `frontend/components/patient-profile/PatientProfilePage.tsx`

- [ ] Create the file. Client component (`"use client"`).
- [ ] Props: `{ appointment: Appointment; token: string }` — same shape as `<ConsultationCockpit>`. Import `Appointment` from `@/types/appointment`. **This is the ONLY file in the new shell allowed to import medical types** (DL-2).
- [ ] For ppr-01, render a placeholder:

  ```tsx
  "use client";

  import type { Appointment } from "@/types/appointment";

  interface PatientProfilePageProps {
    appointment: Appointment;
    token: string;
  }

  /**
   * Top-level client island for the v2 patient profile page.
   *
   * Owns: the cockpit state machine (`deriveCockpitState`) + the construction
   * of the `panes: PaneDefinition[]` array. Wave 1 (ppr-03) gives this file a
   * real `<PatientProfileShell>` to mount; Wave 2 (ppr-07) plugs in real
   * pane content.
   *
   * This is the ONLY file in the new shell allowed to import from
   * `@/components/consultation/**`, `@/components/ehr/**`,
   * `@/lib/consultation/**`, or `@/types/appointment` (DL-2; enforced by the
   * ESLint `no-restricted-paths` zone in `frontend/.eslintrc.json`).
   */
  export default function PatientProfilePage({
    appointment,
    token,
  }: PatientProfilePageProps) {
    // Placeholder — Wave 1.2 (ppr-03) replaces this with <PatientProfileShell />.
    void appointment;
    void token;
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        <p className="text-sm">
          Patient profile shell (v2) — placeholder. Wave 1 ppr-03 will mount the
          real shell here.
        </p>
      </div>
    );
  }
  ```

### `frontend/.eslintrc.json` — `no-restricted-paths` zone (DL-2)

- [ ] Update `frontend/.eslintrc.json` to add the zone:

  ```json
  {
    "extends": "next/core-web-vitals",
    "rules": {
      "no-restricted-imports": "off"
    },
    "overrides": [
      {
        "files": [
          "components/patient-profile/Shell.tsx",
          "components/patient-profile/panes/**",
          "lib/patient-profile/**"
        ],
        "rules": {
          "no-restricted-imports": [
            "error",
            {
              "patterns": [
                {
                  "group": [
                    "@/components/consultation/*",
                    "@/components/ehr/*",
                    "@/lib/consultation/*",
                    "@/types/appointment"
                  ],
                  "message": "DL-2: the patient-profile shell, its panes folder, and its lib folder must not import medical concepts. Only `frontend/components/patient-profile/PatientProfilePage.tsx` may bridge the shell to the medical surface (see plan-patient-profile-shell-rebuild-batch.md)."
                }
              ]
            }
          ]
        }
      }
    ]
  }
  ```

  - **Why these paths?** `Shell.tsx` (ppr-03) is the layout primitive — it must be content-agnostic. `panes/**` (ppr-04..06) wrap medical components but import their content from `<PatientProfilePage>` via props, not directly. `lib/patient-profile/**` (ppr-08) is the layout state module.
  - **Why is `PatientProfilePage.tsx` NOT in the zone?** It's the bridge. It explicitly knows medical concepts to construct the panes array. DL-2 stops the rest of the folder from following suit.

- [ ] Manually verify the zone by adding a temporary `import { Appointment } from "@/types/appointment";` to a placeholder `Shell.tsx` (or panes file if it exists yet) and confirming `pnpm --filter frontend lint` errors with the DL-2 message. Revert the test import.

### Manual smoke

- [ ] Start the dev server: `pnpm --filter frontend dev`.
- [ ] Navigate to `/dashboard/appointments/[some-real-appointment-id]/v2` while logged in.
- [ ] Page renders the placeholder text. No console errors.
- [ ] Navigate to `/dashboard/appointments/[some-real-appointment-id]` (without `/v2`). Old shell still renders identically — ppr-01 must not regress v1.

### Tests / verification

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean (no errors from the new ESLint zone against ppr-01's tree — the placeholder Shell.tsx doesn't exist yet, so the zone has nothing to flag).

---

## Out of scope

- **The actual `<PatientProfileShell>` layout** — that's ppr-03.
- **`PaneDefinition` type and `useShellLayout` hook** — ppr-02.
- **Any pane content** — Wave 2.
- **localStorage state, presets, hotkeys** — Wave 3.
- **Editing `[id]/page.tsx`** — that's ppr-12 (default-flip).

---

## Files expected to touch

**New:**
- `frontend/app/dashboard/appointments/[id]/v2/page.tsx` (~80 LOC; near-clone of `[id]/page.tsx`).
- `frontend/components/patient-profile/PatientProfilePage.tsx` (~40 LOC placeholder).

**Modified:**
- `frontend/.eslintrc.json` (~25 LOC delta — adds the `overrides` block).

**Tests:** none in ppr-01 (the placeholder has no logic to test).

---

## Notes / open decisions

1. **Why a real route (`/v2/page.tsx`) instead of a `?v2=1` query flag?** A real route means Next.js statically analyses the new tree independently. A flag would conditional-render two trees from the same file, reintroducing exactly the coupling this rebuild is here to remove. The route gets deleted in ppr-12 when v2 becomes the default.
2. **Why an `overrides` block instead of project-wide `no-restricted-imports`?** The restriction only applies to the new patient-profile folder. The existing `consultation/**` tree must keep importing whatever it imports today, or we'd break the still-shipping `<ConsultationCockpit>`.
3. **Why include `Shell.tsx` in the zone before it exists?** ESLint zones are forward-looking — adding the rule now means ppr-03 cannot accidentally import a medical concept on its first commit. Self-enforcing.

---

## References

- **Affected files:**
  - `frontend/app/dashboard/appointments/[id]/page.tsx` (pattern source for the server component)
  - `frontend/.eslintrc.json`
  - new `frontend/app/dashboard/appointments/[id]/v2/page.tsx`
  - new `frontend/components/patient-profile/PatientProfilePage.tsx`
- **Source decision:** [Product plans/plan-patient-profile-shell-rebuild.md § DL-1, DL-2](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md) and items R1.1, R1.2, R1.6.
- **Next task:** [`task-ppr-02-pane-definition-and-use-shell-layout.md`](./task-ppr-02-pane-definition-and-use-shell-layout.md) — same chat OK.

---

**Owner:** TBD
**Created:** 2026-05-13
**Status:** Pending
