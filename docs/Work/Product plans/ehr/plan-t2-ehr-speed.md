# Plan T2 — EHR speed (doctor-side love)

## Cut Rx writing from "5 minutes of typing" to "30 seconds of tapping"

> **Read-order:** [README.md](./README.md) → [plan-f01](./plan-f01-prescription-foundation-status.md) → [plan-00](./plan-00-ehr-roadmap.md) → [plan-t1](./plan-t1-ehr-foundation.md) → **plan-t2 (this file)**.
>
> **Status:** `Drafted` 2026-05-03. **Depends on:** T1 (chart panel + previous-Rx surface).
>
> **Effort:** ~4 dev-days for the 7 items.
>
> **Schema:** 2 migrations — `drug_master` (lookup + seed) and `doctor_rx_templates`. No changes to existing prescription tables (yet — see T2.13 for autosave on `prescriptions.updated_at` which already exists).

---

## Why this tier matters more than any other

The doctor's relationship with Clariva is **literally** the speed of writing a prescription. Everything else (chat, video, payments) can be average; if the Rx flow feels slow, doctors leave. Conversely if the Rx flow feels faster than every other EHR they've ever used, they'll switch to us from Practo / Lybrate / paper despite missing features elsewhere.

This tier is the retention lever. T1 is the foundation; T3 is the trust signal; **T2 is what makes them love it.**

Speed comes from three places, in priority order:

1. **Templates / favorites.** A specialist seeing the same condition 30×/day shouldn't type the same Rx 30 times. Tap "URTI standard" → form pre-fills → adjust → send. Target: **3 taps end-to-end.**
2. **Drug autocomplete.** Typing "para" surfaces Paracetamol with strength + form pre-filled. No typos, no canonicalization headaches downstream.
3. **Auto-save + smart copy-from-last-visit.** Doctor never thinks about "did I save". For follow-up visits, "Copy last visit's Rx" pre-fills 80% of the form.

T2 ships all three.

---

## Decisions LOCKED 2026-05-03

| ID | Decision | Implication |
|----|----------|-------------|
| **T2-D1** | **Drug DB seed: hand-curated ~500 most-prescribed Indian generics + brand names.** Per Q2 in plan-00. RxNorm import is a follow-up if quality issues appear. | Seed lives in `backend/migrations/0XX_drug_master_seed.sql` (or as a one-off `node scripts/seed-drug-master.ts`). Owner picks the source list — recommend `Indian Drug Index` open-data subset. |
| **T2-D2** | **Templates are per-doctor in V1.** No clinic-wide sharing. Per Q6 in plan-00. | `doctor_rx_templates.doctor_id` is the only ownership column; no `clinic_id`. Sharing is a v2 line item. |
| **T2-D3** | **Auto-save debounce window = 1.5 seconds.** Per Q4 in plan-00. | T2.13 sets the constant; never override per-component. |
| **T2-D4** | **Structured frequency / route / duration use enums (DB constraint), not free text.** | `prescription_medicines` gets 3 new columns AND retains the existing free-text columns for backward compatibility. T2.9 owns the migration that adds the enum columns. |
| **T2-D5** | **No "Save draft" button anywhere after T2.13 ships.** Decision E5 inherited. | Form has only "Send to patient". Status indicator carries save state. |

---

## Items

### T2.7 — Schema: `drug_master` lookup table

**Status:** `Drafted`. **Effort:** 0.5 day. **Files to create:**

- `backend/migrations/0XX_drug_master.sql` — table + index.
- `backend/migrations/0XX_drug_master_seed.sql` (or `backend/scripts/seed-drug-master.ts`) — seeds the rows.
- `backend/src/services/drug-master-service.ts` — read-only `searchDrugs(query, limit=10)`.

**Spec.**

