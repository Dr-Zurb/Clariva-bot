# Plan T5 — EHR vitals & trends (longitudinal view)

## Make every vital captured today instantly visible alongside the last six months of trend

> **Read-order:** [README.md](./README.md) → [plan-f01](./plan-f01-prescription-foundation-status.md) → [plan-00](./plan-00-ehr-roadmap.md) → [plan-t1](./plan-t1-ehr-foundation.md) → **plan-t5 (this file)**.
>
> **Status:** `Drafted` 2026-05-03. **Depends on:** T1 (`patient_vitals` table + `<VitalsSection>` placeholder).
>
> **Effort:** ~2 dev-days for the 4 items.
>
> **Schema:** 1 column add (`prescriptions.episode_id`) + 1 SQL view.

---

## Why vitals + trends are a separate tier (not folded into T1)

T1's `patient_vitals` table is the storage spine. T5 is everything that turns the stored numbers into clinical signal:

- **Capture surface** — a fast multi-field input optimized for the moment a doctor wants to record vitals during a call.
- **Trend visualization** — sparkline per vital, so the doctor sees "BP has been rising for 4 visits" in one glance.
- **Problem list** — aggregate view of chronic conditions + recurring diagnoses + active care episodes, surfaced in the chart panel.
- **Episode linkage on prescriptions** — direct FK so the trajectory of an episode (visits + Rx + vitals) is one query.

Splitting these out from T1 keeps T1 small (foundation-only) and gives T5 room to focus on the longitudinal experience that actually changes how the doctor reasons about the patient.

---

## Decisions LOCKED 2026-05-03

| ID | Decision | Implication |
|----|----------|-------------|
| **T5-D1** | **Vitals are history (one row per recording).** Per Q7 in plan-00. | Trends literally only work with history; T1.1 schema already reflects this (`patient_vitals.recorded_at`). |
| **T5-D2** | **Sparklines render in the chart panel section header**, not as a separate "trends page". | Reduces clicks. Doctor sees "BP" → glances at the trend line right next to the latest reading. Tapping the sparkline opens a larger view (T5.22). |
| **T5-D3** | **Prescriptions get an additive nullable `episode_id` FK to existing `care_episodes`.** | The link already exists via `appointments.episode_id`; adding it directly to `prescriptions` makes the trajectory query trivial: `SELECT * FROM prescriptions WHERE episode_id = $1 ORDER BY created_at`. |
| **T5-D4** | **Problem list is a SQL view, not a denormalized table.** | Keeps source-of-truth in `patient_chronic_conditions` + recurring diagnoses + active episodes. View is read-only and refreshed live (no materialized view in V1). |

---

## Items

### T5.22 — `<VitalsCapture>` widget + sparkline upgrade in `<VitalsSection>`

**Status:** `Drafted`. **Effort:** 0.75 day. **Files to create / touch:**

- `frontend/components/ehr/VitalsCapture.tsx` (new) — multi-field input modal/sheet for fast entry.
- `frontend/components/ehr/sections/VitalsSection.tsx` (created in T1.3 as a placeholder) — replace placeholder with real implementation: list of recent readings, "Add reading" CTA opening `<VitalsCapture>`, per-vital sparkline in section sub-headers.
- `frontend/components/ehr/VitalSparkline.tsx` (new) — small SVG sparkline (no chart-lib dep; ~30 lines).
- `frontend/lib/api/patient-chart.ts` — extend with `listVitalsHistory(patientId, limit=20)`.

**Spec.**

**Capture widget — bottom-sheet on mobile, side-modal on desktop:**

```
┌──────────────────────────────────────────────┐
│  Record vitals — Patient: <name>              │
│                                                │
│  BP             [120] / [80]  mmHg             │
│  Heart rate     [72]          bpm              │
│  Temp           [37.0]        °C               │
│  SpO₂           [98]          %                │
│  Weight         [70]          kg               │
│  Height         [170]         cm               │
│  BMI            (auto: 24.2)                   │
│                                                │
│  Note (optional)                               │
│  [ ____________________________________ ]      │
│                                                │
│  [ Cancel ]                  [ Save reading ]  │
└──────────────────────────────────────────────┘
```

