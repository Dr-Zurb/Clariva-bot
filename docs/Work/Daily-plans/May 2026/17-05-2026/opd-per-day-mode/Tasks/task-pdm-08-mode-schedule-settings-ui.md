# Task pdm-08: `<ModeScheduleEditor>` settings UI + `<TestDateWidget>` + PD-Q8 advisory

## 17 May 2026 — Batch [OPD Per-Day Mode](../plan-opd-per-day-mode-batch.md) — Wave 4, Lane α step 1 — **M, ~8h**

---

## Task overview

The doctor-facing settings editor for `mode_schedule`. Ships:

1. **`<ModeScheduleEditor>`** — the main editor. Three sub-editors plus a default-mode radio:
   - **Default mode** — radio: `slot` / `queue`.
   - **`<WeeklyOverridesEditor>`** — 7 weekday rows, each with a `inherit` / `slot` / `queue` radio.
   - **`<DateRangeOverridesEditor>`** — drag-to-reorder list of `(from, to, mode)` rows. `LATER entry wins on overlap` — visualised via the list's order. Add / delete / reorder buttons.
   - **`<DateOverridesEditor>`** — drag-to-reorder list of `(date, mode)` rows. Same pattern.
2. **`<TestDateWidget>`** — single date input + live readout: *"→ {mode} (from {source})"*. Calls `resolveModePolicyForDate` on the backend (via a new helper `previewResolveModeForDate(doctorId, date)`) every 300ms. Lets the doctor sanity-check rule combinations without leaving the page.
3. **PD-Q8 inline advisory** — whenever a `date_override` or a `date_range_override`'s `from` is in the past, the corresponding row renders an inline warning: *"This rule starts in the past. Past dates are unaffected (their mode is already a fact); the rule applies from {today} forward."*
4. **Mirror `default_mode` to `doctor_settings.opd_mode` on first save** — one-time alignment per the risk-register row 8 mitigation. On every subsequent save, leave `doctor_settings.opd_mode` alone (writes are a no-op from this UI). pdm-08 implements the mirror; pdm-12 may add a lint rule for direct writes.
5. **Optimistic save + error recovery** — the editor's "Save" button PUTs through to the existing `PUT /api/v1/settings/doctor` endpoint (which already validates via pdm-07's `validateModeSchedule`). On 400, surface the validator error inline; on success, snapshot the saved state.

**Estimated time:** ~8h (1.5h scaffold + form state + dnd-kit setup; 2h three sub-editors; 1.5h `<TestDateWidget>` + backend preview endpoint; 1h PD-Q8 advisory + mirror logic; 1h tests + mobile smoke + a11y; 1h verification).

**Status:** Pending.

**Hard deps:** pdm-07 (resolver + validator; `validateModeSchedule` rejects invalid shapes server-side; a new lightweight `previewResolveModeForDate` endpoint is added here that wraps `resolveModePolicyForDate`).

