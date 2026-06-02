# Task csf-01: Hoist `<RxFormProvider>` above the patient-profile shell

## 19 May 2026 — Batch [Cockpit shell flip — Phase 2 foothold](../plan-cockpit-shell-flip-batch.md) — Wave 1, Lane α step 0 — **S, ~1.5h**

---

## Task overview

Today, `<RxFormProvider>` is mounted **inside** `frontend/components/consultation/PrescriptionForm.tsx` at line 263. Every consumer of `useRxForm()` lives inside that provider's subtree. The four section components (`<SubjectiveSection>`, `<ObjectiveSection>`, `<AssessmentSection>`, `<PlanSection>`) all live inside `<PrescriptionFormCompositionRoot>` which is rendered by `<PrescriptionForm>`. So they all share one provider and one autosave timer — but only because they all live in one subtree.

The cockpit-shell-flip batch wants to mount `<SubjectiveSection>` and `<ObjectiveSection>` in **sibling panes** of the Plan pane (Subjective leaf in the right column top, Objective leaf in the right column bottom). For that to work, the provider has to be hoisted above the shell so all panes can read from one ancestor `<RxFormProvider>`.

This task is the structural lift. It hoists `<RxFormProvider>` from inside `PrescriptionForm.tsx` to wrap `<PatientProfileShell>` inside `frontend/components/patient-profile/PatientProfilePage.tsx`. PrescriptionForm becomes provider-aware: it reads context; if a parent provider exists (the cockpit case), it subscribes; if not (the in-call mini-panel and post-call summary cases), it self-mounts a provider. Three mount surfaces (DL-30 from cv2) preserved.

After this task:

- `<RxFormProvider>` mounts in exactly one place per page: at the top of `PatientProfilePage` (cockpit mount) OR inside PrescriptionForm (standalone mounts).
- The autosave timer is a single instance per draft row (the `useEffect` debounce inside the provider runs once).
- Subjective / Objective / Assessment / Plan section components all see the same provider regardless of which pane mounts them.
- Existing tsc + lint clean.

This task is a **plumbing change with zero visible diff**. The user opening any of the three mount surfaces sees exactly what they saw pre-task (csf-03 is the task that visibly distributes content; this task only enables it).

**Estimated time:** ~1.5h (1h for the lift + tests, ~30min for the smoke pass against the three mount surfaces).

**Status:** Complete.

**Hard deps:** None within this batch (Wave 1 step 0). Cross-batch: cv2-05 must be merged (the `<RxFormProvider>` exists), cv2-06 must be merged (the four section components exist).

