# Task pdm-10: "Needs attention" overrun tray UI + `<SessionOverrunBulkResolveDialog>`

## 17 May 2026 — Batch [OPD Per-Day Mode](../plan-opd-per-day-mode-batch.md) — Wave 5, Lane α step 2 — **M, ~4h**

---

## Task overview

Frontend mount for the DL-7 + DL-8 backend shipped in pdm-09. Ships:

1. **`<SessionOverrunTray>`** — a collapsible card mounted at the top of `OpdTodayClient` (above the toolbar) when the currently-viewed date has overrun rows. Shows row count + a primary "Resolve all" button.
2. **`<SessionOverrunBulkResolveDialog>`** — opened from the tray's primary button. Two-pane layout:
   - **Bulk-action pane** (top) — radio with the 5 DL-7 actions; primary radio = `reschedule_all`.
   - **Per-row override grid** (bottom) — one row per overrun appointment. Each row has its own action dropdown (default = bulk action) + an inline date+time picker that appears when the row's action is `reschedule_per_patient`.
3. **`useSessionOverrun(token, date)`** hook — fetches overrun rows from `GET /api/v1/opd/session/overrun?date=...` (pdm-09's endpoint). Returns `{ rows, count, isLoading, error, refetch }`.
4. **Submit + refetch flow** — confirm button POSTs to `/api/v1/opd/session/overrun/bulk-resolve` (pdm-09's endpoint), then refetches both the overrun list and the parent session payload (`getDoctorOpdSession`). On partial failure, the tray re-renders showing only still-flagged rows; the dialog surfaces the per-row failure messages in a banner.
5. **Empty-state copy** — if all overrun rows are resolved, the tray collapses to a one-line *"All caught up"* indicator for ~3s, then hides entirely.

**Estimated time:** ~4h (1h tray + hook, 2h bulk-resolve dialog, ~30min mobile + a11y, ~30min tests + verification).

**Status:** Pending.

**Hard deps:** pdm-09 (backend endpoints + types).

**Source:** [plan-opd-per-day-mode-batch.md § Wave 5](../plan-opd-per-day-mode-batch.md#wave-5--session-overrun-handling-2-tasks-10h-single-sequential-lane) + `DL-7` in [Product plans/plan-opd-per-day-mode.md](../../../Product%20plans/plan-opd-per-day-mode.md).

---

## Model & execution guidance

**Recommended model:** **Auto** (default). Standard React form patterns + collapsible card + radio-group + per-row override grid. **Not on the hard-rules list.**

**Per-message escalation rule:** if Auto gets confused about the **per-row override grid's state shape** (a Map keyed by appointment ID with possibly-mixed actions and possibly-missing reschedule targets), escalate that **one message** to Opus 4.7 Extra High.

**Manual-Sonnet fallback:** only if A/B-testing.

**New chat?** **Yes** — fresh chat. Pre-load:

- This task file.
- `frontend/components/opd/OpdTodayClient.tsx` (post-pdm-03 — the mount point).
- `frontend/components/ui/` (shadcn primitives — Card, RadioGroup, Dialog, Select, Input, Button, Alert, Badge).
- `frontend/lib/api.ts` (post-pdm-09 — extend with `getOpdSessionOverrun` and `bulkResolveOpdSessionOverrun` helpers).
- pdm-09 task file (for the response shape).
- Source plan §DL-7.

**Estimated turns:** 5–6 turns (1 hook + tray, 2 dialog + per-row grid, 1 mobile + a11y, 1 tests + verification).

---

## Acceptance criteria

### Step 1 — API helpers + types

- [ ] In `frontend/lib/api.ts`:

  ```ts
  export interface OverrunRow {
    id: string;
    status: 'pending' | 'confirmed';
    appointment_date: string;
    opd_event_type: string | null;
    modality: string;
    patients: { id: string; first_name: string; last_name: string; phone: string };
    services: { id: string; name: string; duration_min: number };
  }

  export type OverrunAction =
    | 'reschedule_all'
    | 'reschedule_per_patient'
    | 'mark_completed'
    | 'cancel_refund'
    | 'mark_no_show';

  export interface PerRowOverride {
    appointmentId: string;
    action: OverrunAction;
    rescheduleTo?: string;
  }

  export interface PerRowResult {
    appointmentId: string;
    action: OverrunAction;
    status: 'success' | 'skipped' | 'error';
    message?: string;
  }

  export async function getOpdSessionOverrun(token: string, date: string): Promise<{
    data: { date: string; count: number; rows: OverrunRow[] };
  }> {
    const res = await fetch(`${API_BASE}/api/v1/opd/session/overrun?date=${encodeURIComponent(date)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return { data: await res.json() };
  }

  export async function bulkResolveOpdSessionOverrun(token: string, body: {
    date: string;
    action: OverrunAction;
    perRowOverrides?: PerRowOverride[];
  }): Promise<{ data: { resolved: number; results: PerRowResult[] } }> {
    const res = await fetch(`${API_BASE}/api/v1/opd/session/overrun/bulk-resolve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return { data: await res.json() };
  }
  ```

### Step 2 — `useSessionOverrun` hook

- [ ] Create `frontend/hooks/useSessionOverrun.ts`:

  ```ts
  import { useState, useEffect, useCallback } from 'react';
  import { getOpdSessionOverrun, type OverrunRow } from '@/lib/api';

  export interface UseSessionOverrunResult {
    rows: OverrunRow[];
    count: number;
    isLoading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
  }

  export function useSessionOverrun(token: string | null, date: string | null): UseSessionOverrunResult {
    const [rows, setRows] = useState<OverrunRow[]>([]);
    const [count, setCount] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refetch = useCallback(async () => {
      if (!token || !date) return;
      setIsLoading(true);
      setError(null);
      try {
        const { data } = await getOpdSessionOverrun(token, date);
        setRows(data.rows);
        setCount(data.count);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load overrun');
      } finally {
        setIsLoading(false);
      }
    }, [token, date]);

    useEffect(() => {
      void refetch();
    }, [refetch]);

    return { rows, count, isLoading, error, refetch };
  }
  ```

### Step 3 — `<SessionOverrunTray>`

- [ ] Create `frontend/components/opd/overrun/SessionOverrunTray.tsx`:

  ```tsx
  'use client';

  import { useState } from 'react';
  import { AlertTriangle } from 'lucide-react';
  import type { OverrunRow } from '@/lib/api';
  import { SessionOverrunBulkResolveDialog } from './SessionOverrunBulkResolveDialog';

  export interface SessionOverrunTrayProps {
    token: string;
    date: string;
    rows: OverrunRow[];
    onResolved: () => void; // refetch parent
  }

  export function SessionOverrunTray({ token, date, rows, onResolved }: SessionOverrunTrayProps) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [justResolved, setJustResolved] = useState(false);

    if (rows.length === 0) {
      if (justResolved) {
        // 3s "all caught up" indicator, then hide.
        setTimeout(() => setJustResolved(false), 3000);
        return (
          <Card className="mb-3 border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30">
            <CardContent className="flex items-center gap-2 py-3">
              <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm font-medium">All caught up — no patients past session end.</span>
            </CardContent>
          </Card>
        );
      }
      return null;
    }

    return (
      <>
        <Card className="mb-3 border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30">
          <CardContent className="flex items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="text-sm font-semibold">
                  {rows.length} patient{rows.length === 1 ? '' : 's'} weren't seen
                </p>
                <p className="text-xs text-muted-foreground">
                  Past session end + 30 min. Resolve to keep the schedule clean.
                </p>
              </div>
            </div>
            <Button onClick={() => setDialogOpen(true)}>Resolve all</Button>
          </CardContent>
        </Card>
        <SessionOverrunBulkResolveDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          token={token}
          date={date}
          rows={rows}
          onResolved={() => {
            setDialogOpen(false);
            setJustResolved(true);
            onResolved();
          }}
        />
      </>
    );
  }
  ```

### Step 4 — `<SessionOverrunBulkResolveDialog>`

- [ ] Create `frontend/components/opd/overrun/SessionOverrunBulkResolveDialog.tsx`:

  ```tsx
  'use client';

  import { useState, useMemo, useCallback } from 'react';
  import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
  import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
  import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
  import { Input } from '@/components/ui/input';
  import { Label } from '@/components/ui/label';
  import { Button } from '@/components/ui/button';
  import { Alert, AlertDescription } from '@/components/ui/alert';
  import { bulkResolveOpdSessionOverrun, type OverrunAction, type OverrunRow, type PerRowOverride, type PerRowResult } from '@/lib/api';

  export interface SessionOverrunBulkResolveDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    token: string;
    date: string;
    rows: OverrunRow[];
    onResolved: () => void;
  }

  type RowOverrideState = { action: OverrunAction; rescheduleTo: string };

  export function SessionOverrunBulkResolveDialog({
    open,
    onOpenChange,
    token,
    date,
    rows,
    onResolved,
  }: SessionOverrunBulkResolveDialogProps) {
    const [bulkAction, setBulkAction] = useState<OverrunAction>('reschedule_all');
    const [perRowOverrides, setPerRowOverrides] = useState<Record<string, RowOverrideState>>({});
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [partialResults, setPartialResults] = useState<PerRowResult[] | null>(null);

    // Effective action per row: override > bulk action.
    const effectiveAction = useCallback(
      (rowId: string): OverrunAction => perRowOverrides[rowId]?.action ?? bulkAction,
      [perRowOverrides, bulkAction],
    );

    const handleRowActionChange = (rowId: string, action: OverrunAction) => {
      setPerRowOverrides((prev) => ({
        ...prev,
        [rowId]: { ...prev[rowId], action, rescheduleTo: prev[rowId]?.rescheduleTo ?? '' },
      }));
    };

    const handleRowRescheduleToChange = (rowId: string, value: string) => {
      setPerRowOverrides((prev) => ({
        ...prev,
        [rowId]: { ...prev[rowId], action: prev[rowId]?.action ?? bulkAction, rescheduleTo: value },
      }));
    };

    const handleSubmit = async () => {
      setSubmitting(true);
      setError(null);
      setPartialResults(null);
      try {
        // Build perRowOverrides payload: only include rows that differ from the bulk action
        // OR are reschedule_per_patient (always need rescheduleTo).
        const overridesPayload: PerRowOverride[] = rows
          .filter((row) => {
            const action = effectiveAction(row.id);
            const isOverride = perRowOverrides[row.id]?.action !== undefined && perRowOverrides[row.id]?.action !== bulkAction;
            const isReschedulePerPatient = action === 'reschedule_per_patient';
            return isOverride || isReschedulePerPatient;
          })
          .map((row) => ({
            appointmentId: row.id,
            action: effectiveAction(row.id),
            rescheduleTo: perRowOverrides[row.id]?.rescheduleTo || undefined,
          }));

        const { data } = await bulkResolveOpdSessionOverrun(token, {
          date,
          action: bulkAction,
          perRowOverrides: overridesPayload.length > 0 ? overridesPayload : undefined,
        });

        // Partial failure: surface and stay open.
        const failed = data.results.filter((r) => r.status !== 'success');
        if (failed.length > 0 && data.resolved > 0) {
          setPartialResults(data.results);
          onResolved(); // refetch
          return;
        }

        // Full failure (rare): show error.
        if (failed.length > 0 && data.resolved === 0) {
          setError(`No rows could be resolved. ${failed[0]?.message ?? ''}`);
          return;
        }

        // Full success: close + refetch.
        onResolved();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Submit failed.');
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Resolve {rows.length} overrun patient{rows.length === 1 ? '' : 's'}</DialogTitle>
            <DialogDescription>
              Choose a bulk action below. You can override the action per row in the grid if needed.
            </DialogDescription>
          </DialogHeader>

          <section className="mb-4">
            <Label className="text-sm font-semibold">Bulk action</Label>
            <RadioGroup value={bulkAction} onValueChange={(v) => setBulkAction(v as OverrunAction)} className="mt-2 space-y-1.5">
              <RadioRow id="reschedule_all" label="Reschedule all to next available" description="Same doctor, same modality, same service. Patients are notified." />
              <RadioRow id="reschedule_per_patient" label="Reschedule per patient" description="Choose a specific time per row in the grid below." />
              <RadioRow id="mark_completed" label="Mark as completed (saw briefly)" description="Status = completed. No reschedule, no refund." />
              <RadioRow id="cancel_refund" label="Cancel with refund" description="Patients are refunded and notified." />
              <RadioRow id="mark_no_show" label="Mark as no-show" description="Status = no_show. No refund, no reschedule." />
            </RadioGroup>
          </section>

          <section className="mb-4 max-h-[400px] overflow-y-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="px-2 py-1.5 text-left font-semibold">Patient</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Service</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Action</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Reschedule to (if applicable)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const action = effectiveAction(row.id);
                  const failure = partialResults?.find((r) => r.appointmentId === row.id && r.status !== 'success');
                  return (
                    <tr key={row.id} className={failure ? 'bg-destructive/10' : ''}>
                      <td className="px-2 py-1.5">{row.patients.first_name} {row.patients.last_name}</td>
                      <td className="px-2 py-1.5">{row.services.name}</td>
                      <td className="px-2 py-1.5">
                        <Select value={action} onValueChange={(a) => handleRowActionChange(row.id, a as OverrunAction)}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="reschedule_all">Reschedule</SelectItem>
                            <SelectItem value="reschedule_per_patient">Reschedule to…</SelectItem>
                            <SelectItem value="mark_completed">Completed</SelectItem>
                            <SelectItem value="cancel_refund">Cancel + refund</SelectItem>
                            <SelectItem value="mark_no_show">No-show</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1.5">
                        {action === 'reschedule_per_patient' ? (
                          <Input
                            type="datetime-local"
                            value={perRowOverrides[row.id]?.rescheduleTo ?? ''}
                            onChange={(e) => handleRowRescheduleToChange(row.id, e.target.value)}
                            className="h-7 w-48 text-xs"
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                        {failure && (
                          <p className="mt-0.5 text-xs text-destructive">{failure.message ?? failure.status}</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {error && (
            <Alert variant="destructive" className="mb-3">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {partialResults && (
            <Alert className="mb-3">
              <AlertDescription>
                {partialResults.filter((r) => r.status === 'success').length} of {partialResults.length} resolved.
                The rows highlighted in red couldn't be resolved — review and retry.
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Resolving…' : `Resolve ${rows.length} row${rows.length === 1 ? '' : 's'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  function RadioRow({ id, label, description }: { id: OverrunAction; label: string; description: string }) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-border p-2">
        <RadioGroupItem value={id} id={id} className="mt-1" />
        <Label htmlFor={id} className="flex-1 cursor-pointer">
          <span className="font-medium">{label}</span>
          <span className="block text-xs text-muted-foreground">{description}</span>
        </Label>
      </div>
    );
  }
  ```

### Step 5 — Mount the tray in `OpdTodayClient`

- [ ] In `frontend/components/opd/OpdTodayClient.tsx`, mount the tray above the toolbar:

  ```tsx
  const { rows: overrunRows, count: overrunCount, refetch: refetchOverrun } = useSessionOverrun(token, selectedDate);

  // ... existing layout ...

  return (
    <>
      <SessionOverrunTray
        token={token}
        date={selectedDate}
        rows={overrunRows}
        onResolved={() => {
          void refetchOverrun();
          void refetchSession(); // existing session refetch
        }}
      />
      {/* existing toolbar + list */}
    </>
  );
  ```

  Mount location is the very first child of the OpdTodayClient render — above the date-driven toolbar, above the slot/queue list. The tray collapses to nothing when there's no overrun, so on a healthy day it's invisible.

### Step 6 — Empty + error + loading states

- [ ] **Loading state** — when `useSessionOverrun` is fetching for the first time, render a small skeleton in the tray location (or nothing — the tray is supplemental, no full-page loader). Recommendation: render nothing during initial load to avoid layout shift; the tray pops in when data arrives.
- [ ] **Error state** — if `useSessionOverrun` fails, render a small inline error banner (not a card, not a dialog — non-blocking). Doctor can still operate the rest of the OPD tab. Retry button refetches.

  ```tsx
  if (error) {
    return (
      <Alert variant="destructive" className="mb-3">
        <AlertDescription className="flex items-center justify-between">
          <span>Couldn't load overrun list: {error}</span>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>Retry</Button>
        </AlertDescription>
      </Alert>
    );
  }
  ```

### Step 7 — Mobile + a11y

- [ ] **Mobile (375px DevTools):**
  - The tray card collapses cleanly. The "Resolve all" button stays accessible (right side or below the text).
  - The dialog's table becomes horizontally scrollable when patient names are long.
  - The radio rows stack vertically (already the default).
- [ ] **Keyboard:**
  - Tab order through bulk radio → per-row action selects → reschedule inputs → Cancel → Resolve button.
  - Escape closes the dialog.
- [ ] **Screen readers:**
  - The tray's `<AlertTriangle>` icon has an `aria-hidden`; the visible row count is announced via the heading.
  - Each radio row's description is associated with the radio (use `aria-describedby` if the project's `RadioGroup` doesn't already wire it).

### Step 8 — Tests

- [ ] `frontend/__tests__/components/opd/overrun/SessionOverrunTray.test.tsx`:
  - 0 rows → tray renders nothing.
  - 3 rows → tray renders with "3 patients weren't seen" + "Resolve all" button.
  - Click "Resolve all" → dialog opens.
  - After `onResolved` callback fires from the dialog, the tray refetches (via `onResolved` → parent `onResolved` → refetch).
  - After all rows resolved (rows is empty), tray shows "All caught up" for 3s then hides.
- [ ] `frontend/__tests__/components/opd/overrun/SessionOverrunBulkResolveDialog.test.tsx`:
  - Renders 5 radio options + a row per overrun appointment.
  - Default bulk action is `reschedule_all` — submitting calls `bulkResolveOpdSessionOverrun` with `action: 'reschedule_all'` and no `perRowOverrides`.
  - Change a single row's action via the per-row select → submit sends `perRowOverrides: [{ appointmentId, action }]`.
  - Switch a row to `reschedule_per_patient` without filling `rescheduleTo` → submit sends the override; the backend's "skipped" response shows the per-row warning.
  - Switch bulk action to `cancel_refund` → submit sends `action: 'cancel_refund'`.
  - Partial failure (3 success, 1 error) → dialog stays open, error row highlighted.
- [ ] `frontend/__tests__/hooks/useSessionOverrun.test.ts`:
  - Mocks `getOpdSessionOverrun` → hook returns `rows` + `count`.
  - `refetch` re-invokes the API.
  - Error path: API throws → hook returns `error: '...message...'`.

### Step 9 — Verification

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.
- [ ] `pnpm --filter frontend test -- overrun` all green.
- [ ] **End-to-end smoke (manual, paired with a pdm-09-seeded dev DB):**
  1. Seed a doctor with 5 overrun appointments for today (`session_overrun_at = now()`).
  2. Open `/dashboard/opd-today` → tray renders with "5 patients weren't seen".
  3. Click "Resolve all" → dialog opens with 5 rows + 5 radio options.
  4. Default `reschedule_all` → submit → all 5 rows rescheduled → tray collapses to "All caught up" for 3s then hides. Parent session payload refetches.
  5. Re-seed 3 rows. Open dialog. Change row 2's action to `cancel_refund`. Submit → response: 2 rescheduled + 1 cancelled+refunded. Tray empty.
  6. Re-seed 3 rows. Open dialog. Set bulk to `reschedule_per_patient`. Don't fill `rescheduleTo` for any row. Submit → response: 0 resolved (all skipped). Dialog shows warning with per-row "rescheduleTo missing" messages.
- [ ] **`rg` checks:**

  ```bash
  rg "SessionOverrunTray\b" frontend/
  # Expected: definition + 1 mount in OpdTodayClient.

  rg "useSessionOverrun\b" frontend/
  # Expected: definition + 1 use in OpdTodayClient.

  rg "session_overrun_at\b" frontend/
  # Expected: 0 hits in frontend (the column is a backend implementation detail).
  ```

---

## Out of scope

- **Notification preview** — the dialog says "patients are notified" but doesn't show the notification copy. Defer.
- **Undo for `mark_completed` / `mark_no_show`** — once submitted, the change is in. Doctor uses the standard appointment-detail screen to undo. Defer.
- **Per-row reschedule slot picker (calendar UI)** — the per-row `<Input type="datetime-local">` is functional but minimal. A richer slot-picker (showing available slots per the doctor's working hours) is a polish item; defer.
- **Bulk reschedule with a single target** — if the doctor wants "reschedule everyone to tomorrow 10am", they'd switch all rows to `reschedule_per_patient` with the same target. A "bulk to specific time" mode could be added; defer.
- **Confirmation step before submit** — the dialog's primary CTA submits immediately. No "are you sure" intermediate dialog. The bulk-action radio + per-row preview is the confirmation. Defer a confirm step unless feedback demands it.
- **Pagination** — assume < 50 overrun rows per day per doctor. If the doctor has > 50, the table scrolls (already supports `max-h-[400px] overflow-y-auto`).
- **Telemetry** — pdm-09's backend writes telemetry. Frontend events (dialog opens, dialog cancelled, dialog submitted) are a follow-up.
- **Auto-refetch the overrun list every N seconds** — defer. The hook refetches on mount and on explicit `refetch()`. If overrun is time-sensitive enough to need polling, add it later.

---

## Files expected to touch

**New:**

- `frontend/hooks/useSessionOverrun.ts` (~60 LOC).
- `frontend/components/opd/overrun/SessionOverrunTray.tsx` (~100 LOC).
- `frontend/components/opd/overrun/SessionOverrunBulkResolveDialog.tsx` (~250 LOC).
- `frontend/__tests__/hooks/useSessionOverrun.test.ts` (~70 LOC).
- `frontend/__tests__/components/opd/overrun/SessionOverrunTray.test.tsx` (~100 LOC).
- `frontend/__tests__/components/opd/overrun/SessionOverrunBulkResolveDialog.test.tsx` (~150 LOC).

**Modified:**

- `frontend/components/opd/OpdTodayClient.tsx` (~10 LOC delta — mount the tray + wire `onResolved`).
- `frontend/lib/api.ts` (~50 LOC delta — overrun helpers + types).

---

## Notes / open decisions

1. **Why mount the tray above the toolbar instead of inline within the list?** The overrun rows are about *yesterday's incomplete work*, not *today's pipeline*. Mounting at the top emphasises priority: address overrun before touching today's flow.
2. **Why one big dialog instead of a per-row inline action?** Bulk action is the 80% case ("reschedule everyone"). Inline per-row would force the doctor to take 20 separate actions on a 20-row overrun day. The dialog also gives a clear "I am acting on the whole tray" moment, which the doctor can audit later via `opd_overrun.bulk_resolved` telemetry.
3. **What happens if a row's action doesn't include `rescheduleTo` but the bulk action is `reschedule_per_patient`?** The dialog should ideally enforce this (disabled submit until every `reschedule_per_patient` row has a `rescheduleTo`). For now, we let the backend respond with "skipped" and surface that in the partial-results banner. Adding a client-side validation is a polish item.
4. **What if the doctor closes the dialog mid-bulk-action?** The submission completes server-side (no cancellation primitive). The next refetch picks up the post-action state. No data loss.
5. **What if the parent's `selectedDate` changes while the dialog is open?** The dialog is keyed to a stable `date` prop; if the parent's date changes, the tray (and the dialog) would naturally unmount as the new date has its own overrun. Add `key={date}` to the tray mount to force re-mount on date change if React's reconciliation doesn't handle it cleanly.
6. **Why a `<table>` instead of a card grid for the per-row override?** Density. 10–20 rows in a card grid would be 2–3× the screen real estate. The table puts every row's info in one scannable line, which is what the doctor wants when bulk-acting.
7. **Mobile dialog** — at 375px, the table will scroll horizontally. Acceptable for the doctor's primary workflow (which is desktop); mobile is a secondary surface. If feedback says otherwise, add a card-grid layout below `sm:`.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Read but do not modify:**
  - `backend/src/routes/api/v1/opd.ts` (post-pdm-09) — overrun endpoints.
- **Source decisions:** [Product plans/plan-opd-per-day-mode.md § DL-7, DL-8](../../../Product%20plans/plan-opd-per-day-mode.md).
- **Wave gate:** [`EXECUTION-ORDER-opd-per-day-mode.md` § Wave 5 gate](./EXECUTION-ORDER-opd-per-day-mode.md#wave-5-gate-after-pdm-10).
- **Previous task:** [`task-pdm-09-overrun-flagging-and-fallback.md`](./task-pdm-09-overrun-flagging-and-fallback.md).
- **Next task:** [`task-pdm-11-opd-tab-mode-shortcut.md`](./task-pdm-11-opd-tab-mode-shortcut.md).

---

**Owner:** TBD
**Created:** 2026-05-17
**Status:** Pending