```sql
CREATE TABLE IF NOT EXISTS drug_master (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    generic_name    TEXT NOT NULL,                     -- "Paracetamol"
    brand_names     TEXT[] NOT NULL DEFAULT '{}',      -- ["Crocin", "Calpol", "Dolo"]
    strength        TEXT NULL,                         -- "500mg"
    form            TEXT NULL,                         -- "tablet" | "syrup" | "injection" ...
    route_default   TEXT NULL,                         -- "oral" | "IV" | "topical" ...
    notes           TEXT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigram index for fuzzy substring search on generic + brand
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_drug_master_generic_trgm
  ON drug_master USING gin (generic_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_drug_master_brands_gin
  ON drug_master USING gin (brand_names);

-- RLS: globally readable (it's a lookup, not patient data); writes service-role only.
ALTER TABLE drug_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY drug_master_read_all ON drug_master FOR SELECT USING (true);
-- (no insert/update/delete policy → service role bypass only)
```

**Search API (frontend → backend):**

```ts
// GET /api/v1/drugs/search?q=para&limit=10
// Returns: { results: [{ id, generic_name, brand_names, strength, form, route_default }] }
//
// Backend uses ILIKE on generic_name + ANY(brand_names) for prefix match,
// falls back to trigram similarity for fuzzy. Order by:
//   1. exact prefix match on generic
//   2. exact prefix match on any brand
//   3. trigram similarity desc
// Limit defaults to 10, hard ceiling 25.
```

**Seed source.** Hand-curated list of ~500 most-prescribed Indian drugs. Format:

```sql
INSERT INTO drug_master (generic_name, brand_names, strength, form, route_default) VALUES
  ('Paracetamol', ARRAY['Crocin', 'Calpol', 'Dolo'],          '500mg',  'tablet', 'oral'),
  ('Amoxicillin', ARRAY['Mox', 'Novamox', 'Amoxil'],         '500mg',  'capsule', 'oral'),
  ('Azithromycin', ARRAY['Azee', 'Zithromax', 'Azithral'],   '500mg',  'tablet', 'oral'),
  -- ... ~500 rows total
;
```

**Acceptance.**

- Migration runs cleanly; ~500 rows present after seed.
- `GET /api/v1/drugs/search?q=para&limit=5` returns Paracetamol first.
- Trigram fuzzy match works (`q=paracetomol` typo → still surfaces Paracetamol).
- Search response < 50ms p95 on dev DB.

---

### T2.8 — `<DrugAutocomplete>` UI component (replaces the medicine-name `<input>`)

**Status:** `Drafted`. **Effort:** 0.75 day. **Files to create / touch:**

- `frontend/components/ehr/DrugAutocomplete.tsx` (new).
- `frontend/components/consultation/MedicineRow.tsx` — replace the medicine-name `<input>` with `<DrugAutocomplete>`.
- `frontend/lib/api/drug-master.ts` — typed wrapper around `GET /api/v1/drugs/search`.

**Spec.** Combobox pattern. Doctor types → debounced 200ms → fetches → dropdown shows max 10 results. Each result row: `Generic name` (bold) — `Brand` · `Strength · Form`. Selecting a row:

- Sets `medicine_name = generic_name`.
- Pre-fills `dosage = strength` if empty.
- Pre-fills `route = route_default` if empty.
- Stores the `drug_master.id` in a new optional column `prescription_medicines.drug_master_id` (additive, see T2.9 migration).

Doctor can still type free text and not pick from the list — that's the v1 escape hatch (e.g. for compounded preparations).

```tsx
// frontend/components/ehr/DrugAutocomplete.tsx (sketch)

interface Props {
  value: string;
  onChange: (text: string, drugMasterId?: string, prefill?: { strength?: string; route?: string }) => void;
  placeholder?: string;
}

export function DrugAutocomplete({ value, onChange, placeholder }: Props) {
  const [query, setQuery] = useState(value);
  const debounced = useDebounce(query, 200);
  const { data: results } = useSWR(
    debounced.length >= 2 ? ['drug-search', debounced] : null,
    () => searchDrugs(debounced, 10),
  );

  return (
    <Combobox value={query} onChange={(text) => onChange(text)}>
      <Combobox.Input
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); }}
        className="..."
        placeholder={placeholder ?? 'Drug name...'}
      />
      <Combobox.Options className="absolute z-10 max-h-60 overflow-auto bg-white border rounded shadow">
        {results?.map((d) => (
          <Combobox.Option
            key={d.id}
            value={d.generic_name}
            onClick={() => onChange(d.generic_name, d.id, { strength: d.strength, route: d.route_default })}
            className="cursor-pointer px-3 py-2 hover:bg-blue-50"
          >
            <div className="font-medium">{d.generic_name}</div>
            <div className="text-xs text-gray-500">
              {d.brand_names.slice(0, 3).join(' · ')} · {d.strength} · {d.form}
            </div>
          </Combobox.Option>
        ))}
      </Combobox.Options>
    </Combobox>
  );
}
```

