# Task csf-02: Convert `templates.tsx` from literal to factory function

## 19 May 2026 — Batch [Cockpit shell flip — Phase 2 foothold](../plan-cockpit-shell-flip-batch.md) — Wave 1, Lane α step 1 — **S, ~1.5h**

---

## Task overview

`frontend/lib/patient-profile/templates.tsx` ships from cv2-03 as a top-level `export const TELEMED_VIDEO_TEMPLATE: PaneDefinition[]` literal. Every leaf renders `<PanePlaceholder ... />` — closures captured at module-evaluation time, so the leaves can't access the appointment / token / cockpit state that real content needs.

This task converts the literal to a **factory function** `getTelemedVideoTemplate(ctx: TelemedVideoContext): PaneDefinition[]`. Every leaf's `render` becomes a closure over the `ctx` parameter, ready to invoke real components in csf-03. The factory is a pure transformation of a typed input to a `PaneDefinition[]` output; it has no side effects and no React hooks (`useMemo` lives in the consumer, not in the factory).

Behaviour-wise, this task is a no-op: `getTelemedVideoTemplate(fixtureCtx)` produces a tree with the same leaf ids, the same depth, the same `<PanePlaceholder>` rendering, and the same `naturalSizePct` / `minSizePx` numbers as the pre-refactor literal. csf-03 fills the leaves with real components.

After this task:

- `templates.tsx` exports `getTelemedVideoTemplate(ctx: TelemedVideoContext)` instead of `TELEMED_VIDEO_TEMPLATE`.
- The `TelemedVideoContext` type is exported and documented; it carries the appointment, token, derived cockpit state, launcher ref, hideHeader flag, and the four event handlers + `finishBusy` boolean.
- A smoke test (or a fixture render in dev mode) confirms the factory output's `flattenPaneDefinitions(...).paneOrder` matches the pre-refactor literal byte-for-byte.

This task is a **plumbing change with zero visible diff**. The literal is renamed; nothing visible changes.

**Estimated time:** ~1.5h (1h for the refactor + the type definition, ~30min for the smoke + cleanup).

**Status:** Complete.

