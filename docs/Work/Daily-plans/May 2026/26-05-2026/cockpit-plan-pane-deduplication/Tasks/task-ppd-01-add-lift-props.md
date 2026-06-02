# ppd-01 · Add lift-prop scaffolding

> **Wave 1** of [cockpit-plan-pane-deduplication](../plan-cockpit-plan-pane-deduplication-batch.md). Sync point for Wave 2's three independent leaves. Pure prop drilling — no conditional rendering yet.

| Property | Value |
|---|---|
| **Status** | ✅ Done (2026-05-26) |
| **Owner** | Frontend |
| **Size** | S (~80 LOC across 4 files) |
| **Model** | Auto |
| **Wave** | 1 |
| **Depends on** | — |
| **Blocks** | ppd-02, ppd-03, ppd-04 |

---

## Goal

Add four new optional boolean props to the prop chain that flows `templates → RxPane → RxWorkspace → PrescriptionForm → PrescriptionFormCompositionRoot`. The props are NOT consumed yet — only declared and forwarded. Wave 2 tasks consume them.

The four props (DL-1):

| Prop | Purpose | Final consumer |
|---|---|---|
| `subjectiveLifted` | Hide `<SubjectiveSection>` (right column owns it) | `PrescriptionFormCompositionRoot` |
| `objectiveLifted` | Hide `<ObjectiveSection>` (right column owns it) | `PrescriptionFormCompositionRoot` |
| `entryModeLifted` | Hide "Prescription type" radio + force structured mode | `PrescriptionFormBody` |
| `photoLifted` | Hide photo / attachments block | `PrescriptionFormBody` |

All default to `false` (DL-8). Existing callers see no behavior change.

---

## What to do

### 1. `frontend/components/cockpit/rx/PrescriptionFormCompositionRoot.tsx`

Add to `PrescriptionFormCompositionRootProps`:

```ts
  /** Hide Subjective when `<SubjectivePane>` (right column) owns it (ppd-02). */
  subjectiveLifted?: boolean;
  /** Hide Objective when `<ObjectivePane>` (right column) owns it (ppd-02). */
  objectiveLifted?: boolean;
```

Destructure both with default `false` in the function signature. Don't use them yet — just plumb. ppd-02 will gate the rendering.

### 2. `frontend/components/consultation/PrescriptionForm.tsx`

Add to `PrescriptionFormProps`:

```ts
  /**
   * Cockpit dedup (ppd-03): when true, hides the "Prescription type"
   * fieldset AND forces `entryMode = "structured"` for the lifetime of
   * the form. Default `false` — non-cockpit mounts keep the radio.
   */
  entryModeLifted?: boolean;
  /**
   * Cockpit dedup (ppd-03): when true, hides the Photo / attachments
   * block AND no-ops any pending photo upload. Default `false`.
   */
  photoLifted?: boolean;
  /**
   * Cockpit dedup (ppd-02): forwarded to `<PrescriptionFormCompositionRoot>`.
   */
  subjectiveLifted?: boolean;
  /**
   * Cockpit dedup (ppd-02): forwarded to `<PrescriptionFormCompositionRoot>`.
   */
  objectiveLifted?: boolean;
```

Destructure all four with default `false` in `PrescriptionForm` and `PrescriptionFormBody`. Forward `subjectiveLifted` + `objectiveLifted` to the existing `<PrescriptionFormCompositionRoot>` call (search for `<PrescriptionFormCompositionRoot` inside the file — likely in the sections render block).

`entryModeLifted` + `photoLifted` are NOT consumed here — ppd-03 will add the conditional renders. Just plumb the props through.

### 3. `frontend/components/consultation/cockpit/RxWorkspace.tsx`

Add to `RxWorkspaceProps`:

```ts
  /** Cockpit dedup (ppd) — see PrescriptionFormProps for semantics. */
  subjectiveLifted?: boolean;
  /** Cockpit dedup (ppd) — see PrescriptionFormProps for semantics. */
  objectiveLifted?: boolean;
  /** Cockpit dedup (ppd) — see PrescriptionFormProps for semantics. */
  entryModeLifted?: boolean;
  /** Cockpit dedup (ppd) — see PrescriptionFormProps for semantics. */
  photoLifted?: boolean;
```

Destructure with defaults `false`. Forward all four to the inner `<PrescriptionForm>` JSX block (already present near line 227).

### 4. `frontend/components/patient-profile/panes/RxPane.tsx`

Add to `RxPaneProps`:

```ts
  /** Cockpit dedup (ppd) — see PrescriptionFormProps for semantics. */
  subjectiveLifted?: boolean;
  /** Cockpit dedup (ppd) — see PrescriptionFormProps for semantics. */
  objectiveLifted?: boolean;
  /** Cockpit dedup (ppd) — see PrescriptionFormProps for semantics. */
  entryModeLifted?: boolean;
  /** Cockpit dedup (ppd) — see PrescriptionFormProps for semantics. */
  photoLifted?: boolean;
```

Destructure + default + forward to `<RxWorkspace>` (already present in `rxWorkspaceBody`).

### 5. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
```

No new tests needed — Wave 2 tasks own the test coverage for the consumed behaviors.

---

## Acceptance gate

- [x] `PrescriptionFormCompositionRootProps` has `subjectiveLifted?: boolean` + `objectiveLifted?: boolean`, both default `false`.
- [x] `PrescriptionFormProps` has all four new props, all default `false`; `subjectiveLifted` + `objectiveLifted` forwarded into `<PrescriptionFormCompositionRoot>`.
- [x] `RxWorkspaceProps` has all four; all forwarded to `<PrescriptionForm>`.
- [x] `RxPaneProps` has all four; all forwarded to `<RxWorkspace>`.
- [x] `pnpm --filter frontend tsc --noEmit` clean.
- [x] `pnpm --filter frontend lint` clean.

---

## Anti-goals

- ❌ Don't add conditional rendering here — that's ppd-02 + ppd-03.
- ❌ Don't change `templates.tsx` here — that's ppd-04.
- ❌ Don't add new files — only modify the 4 listed.
- ❌ Don't bundle the props into a single object (`{ lifts: { subjective: true, ... } }`) — keep them flat to match the existing `dxLifted` / `safetyLifted` precedent.

---

## Notes

- The lift pattern precedent: `dxLifted` (cmr-01), `safetyLifted` (cmr-02), `actionsInFooter` (cmr-03). Today's batch extends with four more in the same style.
- Why default `false`: backward compat. Any existing call site of `<RxPane>` / `<RxWorkspace>` / `<PrescriptionForm>` outside the cockpit shell sees today's behavior unchanged.
- After this task ships, three Wave 2 tasks can start in parallel chats. None reads any other's WIP.
