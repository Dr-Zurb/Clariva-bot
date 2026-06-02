# Task ppr-08: Layout helpers module + one-time localStorage seed

## 13 May 2026 — Batch [Patient profile shell rebuild](../plan-patient-profile-shell-rebuild-batch.md) — Wave 3, Lane α step 0 — **S, ~2h**

---

## Task overview

Author `frontend/lib/patient-profile/layout.ts` — the pure helper module that owns the new layout shape's validation, comparison, and **legacy → v2 translation** for the one-time localStorage seed.

The `useShellLayout` hook from ppr-02 already inlines a `validateLayout`. ppr-08 expands the surface with:

1. The **legacy seed reader**: on first v2 load, read the old `react-resizable-panels:cockpit-shell` + `cockpit-layout:v1:cockpit-shell` keys, translate to the new shape, write to `patient-profile:v1:layout`, mark the seed done so we never run it twice.
2. The **default-layout builder** so `<PatientProfilePage>` can construct a default from any `PaneDefinition[]`.
3. `layoutsEqual()` and `buildPresetLayout()` helpers that ppr-09 consumes.

**Estimated time:** ~2h.

**Status:** Pending.

**Hard deps:** ppr-02 (types live there).

**Source:** R3.1 + R3.2 + DL-9 in [Product plans/plan-patient-profile-shell-rebuild.md](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh chat. Pre-load:
- This task file.
- `frontend/lib/patient-profile/types.ts` (ppr-02 output — the shape we target).
- `frontend/lib/consultation/cockpit-layout.ts` (the LEGACY shape — we read it once for the seed translation, then never again).

**Estimated turns:** 3–4 turns.

---

## Acceptance criteria

### New file: `frontend/lib/patient-profile/layout.ts`

- [ ] Create the module with these exports:

  ```ts
  import type {
    PaneDefinition,
    PaneRuntimeState,
    PatientProfileLayout,
  } from "./types";

  /** localStorage keys touched by this module. */
  export const LAYOUT_STORAGE_KEY = "patient-profile:v1:layout";
  export const WALKIN_LAYOUT_STORAGE_KEY = "patient-profile:v1:walkin-layout";
  export const LEGACY_SEEDED_KEY = "patient-profile:v1:seeded";

  /** Legacy keys read once during the seed pass. */
  export const LEGACY_RRP_KEY = "react-resizable-panels:cockpit-shell";
  export const LEGACY_RRP_WALKIN_KEY = "react-resizable-panels:cockpit-shell-walkin";
  export const LEGACY_COCKPIT_LAYOUT_KEY = "cockpit-layout:v1:cockpit-shell";
  export const LEGACY_COCKPIT_LAYOUT_WALKIN_KEY = "cockpit-layout:v1:cockpit-shell-walkin";

  /**
   * Build a fresh `PatientProfileLayout` from a `PaneDefinition[]` using the
   * panes' `naturalSizePct` defaults. Used by `<PatientProfilePage>` to seed
   * the hook on first load (and after a "Reset layout" preset).
   */
  export function buildDefaultLayout(panes: PaneDefinition[]): PatientProfileLayout { ... }

  /** Deep-compare two layouts. Used by ppr-09 to mark the active preset in the menu. */
  export function layoutsEqual(a: PatientProfileLayout, b: PatientProfileLayout): boolean { ... }

  /**
   * One-time legacy-key reader. Returns a `PatientProfileLayout` translated
   * from whichever legacy key(s) exist, or `null` if nothing to seed.
   *
   * Tries in order:
   *   1. `cockpit-layout:v1:cockpit-shell` — full v1 layout (slots + widths + collapsed).
   *   2. `react-resizable-panels:cockpit-shell` — widths-only fallback.
   *   3. Nothing found → return `null`; caller falls back to `buildDefaultLayout`.
   *
   * After translation, the legacy keys are NOT deleted (the v1 shell needs them
   * during the kill-switch window). The presence of `patient-profile:v1:seeded`
   * is the only thing that gates re-running this function.
   *
   * @param panes The pane definitions in their default order — used to map
   *              the legacy `slots` array to v2 pane ids and to fall back on
   *              `naturalSizePct` for panes without a saved width.
   * @param walkin Whether to read the walk-in shape instead of the 3-pane shape.
   */
  export function readLegacyLayoutOnce(opts: {
    panes: PaneDefinition[];
    walkin?: boolean;
  }): PatientProfileLayout | null { ... }

  /** Idempotent helper: returns true the first time it's called per browser; false thereafter. */
  export function shouldRunSeed(): boolean {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(LEGACY_SEEDED_KEY) !== "1";
  }

  /** Mark the seed as run so we never re-translate the legacy keys. */
  export function markSeedDone(): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(LEGACY_SEEDED_KEY, "1");
  }
  ```

### Translation contract: legacy `cockpit-layout:v1:cockpit-shell` → v2

- [ ] Legacy shape (from `frontend/lib/consultation/cockpit-layout.ts`):

  ```ts
  {
    slots: ["chart" | "body" | "rx", "chart" | "body" | "rx", "chart" | "body" | "rx"], // permutation
    widths: [number, number, number], // % per slot
    collapsed: { chart: boolean, body: boolean, rx: boolean },
    middleCollapseSide: "left" | "right" | null, // DROPPED in v2
  }
  ```

- [ ] v2 shape:

  ```ts
  {
    version: 2,
    paneOrder: string[],
    paneState: Record<id, { sizePct, collapsed }>,
  }
  ```

- [ ] Translation rule:
  - `paneOrder = slots` (string array; identical).
  - For each slot index `i`: `paneState[slots[i]] = { sizePct: widths[i], collapsed: collapsed[slots[i]] }`.
  - **`middleCollapseSide` is DROPPED.** In v2, the middle column uses uniform collapse (DL-6). If the legacy payload had `middleCollapseSide !== null`, the corresponding pane (`slots[1]`) is treated as expanded in v2 unless its `collapsed[slots[1]]` is also true. (Edge case: middle directional collapse without the underlying flag was a buggy state; drop it.)

### Translation contract: legacy `react-resizable-panels:cockpit-shell` → v2

- [ ] If the full `cockpit-layout:v1:*` key is absent but the widths-only key exists:
  - Use `panes` argument as the `paneOrder` (default order: `["chart", "body", "rx"]`).
  - Parse the legacy JSON: `{ "cockpit-col-chart": pct, "cockpit-col-body": pct, "cockpit-col-rx": pct }` (or whatever the actual library shape is — verify in code).
  - Map each `cockpit-col-{type}` key to the v2 pane id by stripping the `cockpit-col-` prefix.
  - All `collapsed` flags default to `false` (the legacy key doesn't store collapse).

### Failure modes

- [ ] If JSON parse fails OR `validateLayout` rejects the translated payload, return `null` (don't crash). The caller falls back to `buildDefaultLayout`.
- [ ] Telemetry hook: if a seed failure happens, log a single `console.warn` with the failure mode (`"legacy-parse-fail"` / `"legacy-translation-fail"`). Don't surface to the user.

### Wire the seed reader into `<PatientProfilePage>`

- [ ] In `PatientProfilePage.tsx`, add a `useEffect` that on first mount:
  1. Checks `shouldRunSeed()` — if false, skip.
  2. Calls `readLegacyLayoutOnce({ panes, walkin: !hasPatientId })`.
  3. If non-null, calls the hook's `applyLayout(seed)` to install it.
  4. Calls `markSeedDone()`.

  Wrap in a try/catch so a seed error never breaks the page.

### Tests

- [ ] Unit tests at `frontend/lib/patient-profile/__tests__/layout.test.ts`:
  - **Fixtures:** at least four legacy payloads — full v1 (with all three permutations), walk-in v1, widths-only v1, malformed.
  - For each fixture, assert the translated v2 payload validates and has the expected `paneOrder` + `paneState`.
  - `middleCollapseSide` is dropped in every translation.
  - `buildDefaultLayout` produces a valid v2 layout for a 3-pane definition and a 2-pane (walk-in) definition.
  - `layoutsEqual` reflexive / symmetric.
  - `shouldRunSeed` flips to `false` after `markSeedDone()`.
- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.
- [ ] `pnpm --filter frontend vitest run lib/patient-profile/__tests__/layout.test.ts` — all green.

### Manual smoke

- [ ] **Pre-condition:** save a custom layout on `/v1` (`/dashboard/appointments/[id]`) by dragging columns to a non-default size + reordering. Reload to confirm v1 saves it.
- [ ] Switch to `/v2`. The shell should hydrate with the same widths you set on `/v1`. (The seed ran on first v2 load.)
- [ ] Reload `/v2`. Layout still persists. (Seed didn't run a second time — `LEGACY_SEEDED_KEY` is set.)
- [ ] Switch back to `/v1`. v1 still works with its saved layout. (The seed read from but did not delete the legacy keys.)

---

## Out of scope

- **Preset translation.** ppr-09 handles `doctor_settings.cockpit_layout_presets`.
- **Deleting the legacy localStorage keys.** Never. They stay until natural browser eviction. (After ppr-14 deletes the v1 shell, the keys are dead data but harmless.)
- **Cross-tab sync via `BroadcastChannel`.** Out of scope (DL-9 multi-device sync rules).

---

## Files expected to touch

**New:**
- `frontend/lib/patient-profile/layout.ts` (~180 LOC).
- `frontend/lib/patient-profile/__tests__/layout.test.ts` (~160 LOC).

**Modified:**
- `frontend/components/patient-profile/PatientProfilePage.tsx` (~+15 LOC — the seed `useEffect`).

**Tests:** none removed.

---

## Notes / open decisions

1. **Why not delete the legacy keys after seeding?** v1 is still shipping until ppr-14. Deleting them would break v1's persistence. Keys evict naturally when the browser hits its localStorage quota; until then, they're 1–2KB of dead data per browser — acceptable.
2. **Why three legacy keys (full + widths-only + walk-in versions)?** Different doctors saved layouts at different points in cc-04's lifecycle. The full `cockpit-layout:v1:*` key is the canonical store; the `react-resizable-panels:cockpit-shell` key is a backwards-compat fallback that cc-04 maintained. We honour both.
3. **Why drop `middleCollapseSide` instead of trying to preserve directional collapse in v2?** DL-6 explicitly drops directional collapse. The doctor will see their middle pane expanded in v2 — that's the new behaviour. If they want it collapsed, the chevron is right there. Trying to preserve the legacy state would re-introduce the directional code paths the rebuild is here to remove.
4. **Why an idempotent `shouldRunSeed()` instead of running unconditionally?** Running unconditionally would overwrite any v2 layout the doctor has set after the first v2 load. The seed is a one-shot migration, not a sync.

---

## References

- **Affected files:**
  - new `frontend/lib/patient-profile/layout.ts`
  - new `frontend/lib/patient-profile/__tests__/layout.test.ts`
  - mod `frontend/components/patient-profile/PatientProfilePage.tsx` (+seed effect)
- **Source decisions:** [Product plans/plan-patient-profile-shell-rebuild.md § DL-7, DL-9](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md), items R3.1 + R3.2.
- **Reference (legacy shape, read-only):** `frontend/lib/consultation/cockpit-layout.ts`.
- **Next task:** [`task-ppr-09-preset-translation-and-apply.md`](./task-ppr-09-preset-translation-and-apply.md) — fresh chat.

---

**Owner:** TBD
**Created:** 2026-05-13
**Status:** Pending