- All fields optional; doctor records whatever they measured.
- BMI auto-computed from weight + height client-side and saved (per T1.1 schema's `bmi` column).
- "Save reading" creates a `patient_vitals` row + bumps the section's reading list + re-renders sparklines.
- Tapping a sparkline opens a larger trend view (modal): line chart with last 12 readings + axis labels + reference range markers (e.g. BP normal band 90–120 / 60–80).

**Sparkline component (no external lib):**

```tsx
// VitalSparkline.tsx — pure SVG, ~30 lines
interface Props {
  values: number[];          // chronological, oldest first
  width?: number;
  height?: number;
  normalRange?: [number, number];
}

export function VitalSparkline({ values, width = 80, height = 24, normalRange }: Props) {
  if (values.length < 2) return null; // T5-D2: only render with 2+ points
  const min = Math.min(...values, normalRange?.[0] ?? Infinity);
  const max = Math.max(...values, normalRange?.[1] ?? -Infinity);
  const range = Math.max(max - min, 1);
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * width},${height - ((v - min) / range) * height}`)
    .join(' ');
  return (
    <svg width={width} height={height} className="inline-block">
      {normalRange ? (
        <rect
          x={0}
          y={height - ((normalRange[1] - min) / range) * height}
          width={width}
          height={Math.max(((normalRange[1] - normalRange[0]) / range) * height, 1)}
          fill="rgb(187, 247, 208)"  /* green-200 — "normal band" */
          opacity={0.4}
        />
      ) : null}
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.5} />
      <circle
        cx={width}
        cy={height - ((values[values.length - 1] - min) / range) * height}
        r={2}
        fill="currentColor"
      />
    </svg>
  );
}
```

**Section layout (in `<VitalsSection>`):**

```
Vitals
  Latest:  120/80 mmHg · 72 bpm · 37.0°C · 98% SpO₂   recorded 2 days ago
  ──────────────────────────────────────────────────
  BP       120/80 mmHg     [▁▂▃▅▆▇]      ← T5-D2 sparkline; tap for full view
  Heart    72 bpm          [▁▂▃▂▁▂▃]
  Temp     37.0 °C         (1 reading)   ← <2 readings → no sparkline, just count
  SpO₂     98 %             [▆▇▇▇▆▇▇]
  Weight   70 kg            [▁▁▂▂▂▃▃]
  ──────────────────────────────────────────────────
  [+ Add reading]
```

**Acceptance.**

- Doctor can record vitals during a call without losing the call tile (capture widget mounts in the in-call surface too).
- Sparklines appear once a vital has 2+ readings; absent otherwise.
- Tapping a sparkline opens the larger trend view.
- BMI auto-computes; saves correctly.
- Reading list reflects new entries immediately.

---

### T5.23 — Trend detail view (modal with full chart)

**Status:** `Drafted`. **Effort:** 0.5 day. **Files to create:**

- `frontend/components/ehr/VitalTrendModal.tsx` — opens when a sparkline is tapped.

**Spec.** Modal showing one vital across ALL recorded history (or last 90 days, whichever is more):

```
┌──────────────────────────────────────────────────────────┐
│  Blood Pressure — Patient: <name>             [✕ Close]   │
│                                                            │
│  ┌──────────────────────────────────────────────────┐     │
│  │  160 ┤                                            │     │
│  │      │                              ▲ 160/95     │     │
│  │  140 ┤                       ▲ 140/90              │     │
│  │      │                ▲ 130/85                     │     │
│  │  120 ┤─────▲─────▲─────────────────────── normal  │     │
│  │      │ 118/78  120/80                              │     │
│  │   90 ┤ ──────────────────────────────────────     │     │
│  │      │                                            │     │
│  │      └─────┬────┬────┬────┬────┬────┬─────       │     │
│  │            Jan  Feb  Mar  Apr  May  Jun           │     │
│  └──────────────────────────────────────────────────┘     │
│                                                            │
│  Recent readings:                                          │
│   Jun 15  160/95 mmHg  (note: "headache; review meds")     │
│   May 04  140/90 mmHg                                      │
│   Apr 21  130/85 mmHg                                      │
│   ...                                                      │
└──────────────────────────────────────────────────────────┘
```

Implementation: minimal SVG line chart (same approach as sparkline scaled up; or use `recharts` if already in `package.json` — verify before adding dep). Reference range bands shaded.

**Acceptance.**

- Modal shows last 90 days minimum, or all readings if fewer.
- BP shows both systolic + diastolic on one chart (two lines).
- Tap on a data point shows the recorded date + note.
- Modal works at mobile widths (chart shrinks to fit; recent-readings list scrolls below).
- Closes cleanly back to chart panel.

---

### T5.24 — Schema: `prescriptions.episode_id` additive FK

**Status:** `Drafted`. **Effort:** 0.25 day. **Files to create:**

- `backend/migrations/0XX_prescriptions_episode_link.sql`.

**Spec.**

```sql
ALTER TABLE prescriptions
  ADD COLUMN episode_id UUID NULL REFERENCES care_episodes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_prescriptions_episode
  ON prescriptions (episode_id, created_at DESC)
  WHERE episode_id IS NOT NULL;