**Source:** [plan-opd-per-day-mode-batch.md § Wave 4](../plan-opd-per-day-mode-batch.md#wave-4--mode-scheduling-policy--booking-widget-integration-2-tasks-14h-single-sequential-lane) + `S1.6` and `DL-9` + `PD-Q8` + `PD-D3` in [Product plans/plan-opd-per-day-mode.md](../../../Product%20plans/plan-opd-per-day-mode.md).

---

## Model & execution guidance

**Recommended model:** **Auto** (default). Form-heavy React UI with drag-to-reorder via `dnd-kit`. The patterns are well-established in the project (verify by globbing `frontend/components/**/dnd*` or `frontend/**/SortableContext*`); the editor is just three lists + radios. **Not on the hard-rules list.**

**Per-message escalation rule:** if Auto stalls on `dnd-kit` configuration (the `useSortable` hook + `SortableContext` setup can be fiddly), escalate that **one message** to Opus 4.7 Extra High.

**Manual-Sonnet fallback:** only if A/B-testing.

**New chat?** **Yes** — fresh chat. Pre-load:

- This task file.
- `frontend/components/settings/doctor/` — pre-load whatever the existing OPD settings folder structure looks like (the task assumes `frontend/components/settings/doctor/opd/`; adjust if the project organises differently).
- `frontend/components/ui/` (shadcn primitives — RadioGroup, Input, Button, Label, Card, Alert).
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` — verify these are already deps in `package.json`. If not, add them in this task (or surface as a blocker).
- `frontend/lib/api.ts` (post-pdm-07 — extend with the new helpers).
- `frontend/types/doctor-settings.ts` — verify `OpdPoliciesShape` and `ModeSchedule` types are exported (or mirror pdm-07's backend types).
- `backend/src/services/opd/opd-mode-service.ts` (post-pdm-07 — `resolveModePolicyForDate`).
- Source plan §DL-9, §PD-Q8, §PD-D3 (no calendar viz).
- Look for an existing settings page that already manages parts of `doctor_settings.opd_policies` for layout precedent.

**Estimated turns:** 6–8 turns (1 scaffold + form state, 1 default + weekly editors, 1 range editor with dnd, 1 date overrides editor with dnd, 1 TestDateWidget + backend endpoint, 1 PD-Q8 advisory + mirror, 1 tests + verification).

---

## Acceptance criteria

### Step 1 — Backend endpoint: preview resolver

- [ ] Add a lightweight endpoint that the `<TestDateWidget>` consumes. **Doctor-only auth** (it leaks no third-party data; the doctor is querying their own policies):

  ```ts
  // backend/src/routes/api/v1/opd.ts
  router.get('/mode-schedule/test-date', requireDoctorAuth, getOpdModeScheduleTestDate);
  ```

- [ ] **Controller:**

  ```ts
  export async function getOpdModeScheduleTestDate(req: AuthedRequest, res: Response) {
    const doctorId = req.user.id;
    const { date } = req.query;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Query param `date` (YYYY-MM-DD) is required.' });
    }
    const resolved = await resolveSessionDayMode(supabaseAdmin, doctorId, date);
    return res.json({
      date,
      mode: resolved.mode,
      source: resolved.source, // 'fact' | 'policy' | 'doctor_settings' | 'default'
    });
  }
  ```

  **Why `resolveSessionDayMode` (full cascade) and not just `resolveModePolicyForDate`?** The widget should show the actual mode a booking would land in — including the fact table (if today's session is already materialised), the column fallback, and the ultimate default. The doctor's mental model is "what mode would happen on date X?", not "what does my policy say specifically?". Showing the source tag (`fact` / `policy` / `doctor_settings` / `default`) is the disambiguator.

- [ ] **Frontend API helper** in `frontend/lib/api.ts`:

  ```ts
  export async function previewResolveModeForDate(
    token: string,
    date: string,
  ): Promise<{ data: { date: string; mode: OpdMode; source: 'fact' | 'policy' | 'doctor_settings' | 'default' } }> {
    const res = await fetch(`${API_BASE}/api/v1/opd/mode-schedule/test-date?date=${encodeURIComponent(date)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return { data: await res.json() };
  }
  ```

### Step 2 — Scaffold + form state

- [ ] Identify the existing settings page that owns `doctor_settings.opd_policies`. If none, create a new section in `frontend/app/dashboard/settings/opd/page.tsx` (or wherever the project's settings tree lives). Mount the new editor as a card.

- [ ] Create `frontend/components/settings/doctor/opd/ModeScheduleEditor.tsx`:

  ```tsx
  'use client';

  import { useState, useCallback, useMemo } from 'react';
  import type { ModeSchedule, ModeScheduleDateRangeOverride, ModeScheduleDateOverride } from '@/types/doctor-settings';
  import type { OpdMode } from '@/types/doctor-settings';
  import { ModeScheduleDefaultEditor } from './ModeScheduleDefaultEditor';
  import { ModeScheduleWeeklyEditor } from './ModeScheduleWeeklyEditor';
  import { ModeScheduleDateRangeEditor } from './ModeScheduleDateRangeEditor';
  import { ModeScheduleDateOverridesEditor } from './ModeScheduleDateOverridesEditor';
  import { ModeScheduleTestDateWidget } from './ModeScheduleTestDateWidget';

  export interface ModeScheduleEditorProps {
    token: string;
    initialSchedule: ModeSchedule;
    /** doctor_settings.opd_mode — used for the mirror-on-first-save fallback */
    currentOpdModeColumn: OpdMode;
    onSave: (schedule: ModeSchedule, mirroredOpdMode?: OpdMode) => Promise<void>;
    saveError?: string | null;
    saving: boolean;
  }

  export function ModeScheduleEditor(props: ModeScheduleEditorProps) {
    const { token, initialSchedule, currentOpdModeColumn, onSave, saveError, saving } = props;
    const [schedule, setSchedule] = useState<ModeSchedule>(initialSchedule);
    const [dirty, setDirty] = useState(false);

    const updateSchedule = useCallback((updater: (prev: ModeSchedule) => ModeSchedule) => {
      setSchedule((prev) => {
        const next = updater(prev);
        setDirty(true);
        return next;
      });
    }, []);

    const handleSave = useCallback(async () => {
      // Mirror logic: if this is the doctor's first save AND default_mode is defined,
      // pass it as the mirror target. The settings controller writes it to doctor_settings.opd_mode.
      const isFirstSave = !initialSchedule.default_mode && Boolean(schedule.default_mode);
      const mirroredOpdMode = isFirstSave && schedule.default_mode
        ? schedule.default_mode
        : undefined;

      await onSave(schedule, mirroredOpdMode);
      setDirty(false);
    }, [schedule, initialSchedule, onSave]);

    return (
      <Card>
        <CardHeader>
          <CardTitle>Mode schedule</CardTitle>
          <CardDescription>
            Set how each day's OPD operates. Already-booked dates keep their assigned mode;
            policy changes apply to future bookings only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ModeScheduleDefaultEditor
            value={schedule.default_mode}
            onChange={(m) => updateSchedule((s) => ({ ...s, default_mode: m }))}
            currentOpdModeColumn={currentOpdModeColumn}
          />
          <ModeScheduleWeeklyEditor
            value={schedule.weekly_overrides ?? {}}
            onChange={(w) => updateSchedule((s) => ({ ...s, weekly_overrides: w }))}
          />
          <ModeScheduleDateRangeEditor
            value={schedule.date_range_overrides ?? []}
            onChange={(r) => updateSchedule((s) => ({ ...s, date_range_overrides: r }))}
          />
          <ModeScheduleDateOverridesEditor
            value={schedule.date_overrides ?? []}
            onChange={(d) => updateSchedule((s) => ({ ...s, date_overrides: d }))}
          />
          <ModeScheduleTestDateWidget token={token} />
          {saveError && <Alert variant="destructive"><AlertDescription>{saveError}</AlertDescription></Alert>}
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button variant="ghost" onClick={() => { setSchedule(initialSchedule); setDirty(false); }} disabled={!dirty}>Discard</Button>
          <Button onClick={handleSave} disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </CardFooter>
      </Card>
    );
  }
  ```

### Step 3 — `<ModeScheduleDefaultEditor>`

- [ ] Simple radio (slot / queue) with a help line:

  ```tsx
  export function ModeScheduleDefaultEditor({ value, onChange, currentOpdModeColumn }: ...) {
    const effective = value ?? currentOpdModeColumn ?? 'slot';
    return (
      <div>
        <Label className="text-base font-semibold">Default mode</Label>
        <p className="mb-2 text-sm text-muted-foreground">
          Used for any future date not covered by a more specific rule below. Currently: <strong>{effective}</strong>.
          {!value && <span> (Inherited from your global OPD setting.)</span>}
        </p>
        <RadioGroup value={effective} onValueChange={(v) => onChange(v as OpdMode)}>
          <div className="flex items-center gap-2"><RadioGroupItem value="slot" id="dm-slot" /><Label htmlFor="dm-slot">Slot mode</Label></div>
          <div className="flex items-center gap-2"><RadioGroupItem value="queue" id="dm-queue" /><Label htmlFor="dm-queue">Queue mode</Label></div>
        </RadioGroup>
      </div>
    );
  }
  ```

### Step 4 — `<ModeScheduleWeeklyEditor>`

- [ ] 7 rows, each `(weekday label, radio with 3 options: Inherit / Slot / Queue)`. `Inherit` clears the entry (resolver falls through to default).

  ```tsx
  export function ModeScheduleWeeklyEditor({ value, onChange }: ...) {
    const weekdays: { key: keyof ModeScheduleWeeklyOverrides; label: string }[] = [
      { key: 'mon', label: 'Monday' },
      { key: 'tue', label: 'Tuesday' },
      // ... wed thu fri sat sun
    ];
    return (
      <div>
        <Label className="text-base font-semibold">Weekly overrides</Label>
        <p className="mb-2 text-sm text-muted-foreground">Override the default for specific weekdays. Inherit = use the default mode.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {weekdays.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between rounded-md border border-border p-3">
              <span className="font-medium">{label}</span>
              <RadioGroup
                value={value[key] ?? '_inherit'}
                onValueChange={(v) => {
                  const next = { ...value };
                  if (v === '_inherit') delete next[key];
                  else next[key] = v as OpdMode;
                  onChange(next);
                }}
                orientation="horizontal"
              >
                <div className="flex items-center gap-1"><RadioGroupItem value="_inherit" id={`${key}-inherit`} /><Label htmlFor={`${key}-inherit`} className="text-xs">Inherit</Label></div>
                <div className="flex items-center gap-1"><RadioGroupItem value="slot" id={`${key}-slot`} /><Label htmlFor={`${key}-slot`} className="text-xs">Slot</Label></div>
                <div className="flex items-center gap-1"><RadioGroupItem value="queue" id={`${key}-queue`} /><Label htmlFor={`${key}-queue`} className="text-xs">Queue</Label></div>
              </RadioGroup>
            </div>
          ))}
        </div>
      </div>
    );
  }
  ```

### Step 5 — `<ModeScheduleDateRangeEditor>` (drag-to-reorder)

- [ ] Use `@dnd-kit` for drag-to-reorder. Each row: `[from input] – [to input] – [mode select] – [drag handle] – [delete]`. PD-Q8 advisory rendered when `from < today`.

  ```tsx
  import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
  import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
  import { CSS } from '@dnd-kit/utilities';
  import { GripVertical, Trash2 } from 'lucide-react';
  import { isPastDate, todayLocalIso } from '@/lib/dates';

  function SortableRangeRow({ row, index, onChange, onDelete }: ...) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: `range-${index}` });
    const isFromPast = isPastDate(row.from);
    return (
      <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="rounded-md border border-border p-3 space-y-2">
        <div className="flex items-center gap-2">
          <button {...attributes} {...listeners} className="cursor-grab" aria-label="Drag to reorder"><GripVertical className="h-4 w-4 text-muted-foreground" /></button>
          <Input type="date" value={row.from} onChange={(e) => onChange({ ...row, from: e.target.value })} className="w-40" />
          <span className="text-muted-foreground">–</span>
          <Input type="date" value={row.to} onChange={(e) => onChange({ ...row, to: e.target.value })} className="w-40" />
          <Select value={row.mode} onValueChange={(m) => onChange({ ...row, mode: m as OpdMode })}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="slot">Slot</SelectItem>
              <SelectItem value="queue">Queue</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Delete row"><Trash2 className="h-4 w-4" /></Button>
        </div>
        {isFromPast && (
          <Alert>
            <AlertDescription className="text-xs">
              This rule starts in the past. Past dates are unaffected (their mode is already a fact); the rule applies from {todayLocalIso()} forward.
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  export function ModeScheduleDateRangeEditor({ value, onChange }: ...) {
    const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

    const handleDragEnd = (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const fromIndex = parseInt((active.id as string).replace('range-', ''), 10);
      const toIndex = parseInt((over.id as string).replace('range-', ''), 10);
      onChange(arrayMove(value, fromIndex, toIndex));
    };

    return (
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div>
            <Label className="text-base font-semibold">Date-range overrides</Label>
            <p className="text-sm text-muted-foreground">Later rows win on overlap. Drag to reorder.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => onChange([...value, { from: todayLocalIso(), to: todayLocalIso(), mode: 'slot' as OpdMode }])}>
            + Add range
          </Button>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={value.map((_, i) => `range-${i}`)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {value.map((row, index) => (
                <SortableRangeRow
                  key={`range-${index}`}
                  row={row}
                  index={index}
                  onChange={(updated) => {
                    const next = [...value];
                    next[index] = updated;
                    onChange(next);
                  }}
                  onDelete={() => onChange(value.filter((_, i) => i !== index))}
                />
              ))}
              {value.length === 0 && <p className="text-sm text-muted-foreground">No date-range overrides. Click "+ Add range" to add one.</p>}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    );
  }
  ```

### Step 6 — `<ModeScheduleDateOverridesEditor>`

- [ ] Same structure as the range editor, but rows are `(date, mode)`:

  ```tsx
  // Identical drag-to-reorder pattern; row is a single date input + mode select + delete + PD-Q8 advisory.
  ```

  Keep the implementation symmetric with the range editor for code review ergonomics.

### Step 7 — `<ModeScheduleTestDateWidget>`

- [ ] Date input + debounced backend call + readout:

  ```tsx
  export function ModeScheduleTestDateWidget({ token }: { token: string }) {
    const [date, setDate] = useState<string>(todayLocalIso());
    const [result, setResult] = useState<{ mode: OpdMode; source: string } | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Debounce: 300ms after typing stops.
    useEffect(() => {
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        setResult(null);
        setError(null);
        return;
      }
      const handle = setTimeout(async () => {
        try {
          const { data } = await previewResolveModeForDate(token, date);
          setResult({ mode: data.mode, source: data.source });
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Lookup failed');
          setResult(null);
        }
      }, 300);
      return () => clearTimeout(handle);
    }, [token, date]);

    return (
      <div className="rounded-md border border-border bg-muted/30 p-3">
        <Label className="text-sm font-semibold">Test a date</Label>
        <p className="mb-2 text-xs text-muted-foreground">Type any date to see which mode the booking flow would use.</p>
        <div className="flex items-center gap-2">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
          <span className="text-sm">→</span>
          {result ? (
            <span className="text-sm">
              <strong>{result.mode}</strong>
              <span className="ml-1 text-xs text-muted-foreground">(from {result.source})</span>
            </span>
          ) : error ? (
            <span className="text-sm text-destructive">{error}</span>
          ) : (
            <span className="text-sm text-muted-foreground">…</span>
          )}
        </div>
      </div>
    );
  }
  ```

  **Why debounce 300ms?** Doctor can type a date quickly; debouncing prevents 5 backend calls during the 5 keystrokes of "2026-".

### Step 8 — Wire the editor into the settings page + save mirror

- [ ] In the settings page (e.g., `frontend/app/dashboard/settings/opd/page.tsx`), mount the editor:

  ```tsx
  const { data: settings } = await getDoctorSettings(token);
  const initialSchedule: ModeSchedule = (settings?.opd_policies?.mode_schedule as ModeSchedule) ?? {};
  const currentOpdModeColumn = settings?.opd_mode ?? 'slot';

  // Save handler:
  const handleSaveModeSchedule = async (schedule: ModeSchedule, mirroredOpdMode?: OpdMode) => {
    setSaving(true);
    setSaveError(null);
    try {
      await updateDoctorSettings(token, {
        opd_policies: {
          ...settings?.opd_policies,
          mode_schedule: schedule,
        },
        ...(mirroredOpdMode ? { opd_mode: mirroredOpdMode } : {}), // mirror only on first save
      });
      // refetch settings
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return <ModeScheduleEditor token={token} initialSchedule={initialSchedule} currentOpdModeColumn={currentOpdModeColumn} onSave={handleSaveModeSchedule} saveError={saveError} saving={saving} />;
  ```

- [ ] **Backend acceptance of the `opd_mode` mirror field** — verify `PUT /api/v1/settings/doctor` accepts an `opd_mode` field alongside `opd_policies`. It almost certainly does (existing settings update endpoint); if not, add it.

### Step 9 — Mobile + a11y

- [ ] **Mobile (375px DevTools):** weekly editor grid collapses to 1 column (already handled by `grid-cols-1 sm:grid-cols-2`). Range editor rows wrap vertically on mobile (use `flex-wrap`).
- [ ] **Drag-to-reorder on mobile:** `dnd-kit`'s `PointerSensor` supports touch by default. Test on DevTools mobile simulation; verify long-press → drag works.
- [ ] **Keyboard:** `dnd-kit`'s `KeyboardSensor` (added in the sensors array) allows arrow-key reordering. Verify with the focus on a row's drag handle: Up/Down moves the row.
- [ ] **Screen readers:** drag handle has `aria-label="Drag to reorder"`. Each row has its content properly labelled.

### Step 10 — Tests

- [ ] **`<ModeScheduleEditor>`** snapshot test in `frontend/__tests__/components/settings/opd/ModeScheduleEditor.test.tsx`:

  - Renders with empty schedule → all sub-editors visible.
  - Renders with a non-empty schedule → values populate.
  - "Save" disabled until dirty.
  - "Discard" reverts to `initialSchedule`.

- [ ] **`<ModeScheduleDateRangeEditor>`** tests:

  - Add row → list grows by 1.
  - Edit row → `onChange` fires with updated row.
  - Delete row → list shrinks.
  - Drag row to new position → `onChange` fires with `arrayMove` result.
  - Row with `from < today` → PD-Q8 advisory renders.

- [ ] **`<ModeScheduleTestDateWidget>`** test (with mocked API):

  - Type a date → after 300ms, calls `previewResolveModeForDate` → readout displays mode + source.
  - Type invalid date → no API call.
  - API error → error message displayed.

### Step 11 — Verification

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.
- [ ] `pnpm --filter frontend test -- ModeScheduleEditor` all green.
- [ ] **End-to-end smoke (manual):**
  1. Open `/dashboard/settings/opd` as a doctor with no `mode_schedule` set. Editor renders empty defaults.
  2. Set `default_mode = 'queue'`. Save. Refresh — value persists. Verify `doctor_settings.opd_mode = 'queue'` was mirrored.
  3. Add a `weekly_overrides.tue = 'slot'`. Save. Refresh — value persists.
  4. Add a `date_range_override` from yesterday to a week from today. PD-Q8 advisory renders.
  5. Use `<TestDateWidget>` to test: a Tuesday inside the range → returns `'slot'` from `policy` (range beats weekly).
  6. Drag the range to the bottom of a second range covering the same dates → `<TestDateWidget>` for an overlapping date now returns the second range's mode (later-wins).
  7. Drag-to-reorder works via mouse, keyboard, and touch (mobile DevTools).
- [ ] **Public booking flow smoke** — after saving a Tuesday `weekly_overrides.tue = 'queue'`, open the public booking widget. Pick a future Tuesday. Verify the widget renders the queue token-request UI (pdm-07 wiring).
- [ ] **`rg` checks:**

  ```bash
  rg "ModeScheduleEditor\b" frontend/
  # Expected: definition + 1 mount in the settings page.

  rg "previewResolveModeForDate\b" frontend/
  # Expected: helper definition + 1 use in TestDateWidget.
  ```

---

## Out of scope

- **Calendar viz (60-day mode preview)** — PD-D3 deferred.
- **RRULE-style recurrence** — PD-D7 deferred.
- **Per-service mode constraints** — PD-D5 deferred.
- **Bulk-import / export of `mode_schedule` JSON** — defer.
- **Conflict resolution prompt** ("This date overlaps with an existing range — keep both?") — the editor accepts any input, the validator (pdm-07) catches structural issues, and the resolver handles overlap deterministically (later wins). Conflict UI is a polish item.
- **Validation of `mode_schedule` shape on the frontend** — the validator runs on the backend (pdm-07). Frontend renders the validator error; doesn't try to pre-validate. (Could add client-side `validateModeSchedule` mirroring for instant feedback in a follow-up.)
- **Undo after delete** — if a doctor deletes a row by accident, they discard + reload. No multi-step undo stack.

---

## Files expected to touch

**New:**

- `frontend/components/settings/doctor/opd/ModeScheduleEditor.tsx` (~120 LOC — parent).
- `frontend/components/settings/doctor/opd/ModeScheduleDefaultEditor.tsx` (~40 LOC).
- `frontend/components/settings/doctor/opd/ModeScheduleWeeklyEditor.tsx` (~70 LOC).
- `frontend/components/settings/doctor/opd/ModeScheduleDateRangeEditor.tsx` (~150 LOC — dnd + row).
- `frontend/components/settings/doctor/opd/ModeScheduleDateOverridesEditor.tsx` (~130 LOC — dnd + row).
- `frontend/components/settings/doctor/opd/ModeScheduleTestDateWidget.tsx` (~80 LOC).
- `frontend/lib/dates.ts` (~30 LOC delta — `isPastDate`, `todayLocalIso` if not already present).
- `frontend/__tests__/components/settings/opd/ModeScheduleEditor.test.tsx` (~100 LOC).
- `frontend/__tests__/components/settings/opd/ModeScheduleDateRangeEditor.test.tsx` (~120 LOC).
- `frontend/__tests__/components/settings/opd/ModeScheduleTestDateWidget.test.tsx` (~100 LOC).

**Modified:**

- `backend/src/routes/api/v1/opd.ts` (~3 LOC delta — new test-date route).
- `backend/src/controllers/opd-doctor-controller.ts` (~30 LOC delta — `getOpdModeScheduleTestDate` controller).
- `frontend/lib/api.ts` (~25 LOC delta — `previewResolveModeForDate`).
- `frontend/types/doctor-settings.ts` (~30 LOC delta — `ModeSchedule` mirror types if not already present).
- `frontend/app/dashboard/settings/opd/page.tsx` (or equivalent) (~50 LOC delta — mount the editor + wire save).

---

## Notes / open decisions

1. **Why three separate sub-editor components instead of one big form?** Future maintenance: each sub-editor has its own concerns (radios vs drag-to-reorder vs date inputs). Splitting them keeps each file < 200 LOC and lets pdm-08 ship 4 smaller files instead of one 600-line monster.
2. **Why `inherit` radio in weekly editor instead of a checkbox or separate "override" toggle?** `inherit` is conceptually a third state ("don't override this weekday"); a radio with 3 options is the cleanest UX. Cheap variant: use a 3-state `<ToggleGroup>` for compactness; both work.
3. **What if the doctor's settings page already has a different OPD section?** Mount the new editor as a separate card in the same page. Don't rewire the existing surface. pdm-08's task is additive.
4. **Why does the mirror logic only fire on first save?** Per risk-register row 8: the column drifts from `default_mode` if the doctor edits one but not the other; the one-time mirror aligns them. Subsequent edits to `default_mode` should not silently rewrite the column (the doctor may have intentionally diverged them via the API or an earlier settings session).
5. **`isFirstSave` detection** — `!initialSchedule.default_mode && Boolean(schedule.default_mode)` means "the doctor is setting `default_mode` for the first time in this session". This catches the case correctly but misses "doctor cleared `default_mode` and re-set it" (won't re-mirror). Acceptable.
6. **Mobile drag — what if it's not as smooth as the existing `dnd-kit` precedents in the project?** If the project doesn't already use `dnd-kit`, this task adds the deps and proves the pattern. If it does, mirror the existing setup verbatim.
7. **Why doesn't the editor compute `effective mode for today` client-side?** Because the resolver lives on the backend; replicating it client-side risks drift. `<TestDateWidget>` calls the backend to stay aligned.
8. **What if the doctor's `opd_mode` column is null/undefined?** The default radio shows `'slot'` (the ultimate default). The "Currently: …" line clarifies the source.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Read but do not modify:**
  - `backend/src/services/opd/opd-mode-service.ts` (post-pdm-07) — resolver.
  - `backend/src/utils/validation.ts` (post-pdm-07) — `validateModeSchedule`.
- **Source decisions:** [Product plans/plan-opd-per-day-mode.md § DL-9, DL-10, PD-Q8, PD-D3](../../../Product%20plans/plan-opd-per-day-mode.md).
- **Wave gate:** [`EXECUTION-ORDER-opd-per-day-mode.md` § Wave 4 gate](./EXECUTION-ORDER-opd-per-day-mode.md#wave-4-gate-after-pdm-08).
- **Previous task:** [`task-pdm-07-mode-policy-resolver-and-booking-integration.md`](./task-pdm-07-mode-policy-resolver-and-booking-integration.md).
- **Next task:** [`task-pdm-09-overrun-flagging-and-fallback.md`](./task-pdm-09-overrun-flagging-and-fallback.md).
- **Consumer:** the `<SessionModeConversionDialog>` from pdm-05 is reused here for the per-day override behaviour (open the dialog from a settings list item if the doctor wants to flip a specific date) — defer this enhancement; settings is for policy, OPD tab is for per-day.

---

**Owner:** TBD
**Created:** 2026-05-17
**Status:** Pending
