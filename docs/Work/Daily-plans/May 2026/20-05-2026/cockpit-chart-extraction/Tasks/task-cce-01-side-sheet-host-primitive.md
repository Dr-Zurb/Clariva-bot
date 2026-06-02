# Task cce-01: Side-sheet host primitive (`useSideSheet` + `<SideSheetHost>`)

## 20 May 2026 — Batch [Cockpit chart extraction — R-CHART](../plan-cockpit-chart-extraction-batch.md) — Wave 1, Lane α step 0 — **S, ~3h**

---

## Task overview

cv2-09 designed the auxiliary-surface contracts in `frontend/lib/patient-profile/aux-surfaces.ts` but didn't ship a host for any of them. R-CHART is the first batch that needs the side-sheet contract for real (clicking a History visit-card opens visit detail in a slide-in sheet). cce-01 implements the framework.

After this task:

- `frontend/components/patient-profile/SideSheetHost.tsx` exists and exports a default `<SideSheetHost />` component + a named `useSideSheet()` hook.
- `<SideSheetHost />` is mounted inside `<PatientProfileShell>` as a sibling to the pane grid.
- Any descendant component (any pane) can call `useSideSheet().open(definition)` to open a sheet, `useSideSheet().close()` to dismiss.
- The host honors the cv2-09 `SideSheetDefinition` contract: `id`, `title`, `content: ComponentType`, `defaultWidth?`, `canDock?` (type-level only in v1).
- Right-edge slide-in (480px fixed width). `Esc` + backdrop click + explicit close button all dismiss.
- Single-sheet semantic: opening a second sheet replaces the current one (no stacking).
- A tiny dev-only smoke route at `/dashboard/_dev/side-sheet-smoke/page.tsx` opens a stub sheet; deleted by cce-05 close-out.

This task is a **plumbing change with no production-page impact**. The framework lands but no consumer uses it until cce-03 ships the visit-detail side sheet.

**Estimated time:** ~3h (1.5h for the host + hook + smoke route, 1h for the integration into `<PatientProfileShell>`, 30min for tsc / lint / smoke).

**Status:** Done.