**Acceptance.**

- Typing "para" → "Paracetamol" appears within 250ms.
- Selecting a result fills generic name + dosage + route in the row.
- Mobile: dropdown is touch-friendly (44px+ row height).
- Doctor can submit free-text entries (the dropdown is suggestion-only).
- T4.18 (allergy clash) reads `drug_master_id` for canonical matching.

---

### T2.9 — Schema additions: structured frequency / route / duration enums + `drug_master_id` FK

**Status:** `Drafted`. **Effort:** 0.25 day. **Files to create:**

- `backend/migrations/0XX_prescription_medicines_structured.sql`.

**Spec.** Additive columns on `prescription_medicines`. Existing free-text columns stay (UI gracefully degrades). New columns are nullable so legacy rows don't break.

```sql
ALTER TABLE prescription_medicines
  ADD COLUMN drug_master_id        UUID NULL REFERENCES drug_master(id) ON DELETE SET NULL,
  ADD COLUMN frequency_code        TEXT NULL CHECK (
    frequency_code IS NULL OR frequency_code IN (
      'OD',     -- once daily
      'BID',    -- twice daily
      'TID',    -- three times daily
      'QID',    -- four times daily
      'QHS',    -- at bedtime
      'PRN',    -- as needed
      'STAT',   -- immediately, once
      'CUSTOM'  -- free-text in `frequency`
    )
  ),
  ADD COLUMN duration_value        INTEGER NULL CHECK (duration_value IS NULL OR duration_value > 0),
  ADD COLUMN duration_unit         TEXT NULL CHECK (
    duration_unit IS NULL OR duration_unit IN ('days', 'weeks', 'months', 'until-finished', 'continue')
  ),
  ADD COLUMN route_code            TEXT NULL CHECK (
    route_code IS NULL OR route_code IN ('oral', 'IV', 'IM', 'SC', 'topical', 'inhaled', 'rectal', 'nasal', 'sublingual', 'other')
  );

CREATE INDEX IF NOT EXISTS idx_prescription_medicines_drug_master
  ON prescription_medicines (drug_master_id);
```

**Acceptance.**

- Migration runs cleanly; existing rows unaffected.
- New rows can be inserted with structured fields populated.
- Legacy rows (only free-text `frequency` / `route`) still readable, still display in `<MedicineRow>`.

---

### T2.10 — Structured frequency / duration / route picker UI

**Status:** `Drafted`. **Effort:** 0.5 day. **Files to touch:**

- `frontend/components/consultation/MedicineRow.tsx` — replace the three free-text inputs with structured pickers.

**Spec.** Three small dropdowns:

- **Frequency:** "Once daily (OD)" / "Twice daily (BID)" / "Three times daily (TID)" / "Four times daily (QID)" / "At bedtime (QHS)" / "As needed (PRN)" / "Once (STAT)" / "Custom...". "Custom..." reveals the legacy free-text input.
- **Duration:** number input + unit dropdown (days / weeks / months / until finished / continue).
- **Route:** dropdown (oral / IV / IM / SC / topical / inhaled / rectal / nasal / sublingual / other). Free-text fallback under "other".

When the doctor selects a structured value, the legacy free-text columns are also populated for backward compatibility (e.g. selecting BID writes `frequency = 'Twice daily'` AND `frequency_code = 'BID'`).

