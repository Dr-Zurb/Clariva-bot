# Task cs-06: Add `react-resizable-panels` dep + generate shadcn `Resizable` primitives

## 09 May 2026 — Batch [Cockpit shell redesign](../plan-cockpit-shell-redesign-batch.md) — Phase B, Lane δ step 0 — **S, ~1h**

---

## Task overview

Phase B replaces the cockpit's page-scroll + sticky shell with a fixed-height, three-column, independently-scrolling, resizable layout. The mechanism for the column resize is the `react-resizable-panels` library, wrapped by shadcn's standard `<Resizable*>` primitives.

This task is the **dependency-prep step**: install the library, generate the shadcn primitive file at `frontend/components/ui/resizable.tsx`, verify there's no SSR / hydration warning in `pnpm dev`, and commit. **No layout changes yet.** That's cs-07.

**Estimated time:** ~1h.

**Status:** Pending.

**Hard deps:** none.

**Source:** [plan-cockpit-shell-redesign-batch.md § CS-D2 + CS-D3](../plan-cockpit-shell-redesign-batch.md#decision-lock-locked-2026-05-09-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — start the Phase-B sequential lane fresh.

Pre-load:
- This task file.
- `frontend/package.json` (verify the version of `react`, since `react-resizable-panels` peer-deps on it).
- `frontend/components/ui/` directory listing (confirm shadcn pattern conventions — most existing primitives have `'use client'` at the top; this one will too).

**Estimated turns:** 1–2 turns.

---

## Acceptance criteria

### Install dependency

- [ ] `pnpm --filter frontend add react-resizable-panels` (or yarn / npm equivalent — match the repo's package manager). Use the latest stable major.
- [ ] `frontend/package.json` shows the new dep under `dependencies` (not `devDependencies` — this is runtime).
- [ ] `pnpm install` is clean (no peer-dep warnings; if there are any, document them in the PR description).
- [ ] `pnpm-lock.yaml` updated.

### Generate shadcn `Resizable` primitive

- [ ] Create `frontend/components/ui/resizable.tsx` with the shadcn-recommended snippet. The current shadcn snippet is:

  ```tsx
  'use client';

  import { GripVertical } from 'lucide-react';
  import * as ResizablePrimitive from 'react-resizable-panels';

  import { cn } from '@/lib/utils';

  const ResizablePanelGroup = ({
    className,
    ...props
  }: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) => (
    <ResizablePrimitive.PanelGroup
      className={cn(
        'flex h-full w-full data-[panel-group-direction=vertical]:flex-col',
        className,
      )}
      {...props}
    />
  );

  const ResizablePanel = ResizablePrimitive.Panel;

  const ResizableHandle = ({
    withHandle,
    className,
    ...props
  }: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
    withHandle?: boolean;
  }) => (
    <ResizablePrimitive.PanelResizeHandle
      className={cn(
        'relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:after:translate-x-0 [&[data-panel-group-direction=vertical]>div]:rotate-90',
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
          <GripVertical className="h-2.5 w-2.5" />
        </div>
      )}
    </ResizablePrimitive.PanelResizeHandle>
  );

  export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
  ```

  - **Do not** modify the snippet — keep it canonical so future shadcn updates can pull cleanly.
  - The `'use client'` directive at the top is required because `react-resizable-panels` uses browser-only state.
  - Verify your `cn` import path matches the repo (`@/lib/utils` is shadcn's default; the repo may use a different alias).

### SSR / hydration sanity

- [ ] Run `pnpm --filter frontend dev`.
- [ ] Open any page in dev (e.g. the dashboard). The library is imported but not yet used; we just need to confirm `pnpm install` and the import path don't blow anything up.
- [ ] Check the browser console for any "did not match" hydration warnings. There shouldn't be any (no usage yet), but the smoke test confirms the build works.
- [ ] Type-check: `pnpm --filter frontend tsc --noEmit` is clean.

### Test that the primitive imports work

- [ ] Create a tiny throwaway test file at `frontend/components/ui/__tests__/resizable.test.tsx` that just imports the three exports and asserts they're defined:

  ```ts
  import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../resizable';

  it('exports the three resizable primitives', () => {
    expect(ResizablePanelGroup).toBeDefined();
    expect(ResizablePanel).toBeDefined();
    expect(ResizableHandle).toBeDefined();
  });
  ```

  This guards against a future bad import alias change. Tiny, fast, useful.

- [ ] `pnpm --filter frontend test` passes.

### Commit / PR

- [ ] Single commit titled `feat(cockpit): add react-resizable-panels + shadcn Resizable primitives`.
- [ ] PR body links back to the cockpit-shell-redesign batch plan and notes "no layout changes yet — that's cs-07".

---

## Out of scope

- **Using the primitives in the cockpit shell** — that's cs-07 + cs-08.
- **Custom-styling the resize handle** — accept the shadcn defaults. If we need theming tweaks, file a follow-up after cs-08 is in.
- **Vertical (row) resizing** — the cockpit is column-only.
- **Pre-existing places that might benefit from resizable panels** (file-tree pane in EHR? sidebar?) — out of scope. Only enable for the cockpit in this batch.

---

## Files expected to touch

**New:**
- `frontend/components/ui/resizable.tsx` (~50 LOC — the shadcn snippet verbatim).
- `frontend/components/ui/__tests__/resizable.test.tsx` (~10 LOC — sanity import test).

**Modified:**
- `frontend/package.json` (+1 dep)
- `pnpm-lock.yaml` (auto-generated)

---

## Notes / open decisions

1. **Why include `withHandle` from the start instead of adding it in cs-08?** It's part of the canonical shadcn snippet. Keeping the snippet verbatim matters more than a 5-line trim. cs-08 will use `withHandle` anyway.
2. **Why a full shadcn primitive file instead of using `react-resizable-panels` directly?** Theming. Our entire UI uses shadcn-style `cn()` + `border-border` semantic tokens. Inlining the styling at the call site (in cs-07) would scatter Tailwind classes across the cockpit; centralizing in `frontend/components/ui/resizable.tsx` keeps shadcn's thin-wrapper convention intact.
3. **`react-resizable-panels` major-version stability.** The library's API has been stable since v1.0. Pinning a specific version is fine; using `^` is also fine and gives us minor / patch updates automatically.
4. **Storybook?** If the repo has Storybook, generating a story for `Resizable` is nice but not required. Skip unless trivial.

---

## References

- **shadcn docs (canonical snippet):** https://ui.shadcn.com/docs/components/resizable
- **`react-resizable-panels` library:** https://github.com/bvaughn/react-resizable-panels
- **Affected files:**
  - `frontend/package.json`
  - `frontend/components/ui/resizable.tsx` (NEW)
- **Successor:** [`task-cs-07-cockpit-shell-fixed-height.md`](./task-cs-07-cockpit-shell-fixed-height.md) — first real consumer.

---

**Owner:** TBD
**Created:** 2026-05-09
**Status:** Pending
