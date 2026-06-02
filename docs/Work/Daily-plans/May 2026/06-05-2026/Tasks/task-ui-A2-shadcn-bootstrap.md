# Task ui-A2: Bootstrap shadcn/ui primitives + refactor existing `components/ui/`

## 06 May 2026 — Batch [UI system redesign](../plan-ui-system-redesign-batch.md) — Sub-batch A (Foundation) — **M item, ~5h**

---

## Task overview

Today, [`frontend/components/ui/`](../../../../../frontend/components/ui/) holds 3 utility files: [`SaveButton.tsx`](../../../../../frontend/components/ui/SaveButton.tsx), [`FieldLabel.tsx`](../../../../../frontend/components/ui/FieldLabel.tsx), [`UnsavedLeaveGuard.tsx`](../../../../../frontend/components/ui/UnsavedLeaveGuard.tsx). There is no `Card`, `Button`, `Badge`, `Input`, `Tabs`, `Dialog`, `Sheet`, `DropdownMenu`, `Tooltip`, `Command`, `Skeleton`, or `Separator`. As a result, every page re-implements these inline with raw Tailwind classes — see [`AppointmentsListWithFilters.tsx`](../../../../../frontend/components/appointments/AppointmentsListWithFilters.tsx) and [`appointments/[id]/page.tsx`](../../../../../frontend/app/dashboard/appointments/%5Bid%5D/page.tsx) for the worst offenders.

This task initializes shadcn/ui in the project, generates the 14 primitives every later task in this batch needs, and refactors the existing 3 utility files to compose those primitives instead of using raw classes. After this task ships, B / C / D have a real component library to compose against.

**Estimated time:** ~5h (init + 14 component pulls + 3 refactors + smoke test).

**Status:** Drafted.

**Hard deps:** A1 (tokens layer — shadcn components import `cn()` and reference `bg-background` / `text-foreground` etc.).

**Soft deps:** none.

