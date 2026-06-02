# Task ppr-09: Preset translation + apply path

## 13 May 2026 — Batch [Patient profile shell rebuild](../plan-patient-profile-shell-rebuild-batch.md) — Wave 3, Lane α step 1 — **M, ~3h**

---

## Task overview

Port the layout-preset system from v1 to v2. The presets table (`doctor_settings.cockpit_layout_presets`) stays untouched (DL-10 — no backend changes). The translation happens client-side:

1. **Built-in presets** (Triage / Consult / Document) are re-authored in the v2 shape.
2. **Custom user presets** stored in the legacy v1 shape are translated on read; new writes from v2 go in with a `version: 2` tag so the next reader knows not to translate again.
3. **`usePatientProfilePresets`** hook owns the load / apply / save / delete surface; mounts the existing `<SavePresetDialog>` and `<ManagePresetsDialog>` modals from cc-10.
4. **Layout dropdown** in `<CockpitHeader>` continues to receive its preset list + handlers from the hook.

**Estimated time:** ~3h (1h translation helper, 1h hook, 1h wire-up to header).

**Status:** Pending.

**Hard deps:** ppr-07 (panes wired), ppr-08 (layout module exports `buildPresetLayout`).

**Source:** R3.3 + DL-8 in [Product plans/plan-patient-profile-shell-rebuild.md](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh chat. Pre-load:
- This task file.
- `frontend/hooks/useCockpitPresets.ts` (the existing v1 hook — the pattern we mirror).
- `frontend/lib/consultation/cockpit-layout.ts` (`BUILT_IN_PRESETS` const — the v1 source for re-authoring built-ins).
- `frontend/lib/patient-profile/types.ts` (ppr-02 output).
- `frontend/lib/patient-profile/layout.ts` (ppr-08 output).
- `frontend/lib/api.ts` (where the `/v1/settings/doctor/cockpit-presets` GET / PUT / DELETE calls live).
- `frontend/components/consultation/cockpit/SavePresetDialog.tsx` + `ManagePresetsDialog.tsx` (reused as-is).

**Estimated turns:** 5–7 turns.

---

## Acceptance criteria

### Re-author built-in presets in `frontend/lib/patient-profile/built-in-presets.ts`

- [ ] Create the file. Re-author the three built-ins from `BUILT_IN_PRESETS` in v2 shape:

  ```ts
  import type { PatientProfileLayout } from "./types";

  export interface BuiltInPreset {
    id: "built-in:triage" | "built-in:consult" | "built-in:document";
    label: string;
    description: string;
    layout: PatientProfileLayout;
    hotkey: string; // matches CC-D5
  }

  export const BUILT_IN_PRESETS: readonly BuiltInPreset[] = [
    {
      id: "built-in:triage",
      label: "Triage",
      description: "Chart focused — wide chart rail, narrow Rx",
      layout: {
        version: 2,
        paneOrder: ["chart", "body", "rx"],
        paneState: {
          chart: { sizePct: 40, collapsed: false },
          body: { sizePct: 50, collapsed: false },
          rx: { sizePct: 10, collapsed: true },
        },
      },
      hotkey: "mod+shift+1",
    },
    {
      id: "built-in:consult",
      label: "Consult",
      description: "Balanced 3-column — default layout",
      layout: {
        version: 2,
        paneOrder: ["chart", "body", "rx"],
        paneState: {
          chart: { sizePct: 26, collapsed: false },
          body: { sizePct: 48, collapsed: false },
          rx: { sizePct: 26, collapsed: false },
        },
      },
      hotkey: "mod+shift+2",
    },
    {
      id: "built-in:document",
      label: "Document",
      description: "Rx focused — wide Rx, chart collapsed",
      layout: {
        version: 2,
        paneOrder: ["chart", "body", "rx"],
        paneState: {
          chart: { sizePct: 10, collapsed: true },
          body: { sizePct: 35, collapsed: false },
          rx: { sizePct: 55, collapsed: false },
        },
      },
      hotkey: "mod+shift+3",
    },
  ];
  ```

### Translation helper in `frontend/lib/patient-profile/preset-translation.ts`

- [ ] New file. Single pure helper:

  ```ts
  import type { PatientProfileLayout } from "./types";

  /**
   * Translate a legacy v1-shape preset payload to v2. The legacy shape is
   * the `cockpit-layout` snapshot stored in
   * `doctor_settings.cockpit_layout_presets` JSONB rows shipped by cc-08.
   *
   * Returns null on unrecognised shapes — caller falls back to skipping the
   * preset (UI shows a "Preset corrupt" toast at most once per session;
   * never drops the doctor's data, just refuses to apply it).
   */
  export function translateLegacyPreset(raw: unknown): PatientProfileLayout | null {
    // 1. v2-tagged row: return as-is (after validation).
    if (raw && typeof raw === "object" && (raw as { version?: number }).version === 2) {
      return validatePatientProfileLayout(raw); // re-uses validate from useShellLayout
    }
    // 2. v1-shape row: translate.
    const r = raw as Record<string, unknown> | null;
    if (!r) return null;
    const slots = r.slots;
    const widths = r.widths;
    const collapsed = r.collapsed as Record<string, boolean> | undefined;
    if (!Array.isArray(slots) || !Array.isArray(widths) || !collapsed) return null;
    if (slots.length !== widths.length) return null;
    const paneOrder = slots.map((s) => String(s));
    const paneState: Record<string, { sizePct: number; collapsed: boolean }> = {};
    for (let i = 0; i < slots.length; i++) {
      const id = String(slots[i]);
      paneState[id] = {
        sizePct: Number(widths[i]) || 0,
        collapsed: Boolean(collapsed[id]),
      };
    }
    return {
      version: 2,
      paneOrder,
      paneState,
    };
  }
  ```

- [ ] Same `middleCollapseSide`-dropping rule as ppr-08 — translation ignores the legacy field.

### Hook: `frontend/hooks/usePatientProfilePresets.ts`

- [ ] Mirror the v1 `useCockpitPresets` surface:

  ```ts
  export interface UsePatientProfilePresetsResult {
    /** Built-in presets (always 3). */
    builtIns: readonly BuiltInPreset[];
    /** Custom user presets (≤ 5). Loaded from backend on mount. */
    customs: CustomPreset[];
    /** True while the initial fetch is in flight. */
    loading: boolean;
    /** Apply a preset to the layout state. Returns true on success. */
    applyPreset: (presetId: string) => boolean;
    /** Save the current layout as a new custom preset. Soft-cap at 5. */
    savePreset: (name: string, currentLayout: PatientProfileLayout, opts?: { evictId?: string }) => Promise<void>;
    /** Delete a custom preset by id. */
    deletePreset: (id: string) => Promise<void>;
    /** Rename a custom preset. */
    renamePreset: (id: string, newName: string) => Promise<void>;
  }
  ```

- [ ] Implementation:
  - `useEffect` on mount: `GET /v1/settings/doctor/cockpit-presets` (same endpoint as v1; no backend change).
  - For each row, run `translateLegacyPreset(row.layout)`. Discard nulls (skip + warn).
  - **Writes always tag with `version: 2`.** Body shape: `{ id, name, layout: PatientProfileLayout (with version: 2), createdAt }`. Backend persists JSONB; no schema impact.
  - `savePreset` enforces the soft-cap-of-5 via the same eviction confirm pattern as cc-10's `<SavePresetDialog>` (the dialog stays the same; just receives a v2 layout).
  - `applyPreset`: look up the preset, validate via `validateLayout`, call the shell hook's `applyLayout(layout)`.
  - `applyPreset` for built-ins: always succeeds (built-ins are hard-coded valid).

### Wire to `<PatientProfilePage>`

- [ ] In `<PatientProfilePage>`, instantiate the hook + thread `applyPreset` / `savePreset` / etc. into `<CockpitHeader>` (the props that ppr-07 stubbed with no-ops).
- [ ] `<CockpitHeader>` already renders the Layout dropdown (cc-06) and the Save / Manage dialog triggers (cc-10). v2 changes nothing about those components — just supplies the new handlers.

### Tests

- [ ] Unit tests at `frontend/lib/patient-profile/__tests__/preset-translation.test.ts`:
  - **Fixtures:** at least 5 preset rows — built-in-ish v1 shape, custom v1 with chart-body-rx, custom v1 with body-chart-rx, walk-in v1, malformed.
  - Translation produces valid v2 for every legitimate input.
  - Translation returns null for malformed input.
  - v2-tagged rows pass through unchanged.
- [ ] Hook tests in `frontend/hooks/__tests__/usePatientProfilePresets.test.ts`:
  - Mocked fetch returns mixed v1 + v2 rows; hook surfaces all as v2.
  - `savePreset` POSTs a v2-tagged body.
  - Soft-cap eviction confirm fires on 6th save.
- [ ] `pnpm --filter frontend tsc --noEmit` clean. `pnpm --filter frontend lint` clean.

### Manual smoke

- [ ] **Pre-condition:** save a custom preset on `/v1` (use the existing Save preset dialog).
- [ ] On `/v2`: open the Layout dropdown. The custom preset appears. Click it → layout applies correctly (same widths + reorder + collapse as on v1).
- [ ] On `/v2`: change the layout (drag, collapse). Save it as a new custom preset. Reload `/v2` → preset persists and applies.
- [ ] On `/v1`: open the Layout dropdown. The v2-saved preset appears AND applies correctly (v1 reads its own shape — the cc-04 `BUILT_IN_PRESETS` layout shape is what v1 expects, so a v2-tagged row would fail v1's validation if it tried to apply it). **Decision (see Notes 2 below):** v1 ignores v2-tagged rows silently. The user sees only their original v1 presets on v1, plus any v2 presets fade in as "Untitled v2 preset" or similar fallback. Acceptable during the kill-switch window.

---

## Out of scope

- **Backend changes.** DL-10. The endpoint + schema stay.
- **Adding hotkeys for custom presets.** CC-D5 lock from cc-11. Built-ins only.
- **Cross-device realtime sync.** DL-9 + CC-D9. Last-write-wins.

---

## Files expected to touch

**New:**
- `frontend/lib/patient-profile/built-in-presets.ts` (~60 LOC).
- `frontend/lib/patient-profile/preset-translation.ts` (~80 LOC).
- `frontend/hooks/usePatientProfilePresets.ts` (~150 LOC).
- `frontend/lib/patient-profile/__tests__/preset-translation.test.ts` (~120 LOC).
- `frontend/hooks/__tests__/usePatientProfilePresets.test.ts` (~150 LOC).

**Modified:**
- `frontend/components/patient-profile/PatientProfilePage.tsx` (+30 LOC — instantiate the hook, thread props into `<CockpitHeader>`).

**Tests:** none removed.

---

## Notes / open decisions

1. **Why client-side translation instead of a one-time backend migration?** DL-10. A backend migration would require touching the schema (`version` column or a CHECK constraint), running through review, and coordinating with prod. Client-side translation is a 60-LOC file with zero backend risk.
2. **Why does v1 silently ignore v2-tagged presets instead of translating in reverse?** During the kill-switch window, doctors using `/v1` shouldn't see corrupt UI for presets they saved on `/v2`. Reverse-translation (v2 → v1 shape) is feasible but adds bidirectional drift risk. Silent-ignore is acceptable for a 1-week window — once the v1 shell is deleted in ppr-14, the question is moot.
3. **Why no `version: 1` discriminator?** v1's existing preset writes don't tag with a version. We can't retroactively re-tag them. v2 adopts the new tag forward; the absence of a tag implies v1-shape.
4. **Why does `applyPreset` return `boolean` instead of throwing?** Apply failures are deterministic (malformed preset → skip + toast). Throwing would force every caller to wrap in try/catch; `false` is a clean opt-out signal.

---

## References

- **Affected files:**
  - new `frontend/lib/patient-profile/built-in-presets.ts`
  - new `frontend/lib/patient-profile/preset-translation.ts`
  - new `frontend/hooks/usePatientProfilePresets.ts`
  - new tests (×2)
  - mod `frontend/components/patient-profile/PatientProfilePage.tsx`
- **Source decisions:** [Product plans/plan-patient-profile-shell-rebuild.md § DL-8, DL-10](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md), item R3.3.
- **Pattern source:** `frontend/hooks/useCockpitPresets.ts`.
- **Next task:** [`task-ppr-10-hotkeys-and-walkin-mode.md`](./task-ppr-10-hotkeys-and-walkin-mode.md).

---

**Owner:** TBD
**Created:** 2026-05-13
**Status:** Pending
