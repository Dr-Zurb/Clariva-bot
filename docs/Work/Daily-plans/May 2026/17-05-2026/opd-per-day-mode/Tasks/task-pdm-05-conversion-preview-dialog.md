# Task pdm-05: `<SessionModeConversionDialog>` preview-then-confirm UX

## 17 May 2026 — Batch [OPD Per-Day Mode](../plan-opd-per-day-mode-batch.md) — Wave 2, Lane α step 1 — **S, ~4h**

---

## Task overview

Ship the reusable preview-then-confirm dialog that powers both the OPD-tab pill dropdown (pdm-11) and the settings-flip path (pdm-08).

**Two phases:**

1. **Preview phase.** On open, the dialog calls `POST /api/v1/opd/session/preview-convert` with `{ date, toMode }` (endpoint shipped by pdm-04). Renders the returned counts in a prominent summary card: `affected` (total), `overflowCount` (for queue→slot — rendered in red when > 0), `telemedCount` (for queue conversions — drives the PD-Q4 advisory), `notificationCount`. The doctor sees the cost before committing.
2. **Confirm phase.** On Confirm, POSTs to `/api/v1/opd/session/convert`. Shows a 1–2s loading state (advisory lock acquisition + transaction commit). On success, surfaces the `affected`/`overflowCount` summary again with a "Done" CTA and a `onConfirmed(result)` callback to the parent. On 409 (lock contention), retries once after the `Retry-After` hint; on second failure, shows an error toast and keeps the dialog open. On 403 (past date), shows the DL-15 message and closes (defensive — the parent should not let the user open the dialog for a past date in the first place).

**Reuse contract:** the component is imported in **two** places (pdm-08 settings flip path, pdm-11 OPD-tab pill dropdown). Both pass the same props; the parent decides how the dialog opens, the dialog owns the rest.

**Estimated time:** ~4h (1h skeleton + preview phase, 1h confirm phase + error handling, 1h DL-14 nudge wiring + PD-Q4 advisory + DL-15 guard, 1h mobile smoke + a11y + unit test for the API helper).

**Status:** Pending.

**Hard deps:** pdm-04 (endpoints exist; `ConvertSessionDayModeResult` type available).

**Source:** [plan-opd-per-day-mode-batch.md § Wave 2](../plan-opd-per-day-mode-batch.md#wave-2--conversion-service--preview-ux-2-tasks-10h-single-sequential-lane) + `S1.4` and `DL-12` + `DL-14` + `DL-15` + `PD-Q4` in [Product plans/plan-opd-per-day-mode.md](../../../Product%20plans/plan-opd-per-day-mode.md).

---

## Model & execution guidance

**Recommended model:** **Auto** (default). Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) TL;DR rule #1 — Auto is the execution default. This is a ~180 LOC React dialog with two API calls and standard shadcn primitives. **Not on the hard-rules list.**

**Per-message escalation rule:** if Auto stalls on the discriminated-union narrowing in the preview result (telemed warning conditional rendering), escalate that **one message** to Opus 4.7 Extra High.

**Manual-Sonnet fallback:** only if A/B-testing.

**New chat?** **Yes** — fresh chat. Pre-load:

- This task file.
- `frontend/components/ui/dialog.tsx` (existing shadcn dialog primitive — the dialog shell pattern).
- `frontend/components/ui/button.tsx`, `frontend/components/ui/alert.tsx` (or whatever the project's warning-alert primitive is called).
- `frontend/lib/api.ts` (post-pdm-04 — `previewConvertSession` + `convertSessionDayMode` helpers to add).
- `frontend/types/opd-session.ts` (post-pdm-02 + pdm-04 — `ConvertSessionDayModeResult` type).
- `frontend/components/opd/OpdTodayClient.tsx` (post-pdm-03 — where the dialog will be mounted by pdm-11; pre-load only for context).
- Source plan §DL-12, §DL-14, §DL-15, §PD-Q4.

**Estimated turns:** 3–4 turns (1 skeleton + API helpers, 1 preview + confirm phases, 1 PD-Q4 / DL-14 / DL-15 wiring, 1 verification).

---

## Acceptance criteria

### Step 1 — API helpers in `frontend/lib/api.ts`

- [ ] Add two helpers, mirroring the existing `getDoctorOpdSession` precedent:

  ```ts
  import type { ConvertSessionDayModeResult } from '../types/opd-session';

  export async function previewConvertSession(
    token: string,
    params: { date: string; toMode: 'slot' | 'queue' },
  ): Promise<{ data: ConvertSessionDayModeResult }> {
    const res = await fetch(`${API_BASE}/api/v1/opd/session/preview-convert`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      throw new ApiError(res.status, await res.text(), await safeJson(res));
    }
    return { data: (await res.json()) as ConvertSessionDayModeResult };
  }

  export async function convertSession(
    token: string,
    params: { date: string; toMode: 'slot' | 'queue'; notes?: string },
  ): Promise<{ data: ConvertSessionDayModeResult; retryAfterSeconds?: number }> {
    const res = await fetch(`${API_BASE}/api/v1/opd/session/convert`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
    const retryAfterHeader = res.headers.get('Retry-After');
    const retryAfterSeconds = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : undefined;
    if (!res.ok) {
      throw new ApiError(res.status, await res.text(), await safeJson(res), retryAfterSeconds);
    }
    return { data: (await res.json()) as ConvertSessionDayModeResult, retryAfterSeconds };
  }
  ```

  *(If `ApiError` doesn't accept a fourth `retryAfterSeconds` argument today, extend its constructor. Cheap change.)*

### Step 2 — Component skeleton

- [ ] Create `frontend/components/opd/SessionModeConversionDialog.tsx`:

  ```tsx
  'use client';

  import { useEffect, useState } from 'react';
  import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
  import { Button } from '@/components/ui/button';
  import { Alert, AlertDescription } from '@/components/ui/alert';
  import { Loader2, AlertTriangle } from 'lucide-react';
  import { previewConvertSession, convertSession } from '@/lib/api';
  import type { ConvertSessionDayModeResult, OpdSessionDayMode } from '@/types/opd-session';

  export interface SessionModeConversionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    token: string;
    date: string;               // YYYY-MM-DD, must NOT be past (caller enforces)
    fromMode: OpdSessionDayMode;
    toMode: OpdSessionDayMode;
    /**
     * Number of times the doctor has already flipped this day's mode.
     * Drives the DL-14 soft nudge (rendered when >= 2).
     */
    modeChangeCount: number;
    /**
     * Optional source tag for telemetry ('opd_tab' | 'settings').
     */
    source?: 'opd_tab' | 'settings';
    /**
     * Called after a successful conversion. The parent should refetch the
     * snapshot and refresh any cached state. Not called on cancel.
     */
    onConfirmed: (result: ConvertSessionDayModeResult) => void;
  }

  type Phase =
    | { kind: 'loading_preview' }
    | { kind: 'preview'; preview: ConvertSessionDayModeResult }
    | { kind: 'preview_error'; error: string }
    | { kind: 'confirming' }
    | { kind: 'done'; result: ConvertSessionDayModeResult }
    | { kind: 'confirm_error'; error: string };

  export function SessionModeConversionDialog(props: SessionModeConversionDialogProps) {
    const { open, onOpenChange, token, date, fromMode, toMode, modeChangeCount, source, onConfirmed } = props;
    const [phase, setPhase] = useState<Phase>({ kind: 'loading_preview' });

    // Reset phase whenever the dialog opens with new params.
    useEffect(() => {
      if (open) {
        setPhase({ kind: 'loading_preview' });
        void (async () => {
          try {
            const { data } = await previewConvertSession(token, { date, toMode });
            setPhase({ kind: 'preview', preview: data });
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to preview conversion.';
            setPhase({ kind: 'preview_error', error: message });
          }
        })();
      }
    }, [open, token, date, toMode]);

    // ... render below ...
  }
  ```

### Step 3 — Render: preview phase

- [ ] Inside the `Dialog` content:

  ```tsx
  <DialogHeader>
    <DialogTitle>Switch {formatDateLocal(date)} to {labelFor(toMode)} mode?</DialogTitle>
    <DialogDescription>
      The system will reorganise existing bookings automatically.
      Patients are notified once after a 5-minute delay (DL-5 debounce).
    </DialogDescription>
  </DialogHeader>

  {phase.kind === 'loading_preview' && (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="h-6 w-6 animate-spin" />
      <span className="ml-2 text-sm text-muted-foreground">Calculating impact…</span>
    </div>
  )}

  {phase.kind === 'preview_error' && (
    <Alert variant="destructive">
      <AlertDescription>{phase.error}</AlertDescription>
    </Alert>
  )}

  {phase.kind === 'preview' && (
    <PreviewSummary
      preview={phase.preview}
      fromMode={fromMode}
      toMode={toMode}
      modeChangeCount={modeChangeCount}
    />
  )}

  {phase.kind === 'confirming' && (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="h-6 w-6 animate-spin" />
      <span className="ml-2 text-sm">Reorganising session…</span>
    </div>
  )}

  {phase.kind === 'done' && (
    <DoneSummary result={phase.result} fromMode={fromMode} toMode={toMode} />
  )}

  {phase.kind === 'confirm_error' && (
    <Alert variant="destructive">
      <AlertDescription>{phase.error}</AlertDescription>
    </Alert>
  )}
  ```

- [ ] **`<PreviewSummary>`** sub-component (or inline) renders:

  ```tsx
  function PreviewSummary({ preview, fromMode, toMode, modeChangeCount }: ...) {
    const { affected, overflowCount, telemedCount, notificationCount } = preview;
    return (
      <div className="space-y-4">
        {/* Primary count */}
        <div className="rounded-md border border-border bg-muted/50 p-4">
          <p className="text-sm font-medium">
            {affected === 0
              ? 'No active bookings on this date.'
              : `${affected} active ${affected === 1 ? 'booking' : 'bookings'} will be reassigned.`}
          </p>
          {affected > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {notificationCount} {notificationCount === 1 ? 'patient' : 'patients'} will receive a single notification 5 minutes after you confirm.
            </p>
          )}
        </div>

        {/* Overflow warning (queue → slot) */}
        {toMode === 'slot' && overflowCount > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>{overflowCount} {overflowCount === 1 ? 'patient' : 'patients'} will be assigned overflow slots at end of session.</strong>{' '}
              They may not be seen if the day runs long. You can resolve overflow rows from the &ldquo;Needs attention&rdquo; tray after the session.
            </AlertDescription>
          </Alert>
        )}

        {/* Telemed warning (PD-Q4) — only on slot → queue */}
        {toMode === 'queue' && telemedCount > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>{telemedCount} of the affected {telemedCount === 1 ? 'booking is' : 'bookings are'} telemed.</strong>{' '}
              In queue mode, telemed patients won&rsquo;t know when to join the call until you page them from the queue.
            </AlertDescription>
          </Alert>
        )}

        {/* DL-14 soft nudge after 2+ flips */}
        {modeChangeCount >= 2 && (
          <Alert>
            <AlertDescription>
              You&rsquo;ve changed this day&rsquo;s mode {modeChangeCount} {modeChangeCount === 1 ? 'time' : 'times'} already &mdash; patients have been re-notified each time.
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  }
  ```

### Step 4 — Render: confirm + done

- [ ] **`DialogFooter`** branching on phase:

  ```tsx
  <DialogFooter>
    {(phase.kind === 'preview' || phase.kind === 'preview_error') && (
      <>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button
          onClick={handleConfirm}
          disabled={phase.kind !== 'preview'}
        >
          {phase.kind === 'preview' && phase.preview.affected === 0
            ? 'Switch mode'
            : `Confirm and notify ${phase.kind === 'preview' ? phase.preview.notificationCount : 0} patients`}
        </Button>
      </>
    )}

    {phase.kind === 'done' && (
      <Button onClick={() => onOpenChange(false)}>Done</Button>
    )}

    {phase.kind === 'confirm_error' && (
      <>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        <Button onClick={handleConfirm}>Try again</Button>
      </>
    )}
  </DialogFooter>
  ```

- [ ] **`handleConfirm`:**

  ```tsx
  async function handleConfirm() {
    setPhase({ kind: 'confirming' });
    try {
      const { data } = await convertSession(token, { date, toMode });
      setPhase({ kind: 'done', result: data });
      onConfirmed(data);
    } catch (err) {
      // 409 with Retry-After — retry once after the hint.
      if (err instanceof ApiError && err.status === 409 && err.retryAfterSeconds) {
        await new Promise((r) => setTimeout(r, err.retryAfterSeconds * 1000));
        try {
          const { data } = await convertSession(token, { date, toMode });
          setPhase({ kind: 'done', result: data });
          onConfirmed(data);
          return;
        } catch (retryErr) {
          // fall through to the error display below
          const message = retryErr instanceof Error ? retryErr.message : 'Conversion failed after retry.';
          setPhase({ kind: 'confirm_error', error: message });
          return;
        }
      }

      // 403 past-date — defensive; the parent should have prevented opening the dialog.
      if (err instanceof ApiError && err.status === 403) {
        setPhase({ kind: 'confirm_error', error: 'Past dates cannot be reconfigured.' });
        return;
      }

      const message = err instanceof Error ? err.message : 'Conversion failed.';
      setPhase({ kind: 'confirm_error', error: message });
    }
  }
  ```

### Step 5 — Telemetry hook (optional, but easy)

- [ ] **On Confirm fire telemetry:**

  ```ts
  trackEvent('opd_session.mode_flipped', {
    from: fromMode,
    to: toMode,
    affected_count: data.affected,
    overflow_count: data.overflowCount,
    source: source ?? 'unknown',
  });
  ```

  Place the `trackEvent` call inside `handleConfirm` after `setPhase({ kind: 'done', result: data })`. The actual telemetry event lands when pdm-11 wires the OPD-tab dropdown; this task lays the line down so pdm-11 only needs to pass `source: 'opd_tab'`.

  If the project's telemetry helper isn't named `trackEvent`, use the project's name (look at `frontend/components/opd/opdQueueTelemetry.ts` for the queue-mode precedent).

### Step 6 — `<DoneSummary>` sub-component

- [ ] Show a tight success state — same numbers as `<PreviewSummary>` plus a "Patients will be notified in ~5 minutes" reminder.

  ```tsx
  function DoneSummary({ result, fromMode, toMode }: ...) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/40 dark:bg-emerald-900/10">
        <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
          Switched to {labelFor(toMode)} mode. {result.affected} {result.affected === 1 ? 'booking' : 'bookings'} reorganised.
        </p>
        {result.overflowCount > 0 && (
          <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-200/80">
            {result.overflowCount} assigned to overflow.
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Affected patients will be notified in ~5 minutes.
        </p>
      </div>
    );
  }
  ```

### Step 7 — Accessibility + mobile

- [ ] Dialog is rendered with `role="dialog"`, focus traps inside (shadcn dialog does this automatically).
- [ ] All button states have aria-labels or visible labels.
- [ ] Mobile width (375px DevTools) — counts wrap to a single column; alert text doesn't truncate. `<DialogContent>`'s default `max-width` is `sm:max-w-lg` — works.
- [ ] **Keyboard:** Esc cancels (default shadcn behaviour). Enter inside the confirm phase fires `handleConfirm` (`<Button type="submit">` if wrapped in a `<form>`; otherwise no specific binding needed).

### Step 8 — Standalone unit / smoke test

- [ ] Create `frontend/__tests__/components/opd/SessionModeConversionDialog.test.tsx` (or wherever the project's frontend tests live):

  - Render with `affected = 5, overflowCount = 0, telemedCount = 0` → preview summary renders without the overflow / telemed alerts.
  - Render with `affected = 5, overflowCount = 2` → overflow alert renders with correct count.
  - Render with `affected = 5, telemedCount = 3` and `toMode = 'queue'` → telemed alert renders.
  - Render with `modeChangeCount = 3` → DL-14 nudge renders.
  - Render with `affected = 0` → "No active bookings" copy; confirm button enabled (zero is still a valid flip — materialises the fact row for a not-yet-touched day).

- [ ] Mock the API helpers via `vi.mock(...)` / `jest.mock(...)`; don't hit the real backend.

### Step 9 — Verification

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.
- [ ] `pnpm --filter frontend test -- SessionModeConversionDialog` all green.
- [ ] **Manual smoke from a Storybook / scratch page** (if Storybook exists) OR a temporary mount in `OpdTodayClient.tsx` removed before commit:

  - Open dialog with `fromMode='slot', toMode='queue', date='2026-05-18'` — preview loads, shows counts, confirm transitions to "done".
  - Force a 409 (run two conversions concurrently from two browser tabs) — second tab sees the retry behaviour.
  - Force a 403 by hardcoding a past date — preview returns error, the past-date message renders.

- [ ] `rg "SessionModeConversionDialog" frontend/` returns the new file + any consumer mount (none in this task — pdm-08 and pdm-11 add them).

---

## Out of scope

- **Mounting the dialog in `OpdTodayClient.tsx`** — pdm-11. This task ships the component; pdm-11 wires it to the pill dropdown.
- **Mounting the dialog in the settings UI** — pdm-08. Same reasoning.
- **The "opd_session.mode_flipped" telemetry event landing in the project's analytics pipeline** — pdm-11 ships the event taxonomy update; this task just emits the event optimistically.
- **`previewSessionDayModeConversion` backend caching** — pdm-04 owns the endpoint; if previews become slow at high volume, optimisation is a follow-up.
- **Streaming the preview as a websocket** — the conversion is fast (~1s) and the preview endpoint is non-mutating; a synchronous request is fine.

---

## Files expected to touch

**New:**

- `frontend/components/opd/SessionModeConversionDialog.tsx` (~220 LOC — dialog component + `<PreviewSummary>` + `<DoneSummary>`).
- `frontend/__tests__/components/opd/SessionModeConversionDialog.test.tsx` (~120 LOC — 5 render assertions).

**Modified:**

- `frontend/lib/api.ts` (~45 LOC delta — two new helpers).
- `frontend/lib/api-types.ts` or wherever `ApiError` lives (~5 LOC delta — extend constructor with `retryAfterSeconds` if not already present).
- `frontend/types/opd-session.ts` (~5 LOC delta — re-export `ConvertSessionDayModeResult` from backend types if not already exported; the type is the backend's `ConvertSessionDayModeResult`).

**Tests:** the new test file is the only test for this task.

---

## Notes / open decisions

1. **Why phase-based state instead of separate booleans?** A discriminated union forces exhaustive handling and makes invalid combos unrepresentable (e.g., `loading_preview` + `confirming` simultaneously). Cheap; standard React idiom.
2. **Why call `previewConvertSession` on every open instead of caching?** The preview is dependent on the current state of the database — bookings can arrive between dialog opens. A stale preview is worse than a 1s recompute.
3. **Why retry on 409 only once?** Two consecutive conflicts mean either a heavy lock contention (rare; doctor's lock against their own future conversion is the only realistic conflict) or a bug. Either way, surfacing the error is the right UX — the doctor can choose to retry manually.
4. **DL-14 nudge wording** — the source plan says *"You've changed this day's mode {n} times already — patients have been re-notified each time."* This task uses that copy verbatim. pdm-11 may localise / iterate, but the default copy is locked.
5. **PD-Q4 telemed wording** — *"N of the affected bookings are telemed — patients won't know when to join the call until they're paged from the queue."* Locked.
6. **Why not show a per-row preview of which patient gets which token / slot?** Because (a) the count is the meaningful number for the doctor's decision, (b) per-row preview would balloon the dialog on 100+ booking days, and (c) overflow assignment can change between preview and confirm if new bookings arrive in the window. Counts are stable enough; per-row diffs would suggest a precision the system can't guarantee.
7. **Cancel button on `confirm_error`** — labelled "Close" rather than "Cancel" because the conversion may have partially completed (mid-transaction failure is rare but possible). The doctor should refresh the snapshot to see the actual state. Document this in the error message: *"Conversion may have partially completed; please refresh to see the latest state."* — left for pdm-12 polish if needed.
8. **`source: 'opd_tab' | 'settings'`** — pdm-11 / pdm-08 pass the right value. If neither is passed, telemetry uses `'unknown'` (cheap defensive default).

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Read but do not modify:**
  - `frontend/components/ui/dialog.tsx` — dialog shell pattern.
  - `frontend/components/ui/alert.tsx` — alert primitive.
  - `frontend/components/opd/opdQueueTelemetry.ts` — telemetry helper precedent.
- **Source decisions:** [Product plans/plan-opd-per-day-mode.md § DL-12, DL-14, DL-15, PD-Q4](../../../Product%20plans/plan-opd-per-day-mode.md).
- **Wave gate:** [`EXECUTION-ORDER-opd-per-day-mode.md` § Wave 2 gate](./EXECUTION-ORDER-opd-per-day-mode.md#wave-2-gate-after-pdm-05).
- **Previous task:** [`task-pdm-04-conversion-service.md`](./task-pdm-04-conversion-service.md).
- **Next task:** [`task-pdm-06-notifications-debounce-dispatch.md`](./task-pdm-06-notifications-debounce-dispatch.md).
- **Consumer tasks:** pdm-08 (settings flip path) and pdm-11 (OPD-tab pill dropdown).

---

**Owner:** TBD
**Created:** 2026-05-17
**Status:** Pending