**Acceptance.**

- Touch targets ≥ 44px on mobile.
- All structured values render correctly in the existing `<MedicineRow>` read view.
- Legacy free-text Rx (created before this ships) still display correctly.
- T3 PDF generation uses the structured columns to render consistently formatted instructions.

---

### T2.11 — Schema: `doctor_rx_templates` table

**Status:** `Drafted`. **Effort:** 0.5 day. **Files to create:**

- `backend/migrations/0XX_doctor_rx_templates.sql`.

**Spec.** Per-doctor saved Rx blueprints. A template is a name + the same payload shape as a prescription (without patient-specific fields).

```sql
CREATE TABLE IF NOT EXISTS doctor_rx_templates (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id                   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name                        TEXT NOT NULL,                  -- "URTI standard adult"
    description                 TEXT NULL,
    -- pre-fillable Rx fields (mirror prescriptions table; all nullable)
    cc                          TEXT NULL,
    hopi                        TEXT NULL,
    provisional_diagnosis       TEXT NULL,
    investigations              TEXT NULL,
    follow_up                   TEXT NULL,
    patient_education           TEXT NULL,
    clinical_notes              TEXT NULL,
    medicines_json              JSONB NOT NULL DEFAULT '[]'::jsonb,  -- array of { drug_master_id?, name, dosage, route_code?, frequency_code?, duration_value?, duration_unit?, instructions? }
    use_count                   INTEGER NOT NULL DEFAULT 0,          -- bumped on apply; powers "most used" sort
    last_used_at                TIMESTAMPTZ NULL,
    archived_at                 TIMESTAMPTZ NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doctor_rx_templates_lookup
  ON doctor_rx_templates (doctor_id, last_used_at DESC NULLS LAST)
  WHERE archived_at IS NULL;

ALTER TABLE doctor_rx_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY doctor_rx_templates_select_own ON doctor_rx_templates FOR SELECT USING (auth.uid() = doctor_id);
CREATE POLICY doctor_rx_templates_insert_own ON doctor_rx_templates FOR INSERT WITH CHECK (auth.uid() = doctor_id);
CREATE POLICY doctor_rx_templates_update_own ON doctor_rx_templates FOR UPDATE USING (auth.uid() = doctor_id) WITH CHECK (auth.uid() = doctor_id);
CREATE POLICY doctor_rx_templates_delete_own ON doctor_rx_templates FOR DELETE USING (auth.uid() = doctor_id);
```

**Backend service:**

```ts
// backend/src/services/rx-template-service.ts
export async function listTemplates(client) {/* sorted by last_used_at desc, then name asc */}
export async function createTemplate(client, input) {/* INSERT; returns row */}
export async function updateTemplate(client, id, input) {/* PATCH */}
export async function archiveTemplate(client, id) {/* sets archived_at = now() */}
export async function recordTemplateUse(client, id) {/* atomic increment use_count + set last_used_at */}
```

**Acceptance.**

- All CRUD endpoints work; RLS enforces per-doctor.
- `recordTemplateUse` is atomic (`UPDATE ... SET use_count = use_count + 1, last_used_at = now()`).

---

### T2.12 — Templates picker UI (bottom-sheet on mobile, side-panel on desktop)

**Status:** `Drafted`. **Effort:** 0.75 day. **Files to create / touch:**

- `frontend/components/ehr/TemplatePicker.tsx` (new) — modal/sheet that lists templates, supports search, and exposes "Apply" / "Save current Rx as template".
- `frontend/components/consultation/PrescriptionForm.tsx` — add a "Templates" button in the form header that opens `<TemplatePicker>`.
- `frontend/lib/api/rx-templates.ts` — typed client wrappers.

**Spec.**