**Source:** [U1.1 in plan-ui-system-redesign.md](../../../../Product%20plans/plan-ui-system-redesign.md#u11--bootstrap-shadcnui-in-componentsui).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**Why this tier:** Mostly mechanical (init wizard answers + `npx shadcn add ...` × 14 + 3 small refactors). The refactor of `SaveButton` etc. needs basic judgment about Button variants, well within Sonnet's range.

**New chat?** Yes — fresh chat for this task.

**Pre-load (paste at start):**

- This task file (full).
- A1's resolved `frontend/tailwind.config.ts` and `frontend/app/globals.css`.
- Current contents of the 3 existing `frontend/components/ui/*.tsx` files.
- One sentence: "shadcn New York style, RSC-compatible, default `cn` location at `frontend/lib/utils.ts` (already exists)."

**Estimated turns:** 2–3 (init + adds + refactors).

**Escalate to Opus if:** shadcn init asks an ambiguous question (e.g., RSC + Tailwind v4 detection) AND the agent's answer doesn't match the existing project shape (Next 14 + Tailwind v3). Pause, look at the actual env, escalate that one message.

**Composer-OK sub-steps:** none. (The init wizard's outputs need a code-aware model; Composer is fine for the status emoji update post-ship.)

---

## Acceptance criteria

### shadcn init

- [ ] **`npx shadcn@latest init`** run in `frontend/` with these answers:
  - Style: **New York**.
  - Base color: **slate** (matches the A1 default `--background` / `--foreground` triples; will inherit from CSS vars regardless).
  - CSS variables: **Yes**.
  - `tailwind.config.*` location: detected.
  - `components.json` written at `frontend/components.json`.
  - Components alias: `@/components`.
  - Utils alias: `@/lib/utils` (already exists; do not overwrite).
- [ ] **`frontend/components.json`** committed.
- [ ] **`frontend/lib/utils.ts`** preserved — shadcn's init exports `cn` from there; if a duplicate `cn` is generated, dedupe to the existing file.

### Primitives generated (14 components)

- [ ] **`npx shadcn@latest add button card badge input select tabs dialog sheet dropdown-menu tooltip command skeleton separator scroll-area`** — generates 14 files under `frontend/components/ui/`.
- [ ] Each generated file is **untouched** beyond shadcn's defaults — do NOT prematurely customize. Variants come later as needed.
- [ ] `cmdk` and other peer deps required by `command` / `dialog` etc. are auto-installed by shadcn.

### Refactor existing 3 utility files

- [ ] **`frontend/components/ui/SaveButton.tsx`** — refactored to compose the new `Button` primitive. Public API preserved (props, behavior). Spinner / loading-state visual replaced with the same lucide `Loader2` icon shadcn convention uses (depends on A4; if A4 hasn't shipped, emit a TODO and use the existing inline SVG; A4 will swap).
- [ ] **`frontend/components/ui/FieldLabel.tsx`** — refactored to be a thin wrapper over shadcn's `Label` (or directly use the styling pattern if `Label` isn't part of the 14 — add it via `npx shadcn add label` if needed). Public API preserved.
- [ ] **`frontend/components/ui/UnsavedLeaveGuard.tsx`** — if it renders a confirmation, use the new `Dialog` primitive. If it's pure-logic (route guard hook), no UI change needed; just verify it still type-checks.
- [ ] No call sites change — every existing import still resolves.

### Defensive housekeeping

- [ ] **`frontend/lib/utils.ts`** verified to export `cn(...)` matching shadcn's signature (`clsx` + `tailwind-merge`). Already does — confirm.
- [ ] **`tailwind.config.ts`** `content` array includes the shadcn-added paths if not already (`./components/**/*.{ts,tsx}` covers them).
- [ ] **`tailwindcss-animate`** plugin loaded (shipped in A1; verify it's still in `plugins`).
- [ ] **No `tailwindcss-animate` peer dep version mismatch** with shadcn-installed version.

### Smoke test

- [ ] Drop a temporary `<Button>Hello</Button>` into `app/dashboard/page.tsx` for one boot, verify it renders, then **revert that line** before committing.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npx next lint` clean.
- [ ] `npm run dev` boots without errors.

---

## Out of scope

- **Adding more primitives later (e.g., `Toast`, `Toggle`, `Avatar`).** Add them just-in-time when a task needs them; bloating now is wasteful.
- **Customizing variant colors / sizes beyond shadcn defaults.** Do that lazily as components are used in B/C/D.
- **Migrating existing inline buttons / cards everywhere.** That's the post-batch migration playbook; this task only refactors the 3 files in `components/ui/`.
- **Theming for the `.dark` palette.** Deferred per U5.4.

---

## Files expected to touch

**Frontend:**
- `frontend/components.json` — **new** (shadcn init output).
- `frontend/components/ui/{button,card,badge,input,select,tabs,dialog,sheet,dropdown-menu,tooltip,command,skeleton,separator,scroll-area,label}.tsx` — **new** (14–15 files; `label` only if needed by `FieldLabel` refactor).
- `frontend/components/ui/SaveButton.tsx` — **edit** (compose `Button`).
- `frontend/components/ui/FieldLabel.tsx` — **edit** (compose `Label`).
- `frontend/components/ui/UnsavedLeaveGuard.tsx` — **edit** if it renders UI; else verify only.
- `frontend/lib/utils.ts` — **verify** (no edits expected).
- `frontend/package.json` + `frontend/package-lock.json` — **edit** (shadcn-pulled deps: `class-variance-authority`, `cmdk`, `@radix-ui/*`).

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **shadcn version pinning.** shadcn is a CLI that emits code, not a runtime dep — version drift on the CLI doesn't break already-emitted components. Use `@latest` for init; commit the emitted code; we own it.
2. **New York vs Default style.** New York is denser (matches U0.4 density target) and the modern shadcn default. Stick with it unless a brand reason emerges.
3. **`Label` is a separate primitive.** If `FieldLabel` is more than label-styled text (e.g., handles tooltips, required-asterisk), pull `Label` and compose. Don't fight the existing `FieldLabel` API — the refactor is internal.
4. **Why Tabs is in the V1 set.** D1 (appointment detail) and D2 (patient detail) both lean on `Tabs`. Pre-pulling avoids a dependency thrash mid-Sub-batch-D.
5. **Why Command is in the V1 set.** B4 (Cmd-K palette) needs it. Pre-pulling means B4 has zero new shadcn pulls.
6. **`@radix-ui/*` peer deps.** Each primitive pulls its own Radix peer. shadcn handles the install — verify the lockfile delta is clean (no duplicate Radix versions).

---

## References

- **Batch plan:** [plan-ui-system-redesign-batch.md § Sub-batch A](../plan-ui-system-redesign-batch.md#sub-batch-a--foundation-5-items-15-days)
- **Source item:** [U1.1 in plan-ui-system-redesign.md](../../../../Product%20plans/plan-ui-system-redesign.md#u11--bootstrap-shadcnui-in-componentsui)
- **Hard dep:** [task-ui-A1-design-tokens.md](./task-ui-A1-design-tokens.md)
- **Consumers:** every B/C/D task — Header (B1) imports `Button`, `DropdownMenu`; Sidebar (B2) imports `Button`, `Tooltip`; Cmd-K (B4) imports `Command`, `Dialog`; Cockpit (C*) imports `Card`, `Badge`, `Skeleton`, `Tabs`; Reference pages (D*) import `Tabs`, `Card`, `Badge`.
- **shadcn docs:** https://ui.shadcn.com/docs/installation/next
- **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

**Owner:** TBD  
**Created:** 2026-05-06  
**Status:** Shipped (2026-05-06).