**Hard deps:** csf-01 (the lifted provider's value comes from the `ctx` this factory takes — csf-01 must establish what the value shape contains before csf-02 finalises the `TelemedVideoContext` type).

**Source:** [plan-cockpit-shell-flip-batch.md § Wave 1](../plan-cockpit-shell-flip-batch.md#wave-1--provider-lift--factory-refactor-2-tasks-3h-single-sequential-lane), [plan-cockpit-v2.md § "The 8-pane default layout"](../../../../Product%20plans/plan-cockpit-v2.md#4-canonical-default-layout-telemed-video-template).

---

## Model & execution guidance

**Recommended model:** **Auto** (Sonnet 4.6 Medium). Pure structural refactor — convert one literal to one factory function, add one type. Behaviour-preserving by construction.

**New chat?** **Yes** — fresh chat. Pre-load:

- This task file.
- `frontend/lib/patient-profile/templates.tsx` (the literal being refactored).
- `frontend/lib/patient-profile/types.ts` (the `PaneDefinition` shape — unchanged in this task; line 40 onwards).
- `frontend/components/patient-profile/PanePlaceholder.tsx` (the synthetic leaf that stays in place).
- `frontend/components/patient-profile/PatientProfilePage.tsx` (the future consumer — read lines 292–360 for the `builtInPanes` shape that the new factory output will eventually replace; csf-04 owns that swap, not this task).
- The csf-01 task file (sibling) for the provider-lift context shape.
- Source plan §"The 8-pane default layout" for the layout sketch.

**Estimated turns:** 2–3 turns (1 to read, 1 to write the factory + type, 1 for the smoke).

---

## Acceptance criteria

### Step 1 — Define `TelemedVideoContext`

- [x] Add a new type export at the top of `frontend/lib/patient-profile/templates.tsx`:
  ```ts
  export interface TelemedVideoContext {
    /** The appointment driving this cockpit page. */
    appointment: Appointment;
    /** Auth token for downstream API calls. */
    token: string;
    /** Derived cockpit state (waiting | live | wrap_up | …) from deriveCockpitState. */
    state: CockpitState;
    /** Imperative ref into the consult launcher; null when no consult is active. */
    launcherRef?: React.RefObject<ConsultationLauncherHandle>;
    /** When true, leaf renderers omit per-pane H2 headers (the shell renders them). */
    hideHeader?: boolean;
    /** Stub callback used by the body / rx panes after a Send-Rx flow completes. */
    onRxSent?: () => void;
    /** Mark-no-show callback wired into the body pane. */
    onMarkNoShow?: () => void;
    /** Finish-visit callback wired into the rx pane (Send Rx & finish ▸). */
    onFinishVisit?: () => void;
    /** Live medicine count surfaced to the rx pane for the collapsed-rail strip. */
    onMedicineCountChange?: (n: number) => void;
    /** True while the finish-visit RPC is in flight. */
    finishBusy?: boolean;
  }
  ```
  Imports from `@/types/appointment` (Appointment, ConsultationLauncherHandle) and `@/lib/patient-profile/state` (CockpitState — verify the export path; if it's elsewhere, follow `rg "deriveCockpitState"`).
- [x] Verify `pnpm --filter frontend tsc --noEmit` after the type addition. Clean.

### Step 2 — Convert the literal to a factory

- [x] Rename the existing `export const TELEMED_VIDEO_TEMPLATE: PaneDefinition[] = [...]` to `export function getTelemedVideoTemplate(ctx: TelemedVideoContext): PaneDefinition[] { return [...]; }`.
- [x] Inside the function body, the tree shape stays identical: outer horizontal group with three children (`left-column`, `middle-column`, `right-column`); left column has Snapshot + History children; middle column has Body + middle-bottom (which is a horizontal group with Investigations + Plan); right column has Subjective + Objective.
- [x] Each leaf's `render` is unchanged in this task — they all still call `<PanePlaceholder title=... icon=... futureRItem=... />`. csf-03 swaps these for real component invocations using `ctx`.
- [x] **Critical:** the function signature must accept `ctx` so csf-03 can later invoke `<PatientChartPane appointment={ctx.appointment} token={ctx.token} hideHeader={ctx.hideHeader} />` etc. Even though this task doesn't USE `ctx` in the leaf renderers yet, the parameter must be in the signature. To suppress the unused-arg lint warning, add `void ctx;` at the top of the function body — csf-03 deletes that line when it starts using ctx in earnest.

### Step 3 — Update the file's top JSDoc

- [x] Update the top-of-file JSDoc to reflect the rename: change "templates.tsx — modality-aware layout templates (cv2-03 ships the Telemed-Video template only; R-MOD adds the other three + In-Clinic variants in Phase 2)." to "templates.tsx — modality-aware layout factories (csf-02 converted the cv2-03 literal to a factory; csf-03 wires real content; R-MOD-full follow-up batch adds Telemed-Voice / Telemed-Text / Review template factories)."
- [x] Update the "Reserved for Phase 2 — keep this module" line to "Active Phase 2 module — `getTelemedVideoTemplate` is mounted by `PatientProfilePage` post-csf-04. Adding new template factories (`getTelemedVoiceTemplate` etc.) is the R-MOD-full follow-up batch."
- [x] Keep the pane-id → R-item mapping list at the top of the file; mark the two leaves that csf-03 will leave as placeholders: "history → R-CHART (deferred — csf-03 keeps PanePlaceholder)", "investigations-orders → R-MIDDLE bottom-left (deferred — csf-03 keeps PanePlaceholder)".

### Step 4 — Smoke against the pre-refactor literal

- [x] Build a tiny in-file fixture in a comment block (or a temporary unit test if the team prefers — task picks one based on existing precedent in `frontend/lib/patient-profile/__tests__/`):
  ```ts
  // Smoke: getTelemedVideoTemplate(fixture) produces the expected tree shape.
  // Run mentally against the layout sketch in plan-cockpit-v2.md "§ The 8-pane default layout".
  // const tree = getTelemedVideoTemplate({ appointment: ..., token: ..., state: 'live' });
  // const flat = flattenPaneDefinitions(tree);
  // assert flat.paneOrder is ['snapshot', 'history', 'body', 'investigations-orders', 'plan', 'subjective', 'objective']
  // (8 leaves expected — Assessment is not a leaf in Phase 1; R-MIDDLE adds the sticky strip slot later.)
  ```
- [x] If the existing `__tests__/` directory has a precedent, write a minimal Vitest case asserting the leaf-id list. If not, leave the comment block and rely on csf-03's smoke and csf-06's verification matrix.
- [x] Verify no unused imports linger in `templates.tsx` (lucide-react icons may have been imported eagerly; keep them — csf-03 still uses them).

### Step 5 — Update consumers (none in this task)

- [x] Run `rg "TELEMED_VIDEO_TEMPLATE" frontend` to confirm zero callers (the literal had no production consumers — verified by cv2-08; the v2-tree page that imported it was deleted). If any caller surfaces, **stop** and document — that consumer needs a corresponding swap to `getTelemedVideoTemplate(ctx)` and the task scope grows.

### Step 6 — Type + lint sweep

- [x] `pnpm --filter frontend tsc --noEmit` clean.
- [x] `pnpm --filter frontend lint` clean (the `void ctx;` line silences the unused-arg warning until csf-03).

---

## Out of scope

- **Wiring real content into the leaves.** csf-03 owns content injection. This task only changes the export shape.
- **Adding the other three template factories** (`getTelemedVoiceTemplate`, `getTelemedTextTemplate`, `getReviewTemplate`). Promotes to the R-MOD-full follow-up batch.
- **Adding `mapStateToTemplate(state, modality)`.** Same — R-MOD-full.
- **Adding the doctor-settings `cockpit_template_override` column** to choose a default template per doctor. Same — R-MOD-full.
- **Adding the Assessment "sticky strip" slot.** R-MIDDLE follow-up batch.
- **Storage namespace bump.** csf-04 owns it.

---

## Files expected to touch

**Modified:**

- `frontend/lib/patient-profile/templates.tsx` — convert literal to factory; add `TelemedVideoContext` type; update top-of-file JSDoc (~30 LOC delta net).

**Read but do not modify:**

- `frontend/lib/patient-profile/types.ts` (the `PaneDefinition` shape).
- `frontend/components/patient-profile/PanePlaceholder.tsx` (the leaf component, unchanged).
- `frontend/components/patient-profile/PatientProfilePage.tsx` (the future consumer; csf-04 swaps it).

---

## Notes / open decisions

1. **Why a factory function, not a hook?** Hooks can't be called outside React components, but the factory might be called from server code (route preloads, SSR snapshots) someday. Keeping it as a pure function leaves that door open. The consumer (`PatientProfilePage`) wraps the call in `useMemo` to memoize per-render.

2. **Should `TelemedVideoContext` extend a base `CockpitContext`?** Not in this batch. When R-MOD-full ships (`getTelemedVoiceTemplate`, etc.), refactor the shared fields into a base type at that point. Premature now.

3. **Why include `finishBusy` in the context?** The Plan leaf's `<RxPane>` renders the Send Rx & finish ▸ button which needs to disable while a finish-visit RPC is in flight. The current `builtInPanes` array already passes `finishBusy` via closure; the factory needs an explicit field for parity.

4. **What about the `<CockpitHeader>`?** The header renders OUTSIDE the shell, above it (see `PatientProfilePage.tsx` lines 532–562). It is NOT a pane — it's a fixed strip. The factory only produces the shell's pane tree. The header keeps its existing prop drilling.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Source decisions:** [Product plans/plan-cockpit-v2.md § "The 8-pane default layout"](../../../../Product%20plans/plan-cockpit-v2.md#4-canonical-default-layout-telemed-video-template), [plan-cockpit-shell-flip-batch.md § DL-2](../plan-cockpit-shell-flip-batch.md#decision-lock-frozen-for-batch-duration).
- **Wave gate:** [`EXECUTION-ORDER-cockpit-shell-flip.md` § Wave 1 gate](./EXECUTION-ORDER-cockpit-shell-flip.md#wave-1-gate-after-csf-01--csf-02).
- **Predecessor in lane:** [`task-csf-01-rxform-provider-lift.md`](./task-csf-01-rxform-provider-lift.md) — must ship before this task because the lifted provider's value shape informs `TelemedVideoContext`.
- **Successor in lane:** [`task-csf-03-wire-real-content-into-leaves.md`](./task-csf-03-wire-real-content-into-leaves.md) — this task's `ctx` parameter is consumed there.

---

**Owner:** TBD  
**Created:** 2026-05-19  
**Status:** Complete