**Source:** [plan-cockpit-shell-flip-batch.md § DL-3](../plan-cockpit-shell-flip-batch.md#decision-lock-frozen-for-batch-duration), [plan-cockpit-v2.md § DL-27 (RxFormContext owns form state)](../../../../Product%20plans/plan-cockpit-v2.md#dl-13--dl-25--new-locks-for-cockpit-v2), DL-30 from cv2 (three mount surface invariant).

---

## Model & execution guidance

**Recommended model:** **Auto** (Sonnet 4.6 Medium). Provider hoisting is a well-established React pattern; the existing `<RxFormProvider>` already exposes the value-prop shape needed, so this is a refactor not a redesign.

**Per-message escalation rule:** if Auto stalls on the "context-aware self-mount" pattern (PrescriptionForm checking for an existing provider before mounting its own), bump to Opus 4.7 for one message. Most likely Auto handles it fine — the React pattern is to call `useContext` and return a sentinel when no provider is present.

**New chat?** **Yes** — fresh chat. Pre-load:

- This task file.
- `frontend/components/cockpit/rx/RxFormContext.tsx` (the provider being lifted; lines 391–520 are the relevant `RxFormProvider` + `useRxForm` definitions).
- `frontend/components/consultation/PrescriptionForm.tsx` (the current owner; lines around 6 (the `RxFormProvider` import), 263 (where it mounts), 315 (where it closes)).
- `frontend/components/cockpit/rx/PrescriptionFormCompositionRoot.tsx` (the consumer that reads `useRxForm`).
- `frontend/components/patient-profile/PatientProfilePage.tsx` (the new mount point; lines 524–642 — the JSX root that needs to wrap the shell with the provider).
- `frontend/components/cockpit/rx/sections/SubjectiveSection.tsx` (a representative section that calls `useRxForm`).
- The cv2-05 task file ([`task-cv2-05-rx-form-context.md`](../../../17-05-2026/cockpit-v2/Tasks/task-cv2-05-rx-form-context.md)) for the context's autosave-timer ownership.

**Estimated turns:** 3–4 turns (1 to read, 1 to lift the provider + add the self-mount fallback, 1 for tests, 1 for the three-mount-surface smoke).

---

## Acceptance criteria

### Step 1 — Survey current consumers

- [ ] Run `rg "<RxFormProvider" frontend` and confirm the only mount today is inside `PrescriptionForm.tsx` (1 match).
- [ ] Run `rg "useRxForm\(\)" frontend` and list every consumer. Should match the four section components (`Subjective`, `Objective`, `Assessment`, `Plan`) plus possibly `RxWorkspace` or `PrescriptionFormCompositionRoot`.
- [ ] Run `rg "import.*PrescriptionForm.*from" frontend` to confirm the three mount surfaces. Per the cv2-08 verification report: `RxPane` → `RxWorkspace` → `PrescriptionForm` (cockpit), `MobilePillBar` → `RxWorkspace` → `PrescriptionForm` (mobile pill, also under cockpit shell), and any standalone non-shell mount (in-call mini-panel, post-call summary — verify these still exist or were folded into the shell).

### Step 2 — Add the provider-existence sentinel

- [ ] In `frontend/components/cockpit/rx/RxFormContext.tsx`, add a small helper that callers can use to detect whether a parent `<RxFormProvider>` exists. The simplest approach: change the context's default value to a sentinel like `null` (it may already be `null`); export a hook `useExistingRxFormProvider()` that returns `true` when context is non-null, `false` otherwise. **Do not break the existing `useRxForm()` hook** — it must still throw when called outside any provider; the sentinel hook is for components that legitimately need to mount their own provider when none exists.
- [ ] If the context already throws on missing provider (per the existing `useRxForm` line 515 message), the sentinel approach is to expose the raw context object: `export const RxFormContext = createContext<RxFormContextValue | null>(null);` and a hook `export function useOptionalRxForm() { return useContext(RxFormContext); }` that returns `null` when no provider is present.
- [ ] Run `pnpm --filter frontend tsc --noEmit` after adding the helper. Clean.

### Step 3 — Hoist the provider into `PatientProfilePage`

- [ ] In `frontend/components/patient-profile/PatientProfilePage.tsx`, import `RxFormProvider` from `@/components/cockpit/rx/RxFormContext` (or the re-export at `@/components/cockpit/rx/PrescriptionFormCompositionRoot`).
- [ ] Wrap the entire JSX root (the `<div className="-m-4 md:-m-6 flex h-screen flex-col">` at line 529) inside `<RxFormProvider {...providerProps}>`. The provider's props (autosave callbacks, draft id, initial values, debounce ms) come from the existing `PrescriptionForm` props passed via `RxWorkspace`. **Identify the props at task time** — read the cv2-05 task file and `RxFormContext.tsx` for the provider's required value shape; the `appointment.id` is the natural draft id; the autosave callback is the existing `prescriptionAutosaveService` (or whatever cv2-05 wired). If the provider needs a `draft` parameter that today is fetched inside `PrescriptionForm`, lift the fetch one level up: `PatientProfilePage` already fetches the appointment, so a parallel fetch of the prescription draft (or use of an existing hook like `usePrescriptionDraft(appointment.id, token)`) works.
- [ ] **Important:** ensure the `useShellHotkeys` and the `<CommandBar>` continue to mount inside the provider's subtree (so future Cmd+K commands can read form state). The provider wraps everything; nothing comes between it and the shell.

### Step 4 — Make `PrescriptionForm` provider-aware (self-mount fallback)

- [ ] In `frontend/components/consultation/PrescriptionForm.tsx`, replace the unconditional `<RxFormProvider>` mount (around line 263) with a conditional:
  ```tsx
  const existingProvider = useOptionalRxForm();
  // existing form-body JSX
  return existingProvider ? formBody : (
    <RxFormProvider {...providerProps}>{formBody}</RxFormProvider>
  );
  ```
  When `PrescriptionForm` is mounted under `PatientProfilePage` (the cockpit case), `useOptionalRxForm()` returns the context value and `existingProvider` is truthy → no second provider mounts. When `PrescriptionForm` is mounted standalone (in-call mini-panel, post-call summary), the context is `null` and the form self-mounts as today.
- [ ] **Critical:** when subscribing to a parent provider, do NOT pass a different `appointmentId` / `draftId` than the parent — the parent's draft id IS the canonical one. If `PrescriptionForm` accepts an `appointment` prop that disagrees with the parent provider's draft id, prefer the parent's. (Should never happen in practice — the cockpit always reads one appointment per page.)
- [ ] Verify React DevTools shows exactly one `<RxFormProvider>` in the tree when mounted under `PatientProfilePage`.

### Step 5 — Verify the three mount surfaces

- [ ] **Appointment-detail page** (cockpit mount via `RxPane` → `RxWorkspace` → `PrescriptionForm`): open `/dashboard/appointments/[id]`; React DevTools shows ONE `<RxFormProvider>` (mounted by `PatientProfilePage`); fill CC, vitals BP systolic, a medicine; wait 1.5s; saving indicator fires once; reload → all three persist.
- [ ] **Mobile pill bar** (`MobilePillBar` → `RxWorkspace` → `PrescriptionForm`, also under `PatientProfilePage`): same as above — ONE provider in the tree, single autosave timer.
- [ ] **Standalone mounts** — if `AppointmentConsultationActions.tsx` (cv2-08 verification report flagged it as orphaned but still importing PrescriptionForm) is mounted in any test fixture or storybook, verify it self-mounts a provider correctly. If it has zero importers in production code (per the cv2-08 report), no smoke needed — just ensure it compiles.
- [ ] Run `pnpm --filter frontend tsc --noEmit` clean.
- [ ] Run `pnpm --filter frontend lint` clean.

### Step 6 — Update task notes

- [ ] Append a one-paragraph `Lifting note` to `frontend/components/consultation/PrescriptionForm.tsx` near the top (above the existing top-of-file JSDoc): "Provider lifted to `PatientProfilePage` by csf-01 (2026-05-19) — this component now subscribes to a parent provider when mounted under the cockpit shell, and self-mounts a provider when used standalone (in-call mini-panel, post-call summary). Three mount surfaces preserved per cv2 DL-30."

---

## Out of scope

- **Wiring real content into the Subjective / Objective leaves.** That's csf-03's job. csf-01 only lifts the provider; the leaves still render `<PanePlaceholder>` until csf-03 swaps them.
- **Refactoring `RxWorkspace.tsx` to consume the lifted provider directly.** RxWorkspace continues to mount `<PrescriptionForm>` which now subscribes to the parent provider; no changes needed.
- **Removing the `<RxFormProvider>` mount inside `PrescriptionForm.tsx` entirely.** The standalone mount paths (in-call, post-call) still need it; the conditional preserves them.
- **Performance optimisation of the autosave debounce.** The existing 1500ms debounce stays.
- **Adding new fields to `RxFormContext`'s state.** csf-01 is pure structural; no field changes.

---

## Files expected to touch

**Modified:**

- `frontend/components/cockpit/rx/RxFormContext.tsx` — add `useOptionalRxForm` helper export (~10 LOC).
- `frontend/components/consultation/PrescriptionForm.tsx` — conditional provider mount (~15 LOC delta).
- `frontend/components/patient-profile/PatientProfilePage.tsx` — wrap shell in `<RxFormProvider>` (~25 LOC delta — imports + provider open/close + props).

**Read but do not modify:**

- The four section components (`SubjectiveSection.tsx`, `ObjectiveSection.tsx`, `AssessmentSection.tsx`, `PlanSection.tsx`) — they continue to call `useRxForm()` unchanged.
- `RxWorkspace.tsx` — continues to mount `<PrescriptionForm>` which now subscribes to the parent.
- `PrescriptionFormCompositionRoot.tsx` — continues to render the four sections inside the form body.

---

## Notes / open decisions

1. **Why hoist the provider rather than make sections accept a prop?** Sections live in different panes (different subtrees of the shell). Passing `RxFormState` + setters as props through every pane wrapper would re-introduce the prop drilling that cv2-05 deliberately killed. Context is the right tool.

2. **What if the provider's value depends on data only available inside `PrescriptionForm` today (e.g., medicine instance ids)?** Lift the source of truth one level too. `medicineInstanceIds` lives in `RxWorkspace.tsx`'s state today; the lift moves it (or the data fetch that produces it) to `PatientProfilePage`. The simpler path: keep the data inside `RxWorkspace` for now, and have the lifted `<RxFormProvider>` accept those values via a child render prop or initialize-from-props pattern. The cv2-05 task spec for `RxFormContext` should already accept these via `RxFormProviderProps` — verify on read.

3. **What about `disabled` / `token` / `drugMasterIndex` props?** These are not provider state — they're props passed down through the composition root. They continue to flow through `RxWorkspace` → `PrescriptionFormCompositionRoot` → sections as today. The provider lift only changes WHERE the form-state context lives, not WHAT props flow through React's normal mechanism.

4. **What if a future task wants the provider to mount even higher (e.g., the dashboard layout)?** Won't happen in this batch. Per DL-3, one provider per page. The provider's lifecycle is bound to the appointment id; mounting it above the appointment-detail page (where the appointment id is unknown) makes no sense.

5. **Test coverage?** No new tests in this batch (no behavioural changes). The cv2-05 / cv2-06 tests for the four sections + the autosave timer should all still pass. If `pnpm --filter frontend test` reveals a regression, fix it in a follow-up commit on the same branch — do not extend this task's scope.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Source decisions:** [Product plans/plan-cockpit-v2.md § DL-27](../../../../Product%20plans/plan-cockpit-v2.md), [plan-cockpit-shell-flip-batch.md § DL-3](../plan-cockpit-shell-flip-batch.md#decision-lock-frozen-for-batch-duration).
- **Wave gate:** [`EXECUTION-ORDER-cockpit-shell-flip.md` § Wave 1 gate](./EXECUTION-ORDER-cockpit-shell-flip.md#wave-1-gate-after-csf-01--csf-02).
- **Successor in lane:** [`task-csf-02-templates-factory-refactor.md`](./task-csf-02-templates-factory-refactor.md) — the templates factory refactor that consumes the lifted provider's `ctx`.
- **Predecessor batches:** [cv2-05](../../../17-05-2026/cockpit-v2/Tasks/task-cv2-05-rx-form-context.md), [cv2-06](../../../17-05-2026/cockpit-v2/Tasks/task-cv2-06-section-component-extractions.md).

---

**Owner:** TBD  
**Created:** 2026-05-19  
**Status:** Complete