COMMENT ON COLUMN prescriptions.episode_id IS
  'Direct FK to care_episodes for trajectory queries. Nullable: legacy Rx + non-episode visits leave it NULL.';
```

**Backfill for existing rows (one-shot script):**

```sql
-- Backfill episode_id from appointments where the link exists.
UPDATE prescriptions p
SET    episode_id = a.episode_id
FROM   appointments a
WHERE  p.appointment_id = a.id
  AND  p.episode_id IS NULL
  AND  a.episode_id IS NOT NULL;
```

**Backend service change:** `createPrescription` and `updatePrescription` populate `episode_id` from the parent appointment's `episode_id` automatically (no UI change required; doctor never sees the field).

**Acceptance.**

- Migration runs cleanly; backfill populates existing rows correctly.
- New Rx created against an appointment with `episode_id` get the same `episode_id`.
- Legacy / orphan Rx with NULL `episode_id` continue to work.

---

### T5.25 — Problem list view + section in chart panel

**Status:** `Drafted`. **Effort:** 0.5 day. **Files to create / touch:**

- `backend/migrations/0XX_patient_problem_list_view.sql` — SQL view aggregating chronic conditions + recurring diagnoses + active episodes.
- `backend/src/services/patient-chart-service.ts` — `getProblemList(patientId)` selecting from the view.
- `frontend/components/ehr/sections/ProblemListSection.tsx` (new) — added to `<PatientChartPanel>`.

**Spec.**

```sql
-- ============================================================================
-- T5.25 — patient_problem_list_v
--   Per (doctor, patient): unioned snapshot of "what's actively going on".
--     - active chronic conditions (from patient_chronic_conditions)
--     - active care episodes  (from care_episodes status='active')
--     - recurring diagnoses    (provisional_diagnosis appearing in >=2
--                               prescriptions in the last 6 months)
-- ============================================================================
CREATE OR REPLACE VIEW patient_problem_list_v AS
WITH chronic AS (
  SELECT
    doctor_id,
    patient_id,
    'chronic-condition'::text       AS kind,
    condition                        AS label,
    diagnosed_on                     AS since,
    note                             AS detail,
    NULL::uuid                       AS source_episode_id
  FROM patient_chronic_conditions
  WHERE archived_at IS NULL
),
episodes AS (
  SELECT
    doctor_id,
    patient_id,
    'active-episode'::text           AS kind,
    catalog_service_key              AS label,
    started_at::date                 AS since,
    'Episode (' || followups_used || '/' || max_followups || ' follow-ups used)' AS detail,
    id                               AS source_episode_id
  FROM care_episodes
  WHERE status = 'active'
),
recurring AS (
  SELECT
    doctor_id,
    patient_id,
    'recurring-diagnosis'::text       AS kind,
    provisional_diagnosis             AS label,
    MIN(created_at)::date             AS since,
    'Diagnosed ' || COUNT(*) || ' times in last 6 months' AS detail,
    NULL::uuid                        AS source_episode_id
  FROM prescriptions
  WHERE provisional_diagnosis IS NOT NULL
    AND TRIM(provisional_diagnosis) <> ''
    AND created_at >= now() - INTERVAL '6 months'
  GROUP BY doctor_id, patient_id, provisional_diagnosis
  HAVING COUNT(*) >= 2
)
SELECT * FROM chronic
UNION ALL
SELECT * FROM episodes
UNION ALL
SELECT * FROM recurring;