- **Desktop (`lg+`):** clicking the "Templates" button opens a right-side panel (`w-96`) sliding in from the right. List of templates, sorted by `last_used_at desc`. Each template card: name + description + "Apply" button + kebab menu (Edit / Archive). Search box at top.
- **Mobile (`<lg`):** opens a bottom-sheet modal (`<Drawer>`) covering 80% of viewport height. Same content, larger tap targets.
- **Apply:** pre-fills all matching form fields. Existing form state is overwritten (with a confirm if there are unsaved changes — but Decision E5 means "unsaved" is rare; this confirm is for the case where the doctor has typed for < 1.5s and the autosave hasn't fired yet).
- **Save as template:** opens a name + description prompt, then snapshots the current form into a new template row. Available from the form header dropdown ("Save as template…").
- **Long-press** a template card on mobile → kebab menu (Edit / Archive). Desktop: kebab is always visible.

```tsx
// TemplatePicker.tsx (skeleton)
export function TemplatePicker({ open, onClose, onApply }: Props) {
  const { data: templates, mutate } = useTemplates();
  const filtered = useFilteredTemplates(templates, search);

  const sheet = (
    <div className="space-y-2">
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates..." />
      {filtered.map((t) => (
        <TemplateCard
          key={t.id}
          template={t}
          onApply={async () => {
            await recordTemplateUse(t.id);
            await mutate();
            onApply(t);
            onClose();
          }}
          onArchive={() => archive(t.id).then(() => mutate())}
        />
      ))}
      {filtered.length === 0 && <EmptyState text="No templates yet — create one from any Rx" />}
    </div>
  );

  return isMobile ? <BottomSheet open={open} onClose={onClose}>{sheet}</BottomSheet>
                  : <SidePanel open={open} onClose={onClose}>{sheet}</SidePanel>;
}
```

**Acceptance.**

- Doctor can save current Rx as a named template.
- "Apply" pre-fills form + bumps `use_count` + `last_used_at`.
- Picker works in all three mount surfaces (appointment-detail / in-call / post-call read-only — though "Apply" is hidden in read-only).
- Search filters by template name + medicine names within `medicines_json` (substring, case-insensitive).
- Empty state is friendly.

---

### T2.13 — Auto-save (replaces "Save draft" button per Decision E5)

**Status:** `Drafted`. **Effort:** 0.5 day. **Files to touch:**

- `frontend/components/consultation/PrescriptionForm.tsx`:
  - Remove "Save draft" button.
  - Wrap form state changes in a 1.5s-debounced PATCH to `prescriptions/:id`.
  - Add status indicator: `Saving…` (spinner) / `Saved 3s ago` (check) / `Save failed — Retry` (red).
  - "Send to patient" button stays; on click, performs a final save then triggers send.
- `frontend/lib/hooks/useAutoSave.ts` (new) — generic hook taking `{ value, save, debounceMs, onError }`.

**Spec.**

```tsx
// useAutoSave.ts
export function useAutoSave<T>({
  value,
  save,
  debounceMs = 1500,
}: { value: T; save: (v: T) => Promise<void>; debounceMs?: number }) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const debouncedValue = useDebounce(value, debounceMs);
  const isFirstRunRef = useRef(true);

  useEffect(() => {
    if (isFirstRunRef.current) { isFirstRunRef.current = false; return; }
    let cancelled = false;
    setState('saving');
    save(debouncedValue)
      .then(() => { if (!cancelled) { setState('saved'); setSavedAt(new Date()); setError(null); } })
      .catch((err) => { if (!cancelled) { setState('error'); setError(err); } });
    return () => { cancelled = true; };
  }, [debouncedValue]);

  const retry = useCallback(() => {
    setState('saving');
    return save(debouncedValue).then(() => { setState('saved'); setSavedAt(new Date()); });
  }, [debouncedValue, save]);

  return { state, savedAt, error, retry };
}
```

```tsx
// In PrescriptionForm.tsx
const { state, savedAt, retry } = useAutoSave({
  value: formState,
  save: async (snapshot) => updatePrescription(prescriptionId, snapshot),
  debounceMs: 1500,
});

// Render in form header:
<SaveStatus state={state} savedAt={savedAt} onRetry={retry} />
```

**Acceptance.**

- Edits trigger PATCH 1.5s after the last keystroke.
- Status indicator reflects state correctly.
- On save failure (offline / RLS / 5xx), retry button appears; clicking retries.
- "Send to patient" forces a final save before sending (no race where you send a stale snapshot).
- "Save draft" button is gone from the UI.
- No PATCH fires on initial mount when nothing has changed.

---

### T2.14 — "Copy from last visit" one-tap

**Status:** `Drafted`. **Effort:** 0.5 day. **Files to touch:**

- `frontend/components/consultation/PrescriptionForm.tsx` — add a "Copy from last visit" CTA in the form header (visible only when this is a follow-up, i.e. `appointment.episode_id IS NOT NULL` AND there's a prior Rx in the same episode).
- `backend/src/services/prescription-service.ts` — add `getLastPrescriptionInEpisode(episodeId, beforeAppointmentId)`. Returns the most recent Rx in the same episode that's older than this appointment.

**Spec.** Same payload application as T2.12's "Apply template", but the source is the prior Rx, not a template. UX:

- Button only appears when there's a previous Rx to copy.
- Confirm modal: "Copy diagnosis, plan and medicines from your last visit on {date}?" with "Copy all" / "Pick fields..." / "Cancel".
- "Pick fields..." opens a small chooser: checkboxes for each field group (CC / HOPI / Dx / Investigations / Follow-up / Patient education / Clinical notes / Medicines).

**Acceptance.**

- CTA appears only on follow-up visits with a prior Rx.
- "Copy all" pre-fills everything.
- "Pick fields..." copies only chosen field groups.
- Auto-save triggers as expected after the copy.

---

## Out of scope for T2

- RxNorm import (parked; revisit if seed quality issues appear per Q2 in plan-00).
- Clinic-wide template sharing (per Decision T2-D2; v2 line item).
- Drug strength calculator (e.g. mg/kg dosing for pediatrics) — Decision E1 defers specialty modules.
- Pharmacist-side workflow (none).
- Refill workflow ("re-prescribe last 3 medicines for 30 more days") — would be a great T2 follow-up but not in this batch; T6 may auto-suggest.
- Voice-to-text dictation into the form — separate accessibility line, not on EHR roadmap.

---

## Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Drug DB seed quality is poor (wrong strengths, missing brands) | Start small (~500 drugs hand-curated); add a "Suggest a missing drug" link in the dropdown empty state; iterate on doctor feedback. |
| Doctors don't discover the templates feature | Empty state in `<TemplatePicker>` includes a one-tap "Save current Rx as template" CTA. After a doctor sends 3 Rx without saving any as template, surface a one-time toast: "You wrote a similar Rx 3 times today — save it as a template?". |
| Auto-save fires too aggressively, hitting the DB on every keystroke | Debounce window is 1.5s (Decision T2-D3). Hook tested at single-user load. T5 telemetry can later add a backstop counter. |
| Structured pickers feel slower than free text for power users | Each picker has a "Custom..." escape hatch that drops to free text. Decision T2-D4 keeps both columns populated. |
| Templates pollute the picker (50+ templates per doctor) | Sort by `last_used_at desc` → most-used surface to the top naturally. Search box for the long tail. Archive (not delete) to keep history. |

---

## Sequencing inside T2

```
T2.7 (drug_master schema + seed)
  └→ T2.8 (DrugAutocomplete component)
       └→ T2.9 (structured columns migration)
            └→ T2.10 (structured pickers UI)
                 ├→ T2.11 (templates schema)
                 │    └→ T2.12 (templates picker UI)
                 │         └→ T2.14 (copy from last visit)
                 └→ T2.13 (auto-save)            ← parallel; can ship anytime after T2.10
```

T2.13 (autosave) is the highest-leverage item per dev-day spent. T2.7 → T2.8 unlocks autocomplete which unblocks T4. T2.11 → T2.12 unlocks templates which unblocks T2.14. Recommended ship order: T2.7 → T2.8 → T2.13 → T2.9 → T2.10 → T2.11 → T2.12 → T2.14.

---

**Created:** 2026-05-03. **Status:** `Drafted`. **Owner:** TBD.