**Hard deps:** None (cv2-09's `aux-surfaces.ts` already shipped).

**Source:** [plan-cockpit-v2.md § R-FUTURE-PROOFING/2 (side-sheet contract)](../../../../Product%20plans/plan-cockpit-v2.md), [plan-cockpit-chart-extraction-batch.md § DL-3, DL-4](../plan-cockpit-chart-extraction-batch.md#decision-lock-frozen-for-batch-duration), [task-cv2-09-aux-surface-contracts.md](../../../17-05-2026/cockpit-v2/Tasks/task-cv2-09-aux-surface-contracts.md) (the contract being implemented).

---

## Model & execution guidance

**Recommended model:** **Auto** (Sonnet 4.6 Medium). Side-sheet host is a small (~80 LOC) implementation of an existing contract. The `useSideSheet` registry pattern is well-established (React Context + a setter + dismiss handlers).

**Per-message escalation rule:** if Auto stalls on the registry pattern (specifically: whether to use Context-with-`useState` vs a Zustand store vs a singleton class), bump to Opus for one message. Most likely Auto picks Context + `useState` and that's correct.

**New chat?** **Yes** — fresh chat. Pre-load:

- This task file.
- `frontend/lib/patient-profile/aux-surfaces.ts` (the cv2-09 contract — read its `SideSheetDefinition` interface).
- `frontend/components/patient-profile/PatientProfileShell.tsx` (the mount point — read where the recursive shell renders the pane grid; identify a clean spot to mount the host as a sibling).
- `frontend/components/ui/dialog.tsx` (the existing shadcn dialog primitive — possibly reused for the backdrop + portal, OR built fresh with `Radix Dialog`).
- `docs/Work/Daily-plans/May 2026/17-05-2026/cockpit-v2/Tasks/task-cv2-09-aux-surface-contracts.md` (the contract task — read its acceptance criteria).
- The plan-batch's DL-3 + DL-4 sections.

**Estimated turns:** 3-5 turns (1 to read, 1-2 to write the host + hook, 1 to mount in shell + smoke route, 1 for tsc / lint).

---

## Acceptance criteria

### Step 1 — Survey the contract

- [x] Read `frontend/lib/patient-profile/aux-surfaces.ts` for the `SideSheetDefinition` interface. Record its required + optional fields. Most likely shape (verify on read):
  ```ts
  export interface SideSheetDefinition {
    id: string;
    title: string;
    content: React.ComponentType<unknown> | React.ReactNode;
    defaultWidth?: number;
    canDock?: boolean;
  }
  ```
- [x] If the contract uses `ComponentType` (a constructor) rather than `ReactNode` (instantiated JSX), pick whichever the contract specifies and use it consistently. Don't change the contract — implement to it.
- [x] Check whether `aux-surfaces.ts` already exports a `useSideSheet` declaration (a stub or a no-op). If so, this task replaces the stub with a real implementation. If not, this task adds the export.

### Step 2 — Build the host primitive

- [x] New file `frontend/components/patient-profile/SideSheetHost.tsx`. Top-of-file JSDoc explaining its role, the cv2-09 contract it implements, and the single-sheet-replace semantic.
- [x] Define a React Context that carries `{ openSheet: (def: SideSheetDefinition) => void, closeSheet: () => void }`.
- [x] Define an `<SideSheetHostProvider>` that wraps children. It owns the `currentSheet: SideSheetDefinition | null` state and renders the actual sheet body via a portal (or absolute-positioned overlay).
- [x] Define a `<SideSheetHost />` default export that mounts both the provider AND the rendered overlay. The provider gives descendants access to `openSheet` / `closeSheet`; the overlay is the visible UI when a sheet is active.
- [x] Define `useSideSheet()` hook that returns `{ open, close }`. Calling `open(definition)` replaces any current sheet. Calling `close()` clears the current sheet.
- [x] The overlay UI:
  - When `currentSheet === null`: render nothing (no DOM impact when idle).
  - When `currentSheet !== null`: render a fixed-position right-edge container with width `currentSheet.defaultWidth ?? 480` px, slide-in from the right (CSS transform + transition, ~250ms). Backdrop is a fixed-position dark-overlay (`bg-black/40`) covering the rest of the viewport, click-to-dismiss.
  - Header: `<h2>{currentSheet.title}</h2>` + close button (X icon, top-right). Header has bottom border.
  - Body: `<div className="flex-1 overflow-y-auto">{contentNode}</div>` where `contentNode` is either the rendered ComponentType OR the ReactNode itself per the contract.
  - Keyboard: `Esc` key dismisses (use a `useEffect` with `addEventListener('keydown', ...)`).
  - z-index: above pane chrome but below any modals (use `z-40` or similar; document the layering choice).
- [x] No multi-sheet stacking. Calling `open` while a sheet is already mounted REPLACES the current sheet (the new one slides in; the old one disappears immediately with no animation, OR a 100ms fade-out then the new one slides in — task picks).

### Step 3 — Mount the host in `<PatientProfileShell>`

- [x] In `frontend/components/patient-profile/Shell.tsx` (`PatientProfileShell`), import `<SideSheetHost />`.
- [x] Wrap the shell's render output: the host is mounted INSIDE the shell so descendants (panes) can call `useSideSheet()` via context. The host's overlay is rendered to the document via a React Portal so it floats above the panes regardless of the pane grid's overflow.
- [x] Verify the host is mounted exactly once per shell instance. Reads of `useSideSheet()` from any descendant work correctly.

### Step 4 — Build the dev smoke route

- [x] New file `frontend/app/dashboard/_dev/side-sheet-smoke/page.tsx`. Renders a fixture page with a button "Open test sheet" that calls `useSideSheet().open({ id: 'smoke', title: 'Test sheet', content: <div className="p-4">Hello world!</div>, defaultWidth: 480 })`. A second button "Open replacement sheet" tests the single-sheet-replace semantic.
- [x] **Important:** This route is dev-only. Deleted by cce-05 in Wave 4. Add a `// DELETE BY cce-05` comment at the top.
- [x] The smoke route mounts inside `<PatientProfileShell>` (or a thin standalone shell, if simpler — task picks; if standalone, the host wraps the page directly).

### Step 5 — Type + lint + smoke

- [x] `pnpm --filter frontend tsc --noEmit` clean (project has unrelated pre-existing TS error in `VoiceConsultRoom.tsx`; new files pass ESLint + Vitest).
- [x] `pnpm --filter frontend lint` clean (ESLint on touched files; 0 errors).
- [x] Open `/dashboard/_dev/side-sheet-smoke` in dev. Click "Open test sheet" → side sheet slides in from the right at 480px. Click backdrop → dismisses. Click button again, then click the X → dismisses. Click button, then press `Esc` → dismisses.
- [x] Click "Open test sheet", then click "Open replacement sheet" → first sheet replaces with second; no stacking.
- [x] React DevTools confirms exactly one `<SideSheetHost>` rendering one sheet body at a time.
- [x] No console errors on any path.

---

## Out of scope

- **Multi-sheet stacking.** Reserved for future per cv2-09 contract notes; no consumer in this batch.
- **Drag-to-resize side sheets.** Fixed width 480px. Future polish.
- **Docking** (`canDock: true` honored as actual docking). Type-level only in v1.
- **Floating dock contract** (a separate cv2-09 reservation). Different host, different batch.
- **Cmd+K binding integration** (the side sheet doesn't need its own keybinding — `Esc` is the only built-in). Future polish.
- **Building the visit-detail side sheet content.** That's cce-03's job.
- **Backend changes.** No new endpoints in this task.

---

## Files expected to touch

**Created:**

- `frontend/components/patient-profile/SideSheetHost.tsx` (~80-120 LOC).
- `frontend/app/dashboard/_dev/side-sheet-smoke/page.tsx` (~30 LOC; deleted by cce-05).

**Modified:**

- `frontend/components/patient-profile/PatientProfileShell.tsx` — wrap output with `<SideSheetHost />` (~5 LOC delta).
- `frontend/lib/patient-profile/aux-surfaces.ts` — IF the contract had a stub `useSideSheet`, replace it with a re-export of the new hook from `SideSheetHost.tsx`. Otherwise no change.

**Read but not modified:**

- The cv2-09 task file for the contract spec.

---

## Notes / open decisions

1. **Why Context + `useState` and not a Zustand store?** The host is shell-scoped (one per page). The state is small (one `SideSheetDefinition | null`). Context-based registries are the React-idiomatic choice for shell-scoped frameworks. Zustand is overkill here and would require a separate module file.

2. **Why mount the host inside the shell rather than at the page level?** The shell is the natural owner of overlay UI. `<PatientProfilePage>` already has too much going on (cockpit header, modality state derivation, `<RxFormProvider>` mount). The shell knows about pane chrome (drag handles, collapse buttons); the side-sheet z-index belongs near that chrome.

3. **What if the rendered Portal target doesn't exist on first render?** Use `ReactDOM.createPortal(overlay, document.body)`. `document.body` always exists on the client. SSR safety: gate the portal call on `typeof window !== 'undefined'`. The page is a Client Component anyway (the shell is `"use client"`).

4. **Should the smoke route reuse the `app/dashboard/` auth wrapper?** Yes — the side-sheet host depends on the shell, which depends on the dashboard layout (header, sidebar). Use the same auth-required pattern as `frontend/app/dashboard/appointments/[id]/page.tsx`. Document the deletion-by-cce-05 deadline at the top of the file.

5. **How does this interact with shadcn `<Dialog>`?** Don't use `<Dialog>` for side sheets. shadcn Dialog is centered modal; side sheet is right-edge slide-in with different keyboard semantics. Use Radix `<Dialog>` primitives directly OR build the overlay/backdrop from scratch with Tailwind + `Esc` key listener — task picks. shadcn `<Sheet>` (built on Radix `<Dialog>` with side-positioning) is also a viable starting point if it's already in the codebase.

6. **What about content that needs to mount its own data fetches?** That's the consumer's responsibility. The side-sheet host doesn't manage suspense / loading states inside the content. cce-03's `<VisitDetailSideSheet>` handles its own fetch + skeleton.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Source decisions:** [plan-cockpit-v2.md § R-FUTURE-PROOFING/2](../../../../Product%20plans/plan-cockpit-v2.md), [plan-cockpit-chart-extraction-batch.md § DL-3 + DL-4](../plan-cockpit-chart-extraction-batch.md#decision-lock-frozen-for-batch-duration).
- **Wave gate:** [`EXECUTION-ORDER-cockpit-chart-extraction.md` § Wave 1 gate](./EXECUTION-ORDER-cockpit-chart-extraction.md#wave-1-gate-after-cce-01).
- **Predecessor:** [task-cv2-09-aux-surface-contracts.md](../../../17-05-2026/cockpit-v2/Tasks/task-cv2-09-aux-surface-contracts.md) — the contract this task implements.
- **Successor in batch:** [`task-cce-03-history-pane-and-visit-detail-sheet.md`](./task-cce-03-history-pane-and-visit-detail-sheet.md) — the framework's first real consumer.

---

**Owner:** TBD
**Created:** 2026-05-20
**Status:** Done