-- View inherits RLS from base tables; no separate policy needed.
```

**Service:**

```ts
export async function getProblemList(client, patientId) {
  const { data, error } = await client
    .from('patient_problem_list_v')
    .select('*')
    .eq('patient_id', patientId)
    .order('kind', { ascending: true })
    .order('since', { ascending: false });
  if (error) throw new Error(`getProblemList failed: ${error.message}`);
  return data ?? [];
}
```

**Component:**

```
Problem list
  ─────────────────
  🩺  Type 2 Diabetes                 since 2022-03
  🩺  Hypertension                     since 2024-08
  📋  Acne (recurring)                  diagnosed 4× in last 6mo
  🔄  Acne consultation episode         active · 2/3 follow-ups used
```

**Acceptance.**

- View runs in <50ms p95 for a patient with 100 prescriptions.
- Problem list populates correctly with mixed sources (chronic + episode + recurring).
- Recurring-diagnosis grouping is case-insensitive (TRIM + LOWER).
- Empty state for new patients ("No active problems recorded").
- T6.30 (AI assist) can later read this view as input context.

---

## Out of scope for T5

- Vital reference ranges by patient demographics (age/sex) — V1 uses fixed ranges; demographic-adjusted ranges are a v2 polish.
- Vital alerts ("BP > 180 — call patient now") — would need notification infrastructure; not in T5.
- Trend ML / anomaly detection — Decision E3 defers AI.
- Patient-side vital entry (patient logs their own BP at home) — patient portal is V2.
- ICD-10 / SNOMED for problem list — Decision E4.
- Print/export of trend charts — Rx PDF (T3) is the only patient-facing PDF in V1.
- Episode-level analytics page (visits per episode, time-to-resolution) — separate dashboard initiative.

---

## Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Vitals widget feels heavy mid-call | Capture widget is single-modal, all fields optional. Doctor enters 1 field and saves. |
| Problem list view becomes slow at scale (lots of prescriptions × patients) | Indexes on `prescriptions(doctor_id, patient_id, created_at)` already exist (migration 026). View can be materialized in v2 if needed; V1 keeps it live for accuracy. |
| Recurring-diagnosis bucketing is fooled by typos ("Acne" vs "acne" vs "Acne vulgaris") | Case-insensitive grouping (LOWER(TRIM(provisional_diagnosis))) reduces noise. Real fix is structured diagnosis coding (Decision E4 defers ICD-10). |
| Sparklines are misleading with sparse data (2 points) | Render only with ≥2 points; for 2 points the sparkline is a single line — clearly informative. Larger trend modal shows the dot count for transparency. |
| Episode FK backfill misses some rows | Backfill is one-shot SQL run during migration deploy; verify post-deploy via `SELECT COUNT(*) FROM prescriptions WHERE episode_id IS NULL AND appointment_id IN (SELECT id FROM appointments WHERE episode_id IS NOT NULL)` — should be 0. |

---

## Sequencing inside T5

```
T5.22 (vitals capture + sparklines)  ← needs T1.1 + T1.3 only
T5.23 (trend modal)                  ← parallel with T5.22
T5.24 (prescriptions.episode_id)     ← independent; can ship anytime
T5.25 (problem list view + section)  ← needs T5.24's link in place ideally
                                      (recurring-diagnosis grouping uses
                                      prescriptions.provisional_diagnosis,
                                      not episodes — safe to ship before T5.24,
                                      but problem-list-Episode item is richer
                                      with T5.24 in)
```

---

**Created:** 2026-05-03. **Status:** `Drafted`. **Owner:** TBD.
