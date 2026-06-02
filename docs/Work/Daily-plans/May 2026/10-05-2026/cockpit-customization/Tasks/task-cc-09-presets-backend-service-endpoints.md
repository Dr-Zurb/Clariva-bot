# Task cc-09: Presets backend — service helpers + REST endpoints

## 10 May 2026 — Batch [Cockpit customization](../plan-cockpit-customization-batch.md) — Phase D, Lane α step 1 — **S, ~2h**

---

## Task overview

cc-08 added the `cockpit_layout_presets JSONB` column on `doctor_settings`. cc-09 ships the **API surface** the frontend (cc-10) calls:

- `GET    /v1/settings/doctor/cockpit-presets` — list the calling doctor's saved presets.
- `PUT    /v1/settings/doctor/cockpit-presets` — replace the whole array (atomic write — frontend sends the desired state).
- `DELETE /v1/settings/doctor/cockpit-presets/:presetId` — convenience delete (so the frontend doesn't have to round-trip via PUT for a single deletion).

All three are auth-scoped via the existing JWT middleware. Ownership validation is implicit — the doctor's user id from the JWT IS the row's primary key. (The doctor can only ever see their own presets; the read scope is enforced both at the application layer via `validateOwnership`-style checks and at the DB layer via existing RLS on `doctor_settings`.)

The 5-preset soft cap (CC-D6) lives in the frontend (the eviction prompt). The hard cap is in the migration (cc-08). cc-09 doesn't redundantly enforce a 5-cap in the service code — it lets the DB CHECK fail loudly and converts the resulting Postgres error into a clean `ValidationError` (HTTP 400 "Maximum 5 cockpit layout presets allowed").

**Estimated time:** ~2h.

**Status:** Pending.

**Hard deps:** cc-08 (the migration must be applied on the dev DB before this task runs).

**Source:** [plan-cockpit-customization-batch.md § CC-D5, § CC-D6](../plan-cockpit-customization-batch.md#decision-lock-locked-2026-05-10-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh small chat (or stitch onto cc-08 if both happen in one sitting). Pre-load:
- This task file.
- `backend/src/services/doctor-settings-service.ts` (the existing service — read enough to copy the patterns: `validateOwnership`, `handleSupabaseError`, `logAuditEvent`).
- `backend/src/routes/api/v1/settings/doctor.ts` (the existing route file — confirm the pattern for adding sub-routes; you may add the new endpoints to this file or create a sibling `doctor-cockpit-presets.ts` and mount it parallel).
- `backend/src/types/doctor-settings.ts` (the row type — extend with `cockpit_layout_presets`).
- `backend/src/utils/errors.ts` (`ValidationError`, `NotFoundError` shapes).
- `backend/src/utils/db-helpers.ts` (`handleSupabaseError`, `validateOwnership`).

**Estimated turns:** 3 turns.

---

## Acceptance criteria

### Type definitions

- [ ] In `backend/src/types/doctor-settings.ts`:

  - Add the preset-row interface:

    ```ts
    /**
     * CC-08 / CC-09: a single user-saved cockpit layout preset.
     * Stored inside the `cockpit_layout_presets` JSONB array on `doctor_settings`.
     * Built-in presets (Triage / Consult / Document) live in the frontend bundle
     * and are NOT persisted here.
     */
    export interface CockpitLayoutPreset {
      /** Stable client-generated id (e.g. `crypto.randomUUID()`). */
      id: string;
      /** User-supplied display name (1–60 chars after trim). */
      name: string;
      /** ISO timestamp the preset was created — used for soft-cap eviction (oldest first). */
      created_at: string;
      /** The cockpit layout snapshot to restore. */
      layout: {
        slots: ['chart' | 'body' | 'rx', 'chart' | 'body' | 'rx', 'chart' | 'body' | 'rx'];
        widths: [number, number, number];
        collapsed: { chart: boolean; rx: boolean };
      };
    }
    ```

  - Add `cockpit_layout_presets: CockpitLayoutPreset[]` to `DoctorSettingsRow`.

- [ ] Add `cockpit_layout_presets` to the `SELECT_COLUMNS` constant in `doctor-settings-service.ts` (the existing comma-separated string near the top).

- [ ] Add `cockpit_layout_presets: []` to the `DEFAULT_SETTINGS` constant.

### Service helpers

- [ ] Add to `backend/src/services/doctor-settings-service.ts`:

  ```ts
  const MAX_COCKPIT_PRESETS = 5; // CC-D6 soft cap (and DB hard cap)
  const PRESET_NAME_MAX_LEN = 60;
  const PRESET_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
  const COLUMN_TYPES = ['chart', 'body', 'rx'] as const;

  /**
   * Read the calling doctor's cockpit layout presets.
   * Returns `[]` when the doctor has no doctor_settings row OR the column
   * is the default empty array. Never throws on "no row" — the cockpit's
   * read path is hot and must not error on a fresh-doctor account.
   */
  export async function getCockpitPresetsForUser(userId: string): Promise<CockpitLayoutPreset[]> {
    validateOwnership(userId, 'getCockpitPresetsForUser');
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('doctor_settings')
      .select('cockpit_layout_presets')
      .eq('doctor_id', userId)
      .maybeSingle();
    if (error) handleSupabaseError(error, 'getCockpitPresetsForUser');
    return (data?.cockpit_layout_presets ?? []) as CockpitLayoutPreset[];
  }

  /**
   * Replace the full presets array. Atomic. The frontend sends the desired
   * state (after eviction / rename / etc.); the backend validates shape and
   * persists. Idempotent — same payload twice is a no-op.
   *
   * Throws ValidationError (400) on:
   *  - more than 5 presets
   *  - any preset missing required fields, or with bad shapes
   *  - duplicate ids
   *  - empty / overly long names
   *
   * Throws InternalError (500) on Supabase failures.
   */
  export async function putCockpitPresetsForUser(
    userId: string,
    presets: CockpitLayoutPreset[],
  ): Promise<CockpitLayoutPreset[]> {
    validateOwnership(userId, 'putCockpitPresetsForUser');
    validatePresetArray(presets);
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('doctor_settings')
      .upsert(
        { doctor_id: userId, cockpit_layout_presets: presets },
        { onConflict: 'doctor_id' },
      )
      .select('cockpit_layout_presets')
      .single();
    if (error) handleSupabaseError(error, 'putCockpitPresetsForUser');
    void logDataModification('doctor_settings', userId, ['cockpit_layout_presets']);
    return (data?.cockpit_layout_presets ?? []) as CockpitLayoutPreset[];
  }

  /**
   * Delete a single preset by id. Convenience wrapper — internally reads,
   * filters, writes. Returns the new array.
   * 404s if the id isn't found in the doctor's array (no silent no-op).
   */
  export async function deleteCockpitPresetForUser(
    userId: string,
    presetId: string,
  ): Promise<CockpitLayoutPreset[]> {
    validateOwnership(userId, 'deleteCockpitPresetForUser');
    if (!PRESET_ID_REGEX.test(presetId)) {
      throw new ValidationError(`Invalid preset id: ${presetId}`);
    }
    const current = await getCockpitPresetsForUser(userId);
    const next = current.filter((p) => p.id !== presetId);
    if (next.length === current.length) {
      throw new NotFoundError(`Cockpit preset not found: ${presetId}`);
    }
    return putCockpitPresetsForUser(userId, next);
  }

  function validatePresetArray(presets: unknown): asserts presets is CockpitLayoutPreset[] {
    if (!Array.isArray(presets)) {
      throw new ValidationError('cockpit_layout_presets must be an array');
    }
    if (presets.length > MAX_COCKPIT_PRESETS) {
      throw new ValidationError(`Maximum ${MAX_COCKPIT_PRESETS} cockpit layout presets allowed`);
    }
    const seenIds = new Set<string>();
    for (const [i, p] of presets.entries()) {
      if (!p || typeof p !== 'object') {
        throw new ValidationError(`presets[${i}] must be an object`);
      }
      const preset = p as Partial<CockpitLayoutPreset>;
      if (typeof preset.id !== 'string' || !PRESET_ID_REGEX.test(preset.id)) {
        throw new ValidationError(`presets[${i}].id is invalid`);
      }
      if (seenIds.has(preset.id)) {
        throw new ValidationError(`Duplicate preset id: ${preset.id}`);
      }
      seenIds.add(preset.id);
      const name = typeof preset.name === 'string' ? preset.name.trim() : '';
      if (!name || name.length > PRESET_NAME_MAX_LEN) {
        throw new ValidationError(`presets[${i}].name must be 1–${PRESET_NAME_MAX_LEN} chars`);
      }
      if (typeof preset.created_at !== 'string' || !isValidIsoDate(preset.created_at)) {
        throw new ValidationError(`presets[${i}].created_at must be ISO-8601 string`);
      }
      validateLayoutShape(preset.layout, `presets[${i}].layout`);
    }
  }

  function validateLayoutShape(layout: unknown, label: string): void {
    if (!layout || typeof layout !== 'object') {
      throw new ValidationError(`${label} must be an object`);
    }
    const l = layout as Record<string, unknown>;
    const slots = l.slots;
    if (!Array.isArray(slots) || slots.length !== 3 || !slots.every((s) => COLUMN_TYPES.includes(s as never))) {
      throw new ValidationError(`${label}.slots must be a permutation of ${COLUMN_TYPES.join('/')}`);
    }
    if (new Set(slots).size !== 3) {
      throw new ValidationError(`${label}.slots must contain each of chart/body/rx exactly once`);
    }
    const widths = l.widths;
    if (
      !Array.isArray(widths) ||
      widths.length !== 3 ||
      !widths.every((w) => typeof w === 'number' && w >= 0 && w <= 100)
    ) {
      throw new ValidationError(`${label}.widths must be 3 numbers in [0,100]`);
    }
    const sum = (widths as number[]).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 100) > 5) {
      throw new ValidationError(`${label}.widths must sum to ~100 (got ${sum})`);
    }
    const collapsed = l.collapsed as Record<string, unknown> | undefined;
    if (
      !collapsed ||
      typeof collapsed !== 'object' ||
      typeof collapsed.chart !== 'boolean' ||
      typeof collapsed.rx !== 'boolean'
    ) {
      throw new ValidationError(`${label}.collapsed must be { chart: boolean, rx: boolean }`);
    }
  }

  function isValidIsoDate(s: string): boolean {
    const d = new Date(s);
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s.slice(0, 10);
  }
  ```

  - **Why validate at app layer when DB CHECK exists?** App-layer surface gives clean 400s with field-specific messages. DB CHECK is the backstop for the case where someone bypasses the API. Both run.
  - **Why upsert and not update?** A doctor with no prior `doctor_settings` row should be able to save their first preset without a separate "create row" step. Upsert handles both cases.
  - **Audit logging.** `logDataModification` mirrors the pattern in the existing `updateDoctorSettings` function — feeds the audit log so we can trace preset changes if something weird shows up.

### REST endpoints

- [ ] In `backend/src/routes/api/v1/settings/doctor.ts` (or a new sibling `cockpit-presets.ts` mounted under `/settings/doctor/cockpit-presets`), add:

  ```ts
  // GET /v1/settings/doctor/cockpit-presets
  router.get('/cockpit-presets', requireAuth, async (req, res, next) => {
    try {
      const userId = (req as AuthenticatedRequest).user.id;
      const presets = await getCockpitPresetsForUser(userId);
      res.json({ presets });
    } catch (err) {
      next(err);
    }
  });

  // PUT /v1/settings/doctor/cockpit-presets
  // Body: { presets: CockpitLayoutPreset[] }
  router.put('/cockpit-presets', requireAuth, async (req, res, next) => {
    try {
      const userId = (req as AuthenticatedRequest).user.id;
      const body = req.body as { presets?: unknown };
      const presets = await putCockpitPresetsForUser(userId, body.presets as CockpitLayoutPreset[]);
      res.json({ presets });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /v1/settings/doctor/cockpit-presets/:presetId
  router.delete('/cockpit-presets/:presetId', requireAuth, async (req, res, next) => {
    try {
      const userId = (req as AuthenticatedRequest).user.id;
      const presetId = req.params.presetId;
      const presets = await deleteCockpitPresetForUser(userId, presetId);
      res.json({ presets });
    } catch (err) {
      next(err);
    }
  });
  ```

  - The standard error middleware in the project converts `ValidationError` → 400, `NotFoundError` → 404, `InternalError` → 500. No custom error handling here.

### Tests

- [ ] Add `backend/tests/unit/services/doctor-settings-cockpit-presets.test.ts`:
  - `getCockpitPresetsForUser` returns `[]` when no row.
  - `getCockpitPresetsForUser` returns the saved array.
  - `putCockpitPresetsForUser` rejects 6 presets (validation).
  - `putCockpitPresetsForUser` rejects duplicate ids.
  - `putCockpitPresetsForUser` rejects bad slot permutations (e.g. `['chart','chart','rx']`).
  - `putCockpitPresetsForUser` rejects name > 60 chars / empty name.
  - `deleteCockpitPresetForUser` 404s on unknown id.
  - `deleteCockpitPresetForUser` returns the filtered array on success.
- [ ] Add a route-level integration test at `backend/tests/integration/api/cockpit-presets.test.ts` (smoke-only — full `request(app)` round-trips for GET / PUT / DELETE).
- [ ] `pnpm --filter backend tsc --noEmit` clean. Unit tests pass.

### Manual verification

- [ ] Start backend in dev. Authenticate as a test doctor.
- [ ] `curl -X GET <api>/v1/settings/doctor/cockpit-presets -H "Authorization: Bearer <jwt>"` → `{ "presets": [] }`.
- [ ] `curl -X PUT <api>/v1/settings/doctor/cockpit-presets -H "Content-Type: application/json" -d '{"presets":[{"id":"abc-123","name":"My layout","created_at":"2026-05-10T12:00:00Z","layout":{"slots":["chart","body","rx"],"widths":[26,48,26],"collapsed":{"chart":false,"rx":false}}}]}'` → returns the saved presets array.
- [ ] `curl -X PUT ...` with 6 presets → 400 `"Maximum 5 cockpit layout presets allowed"`.
- [ ] `curl -X DELETE <api>/v1/settings/doctor/cockpit-presets/abc-123` → returns `[]`.
- [ ] `curl -X DELETE .../cockpit-presets/does-not-exist` → 404.

---

## Out of scope

- **Frontend hook + UI** — cc-10.
- **Built-in presets** — bundled in frontend; never persisted.
- **Sharing presets between doctors** — out of scope for this batch.
- **Versioned preset schema** — if the layout shape ever evolves, add a `schema_version` field to `CockpitLayoutPreset` and handle migration in the read path. For now the shape is stable.

---

## Files expected to touch

**Modified:**
- `backend/src/types/doctor-settings.ts` (~30 LOC delta — `CockpitLayoutPreset` interface + extend `DoctorSettingsRow`).
- `backend/src/services/doctor-settings-service.ts` (~200 LOC delta — three new functions + validation helpers + `SELECT_COLUMNS` / `DEFAULT_SETTINGS` updates).
- `backend/src/routes/api/v1/settings/doctor.ts` (~50 LOC delta — three new routes).

**New:**
- `backend/tests/unit/services/doctor-settings-cockpit-presets.test.ts` (~250 LOC).
- `backend/tests/integration/api/cockpit-presets.test.ts` (~100 LOC).

---

## Notes / open decisions

1. **Why three endpoints (GET / PUT / DELETE) and not a richer one (POST / PATCH)?** The frontend's mental model is "this is the set of presets I want to have". PUT-the-whole-array maps cleanly. DELETE is a convenience for single-item removal so cc-10 doesn't have to GET → filter → PUT for one item.
2. **Why client-generated ids?** Eliminates a round-trip in the create path. The frontend creates a UUID, calls PUT, the row is saved with that id. No "create then read back the assigned id" dance.
3. **Why a sum-tolerance of ±5 on widths?** `react-resizable-panels` widths can drift slightly due to floating-point and pixel rounding. A doctor's saved layout might come back as widths `[25.9, 48.1, 26.0]` summing to 100.0 or `[25.9, 48.05, 26.05]` = 100.0. ±5 is generous; tighter (±1) might reject legitimate saves.
4. **Why no PATCH endpoint?** Per-field updates inside an array element get hairy fast. PUT-the-whole-array is simpler and the cap is small enough that the request size is trivial.
5. **Why not put preset CRUD on `/v1/cockpit-presets` directly?** Keeping it under `/v1/settings/doctor/...` colocates the route with the rest of doctor-settings administration and inherits the existing auth middleware.

---

## References

- **Affected files:**
  - `backend/src/types/doctor-settings.ts`
  - `backend/src/services/doctor-settings-service.ts`
  - `backend/src/routes/api/v1/settings/doctor.ts`
- **Predecessor:** [`task-cc-08-presets-migration.md`](./task-cc-08-presets-migration.md).
- **Successor:** [`task-cc-10-presets-frontend-hook-and-ui.md`](./task-cc-10-presets-frontend-hook-and-ui.md).

---

**Owner:** TBD
**Created:** 2026-05-10
**Status:** Pending
