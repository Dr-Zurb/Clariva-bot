# Task ui-B4: Cmd-K global search palette

## 06 May 2026 — Batch [UI system redesign](../plan-ui-system-redesign-batch.md) — Sub-batch B (Shell) — **L item, ~6h**

---

## Task overview

Today, finding "the patient I saw last Tuesday" requires opening Patients, scanning the list, applying filters. Doctors who use Linear / Notion / Raycast / VS Code expect `Cmd+K` to be the universal "go anywhere, find anything" key. This task ships that.

The palette opens via `Cmd+K` / `Ctrl+K` from any dashboard page (and from the header search trigger from B1). It searches one source in V1 — **patients** — and ships a scaffold for V1.1 to add appointments, drugs, and settings as additional sources without refactoring the palette UI.

This is the **most architecturally interesting task in the batch.** The choice between (a) one debounced fetch per query keystroke, (b) a per-source query orchestrator, (c) backend unified-search endpoint — each has different latency / cost / staleness implications.

**Estimated time:** ~6h. Decision turn (Opus) + impl (Sonnet).

**Status:** Shipped (see Ship notes §).

**Hard deps:** A2 (`Command`, `Dialog` primitives — both already pulled in A2's V1 set; `cmdk` peer dep installed via shadcn).

**Soft deps:** B1 (header search trigger) — done: palette opens from header via lifted `paletteOpen` in `DashboardShell` and `onOpenSearch` on `Header`.

**Source:** [U2.10 in plan-ui-system-redesign.md](../../../../Product%20plans/plan-ui-system-redesign.md#u210--cmd-k-global-search).

---

## Model & execution guidance

**Recommended model:** **Opus 4.7 Extra High for the design turn**, then **Sonnet 4.6 Medium for impl** (this is the canonical "Pattern B" workflow from the efficiency guide).

**Why split:** the design call (single-fetch vs per-source vs backend-unified, debounce, recency cache, telemetry) needs reasoning over multiple alternatives. Once decided, the impl is bounded.

**New chat?** **Yes — split into two chats:**

1. **Opus design chat (~30 min):**
   - Pre-load: this task file + the relevant existing search paths in code (paste `rg "search" frontend/lib/api.ts` and `backend/src/services/patient-service.ts` for context). Use Plan Mode if available.
   - Ask: "Decide single-fetch-per-keystroke vs per-source orchestrator vs backend `/v1/search` endpoint. Recommend with trade-offs. Lock the debounce strategy and the cancel-stale-requests pattern. Output a 1-page implementation spec."
   - Take the output of this chat as the locked design.

2. **Sonnet impl chat (~3-4 hours of usage):**
   - Pre-load: this task file + the locked design spec from chat 1 + B1's header (so the agent knows where the trigger lives).
   - Ask: "Implement per the spec. Start with the palette skeleton, then patients source, then debounce + cancel + cache."

**Estimated turns:** 1 Opus design + 4–6 Sonnet impl turns.

**Escalate the impl chat to Opus per-message** if Sonnet ships a fetch-without-cancel and you spot the bug — one Opus message catches the race. Don't switch the whole chat.

**Composer-OK sub-steps:** none.

---

## Acceptance criteria

### Palette UI

- [x] **`frontend/components/layout/GlobalCommandPalette.tsx`** — **new** (~250 LOC). Composes shadcn `CommandDialog` + `CommandInput` + `CommandList` + `CommandEmpty` + `CommandGroup` + `CommandItem`.
- [x] **Open via `Cmd+K` / `Ctrl+K`** from any dashboard page. Listener attached at the `DashboardShell` level (hoist state there, mount the palette there). Detect macOS via `navigator.userAgent` for the keyboard hint, but listen for both shortcuts on every platform.
- [x] **Open via header search trigger** (from B1) by lifting the open state.
- [x] **Close** via Escape (free with `Dialog`), click-outside, or selecting an item.
- [x] **Selecting an item routes via App Router `useRouter` from `next/navigation`** AND closes the palette (equivalent intent to legacy `next/router`).
- [x] **Empty state:** when input is empty, show "Recent" group (last 5 visited patients/appointments — from `localStorage`).
- [x] **No-results state:** "No results for `<query>`."
- [x] **Loading state:** small inline `Skeleton` rows while in-flight; preserves previous results until new ones arrive (stale-while-revalidate).

### Patients source (V1)

- [x] **`frontend/lib/search/patients.ts`** — **new** thin client over the existing patient list/search endpoint. Function:
  ```ts
  export async function searchPatients(
    token: string,
    query: string,
    signal?: AbortSignal
  ): Promise<{ id: string; name: string; phone: string | null; igHandle: string | null }[]>;
  ```
- [x] **Backend route used:** `GET /api/v1/patients?q=<query>&limit=8` (verify this endpoint already supports `q`; if not, this task does NOT add backend work — it falls back to client-side filtering of `GET /api/v1/patients` results, with a TODO to add server-side `q` later. **Do not add backend work in this task.**) — **Shipped path:** client-side filter + module-scope list cache (60s); no backend change.
- [x] **Result rendering:** each `CommandItem` shows the patient name + phone (muted) + a lucide `User` icon. No PHI beyond name + phone, both already visible to the doctor in the patients list.

### Search behavior

- [x] **Debounce 200ms** on input change (per shadcn pattern). Use `useDeferredValue` from React 18 OR a small debounce hook — both fine, pick the simpler.
- [x] **Cancel in-flight fetches** on subsequent keystroke via `AbortController`. The patient client takes a `signal` arg.
- [x] **Cache last 10 queries** in-memory (Map<string, results>); cache TTL 30s. Cheap latency win when doctors backspace.
- [x] **Min query length: 1 character.** Empty → recent. Single character → fetch (the existing list endpoint will narrow). Don't gate at 2+ chars unless you find latency suffers.
- [x] **Open-without-typing:** preserves recent items; first keystroke triggers the first fetch.

### Architecture for V1.1 expansion

- [x] **Source registry pattern:** the palette consumes an array of `Source` objects, each with `{ key, label, icon, search(query, signal): Promise<Item[]> }`. V1 ships only the `patients` source; the registry is structured so adding `appointments`, `drugs`, `settings` is one entry each.
- [x] **`CommandGroup` per source** — the palette renders one group per source's results.
- [x] **Document the V1.1 sources** in a comment block at the top of `GlobalCommandPalette.tsx`:
  ```
  V1.1 sources to add:
  - appointments: GET /api/v1/appointments?q= (existing client-side filter — see AppointmentsListWithFilters)
  - drugs: GET /api/v1/drugs/search (existing — used by DrugAutocomplete)
  - settings: client-side static index of /dashboard/settings/* paths
  ```

### Recents (cheap LRU)

- [x] **`frontend/hooks/useRecentSearches.ts`** — **new** small hook. Stores last 5 selected items in `localStorage` key `clariva.search.recent`. JSON-encoded `Array<{ source: string; id: string; label: string; subtitle?: string; routedTo: string }>`.
- [x] On select, push to the front; dedupe by `(source, id)`; truncate to 5.
- [x] On open with empty query, render the `Recent` group from this store. lucide `Clock` icon prefix on each row.

### Telemetry (counts only, no PHI)

- [x] **`frontend/lib/telemetry/cmdk.ts`** — **new** thin event helper:
  - `cmdk.opened()` on each open.
  - `cmdk.searched(querylen)` once per debounce cycle (count + length only, NOT the query string).
  - `cmdk.selected(source)` on selection.
- [x] **No query content, no patient name, no phone** in telemetry. Counts and lengths only.
- [x] Hooks into the existing telemetry / analytics path (whatever `frontend/lib/ehr/telemetry.ts` uses) if compatible. If no telemetry surface exists, log to console behind `process.env.NODE_ENV === "development"` and ship a stub. — **Shipped:** `console.debug("[ehr:cmdk]", …)` everywhere (same sink pattern as `lib/ehr/telemetry.ts`).

### Mounting in `DashboardShell`

- [x] **`DashboardShell.tsx`** mounts `<GlobalCommandPalette>` as a sibling of `<main>`. Hoist `open` state here, expose `setOpen` to `Header` (for the search trigger click) and to a global keyboard listener.
- [x] Keyboard listener registered in a `useEffect`, cleaned up on unmount; ignores key events when an `<input>` / `<textarea>` is focused (so doctors typing into the Rx form don't accidentally open the palette).

### General

- [x] Type-check + lint clean (`npx tsc --noEmit`, `npx next lint` on ship date).
- [x] No console errors.
- [x] Open / search / select / close round-trip works in <1s on a hot cache.
- [x] Cmd+K opens palette in <50ms (just a state flip).
- [x] Mobile: palette opens correctly at narrow widths (full-width sheet vs centered dialog — shadcn `CommandDialog` handles this; verify).

---

## Out of scope

- **Adding `appointments`, `drugs`, `settings` sources.** V1.1 — leave the source-registry hook ready, but don't fan-scope.
- **Backend unified `/v1/search` endpoint.** Per the design call: not needed for V1 with one source.
- **Fuzzy / semantic search.** V1 uses the existing prefix/substring patient search.
- **Server-side recents.** localStorage is per-device — fine.
- **Result preview pane** (right side of palette showing the selected item's detail). Out of V1.

---

## Files expected to touch

**Frontend:**
- `frontend/components/layout/GlobalCommandPalette.tsx` — **new** (~250 LOC).
- `frontend/lib/search/patients.ts` — **new** (~50 LOC).
- `frontend/hooks/useRecentSearches.ts` — **new** (~60 LOC).
- `frontend/lib/telemetry/cmdk.ts` — **new** (~30 LOC).
- `frontend/components/layout/DashboardShell.tsx` — **edit** (~30 LOC: hoist `open` state + mount palette + keyboard listener).
- `frontend/components/layout/Header.tsx` — **edit** (~10 LOC: wire trigger click to `setOpen(true)`; remove the disabled / feature-flag-hidden state from B1 if it was there).
- `frontend/components/ui/command.tsx` — **edit** (`CommandDialog` forwards optional `shouldFilter`; palette passes `false` for async results).

**Backend / migrations / tests:** none. **Do not** add a backend route in this task.

---

## Notes / open decisions

1. **Why one source in V1.** Cmd-K is a habit-forming product affordance. Better to ship one source that works perfectly than four sources where the user can't predict which one matched. Patients is the highest-leverage source — the most-asked "where is …" question.
2. **Why `cmdk` (the engine behind shadcn `Command`).** Already pulled by A2; battle-tested; small bundle. Don't roll your own list/keyboard nav.
3. **Why `useDeferredValue` may suffice over a debounce hook.** React's deferred-value hook is built for this exact case (stale-input updates without blocking renders). If the agent picks this, accept it — slightly different semantics but ends at the same UX.
4. **Recents in localStorage.** Per-device, per-doctor; no PHI concern (recent IDs are not identifiable without the doctor's auth — the IDs are useless without the API).
5. **Telemetry is non-PHI only.** Hard rule: no query strings, no patient identifiers in events. The efficiency guide's hard-rule list applies — anything touching PHI defaults to Opus, but counts-only is safe for Sonnet.
6. **Search trigger fallback if B1 hasn't shipped yet.** B4 can land before B1; in that case, the keyboard shortcut is the only entry. Once B1 ships, the trigger lights up.

---

## Ship notes

**Shipped:** 2026-05-06.

**Implementation summary:**

- `GlobalCommandPalette` + `CommandDialog` with `shouldFilter={false}` (extended `frontend/components/ui/command.tsx`) so async patient results are not hidden by cmdk’s built-in filter.
- Patients: client-side filter over cached `GET /api/v1/patients` list (`frontend/lib/search/patients.ts`); palette-level query cache (10 entries, 30s TTL).
- Debounce: `useDeferredValue`; cancel: `AbortController` per search cycle.
- Shortcuts: `DashboardShell` toggles palette on `Cmd/Ctrl+K`; skips when focus is in `input` / `textarea` / `select` / `contenteditable`.
- Recents: `frontend/hooks/useRecentSearches.ts` (`clariva.search.recent`).
- Telemetry: `frontend/lib/telemetry/cmdk.ts` (`console.debug("[ehr:cmdk]", …)`).

---

## References

- **Batch plan:** [plan-ui-system-redesign-batch.md § Sub-batch B](../plan-ui-system-redesign-batch.md#sub-batch-b--shell-4-items-15-days)
- **Source item:** [U2.10 in plan-ui-system-redesign.md](../../../../Product%20plans/plan-ui-system-redesign.md#u210--cmd-k-global-search)
- **Hard deps:** [task-ui-A2-shadcn-bootstrap.md](./task-ui-A2-shadcn-bootstrap.md)
- **Soft dep:** [task-ui-B1-header-redesign.md](./task-ui-B1-header-redesign.md)
- **Sibling tasks:** B1 (header), B2 (sidebar regrouping), B3 (sidebar counts/collapse)
- **shadcn `Command` docs:** https://ui.shadcn.com/docs/components/command
- **Cost-aware model strategy — Pattern B (split design / impl):** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md § Pattern B](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md#pattern-b-new-feature--no-spec-yet)

---

**Owner:** TBD  
**Created:** 2026-05-06  
**Shipped:** 2026-05-06  
**Status:** Shipped.
