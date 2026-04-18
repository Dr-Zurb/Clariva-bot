# Task 07: Cancel-appointment list polish
## 18 April 2026 — Plan "Patient DM copy polish", P2

---

## Task Overview

The "which appointment to cancel?" prompt (`backend/src/workers/instagram-dm-webhook-handler.ts` line 2373) is:

```
Which appointment would you like to cancel?

1) Tue, Apr 29 — 4:30 PM
2) Fri, May 2 — 10:00 AM

Reply 1, 2, or 3.
```

Problems (from 2026-04-17 audit):
1. Trailer `Reply 1, 2, or N` reads awkwardly — if N is 3, it's `Reply 1, 2, or 3` (redundant "2,"). If N is 2, it's `Reply 1, 2, or 2` which is actively wrong.
2. The list items don't visually distinguish the choice key (`1)`, `2)`) from the content — patients skim and miss the number.
3. Each line doesn't tell the patient **what kind** of appointment it is (text / video / in-person), which matters when the patient has mixed types and wants to cancel only the teleconsult.

Fix: bold the choice key, use contextual "Reply 1 or 2" / "Reply a number from 1 to N", and include a modality / visit-type hint on each line when available.

**Target shape (2 upcoming):**

```
Which appointment would you like to cancel?

**1.** Tue, Apr 29 · 4:30 PM — Video consult
**2.** Fri, May 2 · 10:00 AM — In-person

Reply **1** or **2**.
```

**Target shape (4 upcoming):**

```
Which appointment would you like to cancel?

**1.** Tue, Apr 29 · 4:30 PM — Video consult
**2.** Fri, May 2 · 10:00 AM — In-person
**3.** Mon, May 5 · 2:00 PM — Text consult
**4.** Thu, May 8 · 11:15 AM — Video consult

Reply a number from **1** to **4**.
```

**Target shape (1 upcoming — edge case):**

Currently the handler has a separate single-appointment path; if not, add:

```
You have one upcoming appointment: **Tue, Apr 29 · 4:30 PM — Video consult**.

Reply **Yes** to cancel it, or tell me what else to do.
```

**Estimated Time:** 2 hours  
**Status:** Done (2026-04-18)  
**Depends on:** [Task 01](./task-01-dm-copy-helper-and-golden-snapshots.md)  
**Plan:** [Plan — Patient DM copy polish](../plan-patient-dm-copy-polish.md)

### Implementation Plan (high level)

1. Add `buildCancelChoiceListMessage(input)` to `dm-copy.ts`:
   ```ts
   export interface CancelChoiceItem {
     dateDisplay: string;       // "Tue, Apr 29 · 4:30 PM"
     modalityLabel?: string;    // "Video consult" | "In-person" | "Text consult"
   }
   export interface CancelChoiceListInput {
     items: CancelChoiceItem[]; // 1..N
   }
   ```
2. Output:
   - If `items.length === 1`: confirm-by-Yes shape (see target above).
   - If `items.length === 2`: `Reply **1** or **2**.`
   - If `items.length >= 3`: `Reply a number from **1** to **N**.`
3. Item rendering: `**{idx}.** {dateDisplay}{modality ? ` — ${modality}` : ''}`.
4. Replace `formatAppointmentStatusLine(iso, '', tz).replace(' ()', '')` with a small helper in `dm-copy.ts` that produces `"Tue, Apr 29 · 4:30 PM"` — or pass the pre-formatted string in from the caller. Prefer **caller formats, builder lays out** so the builder stays free of timezone dependencies.
5. Caller must also resolve modality for each appointment. Use the appointment's `consultation_type` column → label map (text → "Text consult", video → "Video consult", in_person → "In-person"). If unknown/null, omit the modality suffix.
6. Replace the inline `replyText` at line 2373.
7. Handle the single-appointment branch — audit the handler around that area to see whether the existing code already branches for `upcoming.length === 1`; if so, this task also owns that branch's copy.

**Scope trade-offs:**
- We don't change the cancel *flow* — patient still replies with the number; state still transitions to `awaiting_cancel_choice`. Only the prompt copy is touched.
- Modality labels are English only. No localization.
- We don't add a cancellation-policy disclaimer ("cancellations within 2 hours aren't refundable") to the list prompt — that belongs on the confirmation step, and it's a separate product decision.
- We don't show appointment duration or doctor name. The patient knows the doctor (they're in that DM) and durations aren't consistently captured.

### Change Type

- [x] **Create new** — builder in `dm-copy.ts`
- [x] **Update existing** — 1+ call sites in `instagram-dm-webhook-handler.ts`

### Current State

- `backend/src/workers/instagram-dm-webhook-handler.ts:2373` — inline template.
- `formatAppointmentStatusLine` produces a date string like `Tue, Apr 29, 4:30 PM ()` — we already strip the ` ()` remnant.
- `upcoming` array contains `id`, `appointment_date`, and (presumably) `consultation_type`. Verify when wiring.

### Scope Guard

- Expected files touched: 2–3 + tests.
- Do NOT touch `awaiting_cancel_choice` state handling or the number → appointment-id mapping.

### Reference Documentation

- [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md)
- [Task 01](./task-01-dm-copy-helper-and-golden-snapshots.md)

---

## Task Breakdown

### 1. Builder

- [x] 1.1 Implemented `buildCancelChoiceListMessage` in `dm-copy.ts` — bold choice key (`**1.** {date} — {modality}`), em-dash between date and modality, middle dot inside the `dateDisplay` string itself (owned by the caller's formatter).
- [x] 1.2 Trailer rules all present:
  - 1 item → `"You have one upcoming appointment: **{date} — {modality}**."` + `"Reply **Yes** to cancel it, or tell me what else to do."`
  - 2 items → `"Reply **1** or **2**."`
  - ≥ 3 items → `"Reply a number from **1** to **N**."`

### 2. Modality resolution helper

- [x] 2.1 Added `appointmentConsultationTypeToLabel(type)` in `dm-copy.ts`. Maps the canonical DB enum `'text' | 'voice' | 'video' | 'in_clinic'` (per `backend/src/types/database.ts:115`) to `'Text consult' | 'Voice consult' | 'Video consult' | 'In-person'`. Normalizes case and whitespace; returns `undefined` for unknown / null / empty so the caller can omit the ` — X` suffix (avoiding leaking raw enum tokens into patient DMs).
- [x] 2.2 Co-located with `dm-copy.ts`. No existing label map in the repo to reuse — this is now the single source of truth and can be reused by a future reschedule-list task.

### 3. Wire

- [x] 3.1 Replaced the `lines` / `replyText` block at line 2380 (handler grew since the plan was written; the old line number 2373 slipped post-Task-03/04 imports). Caller now builds `CancelChoiceItem[]` via `formatAppointmentChoiceDate(iso, tz)` + `appointmentConsultationTypeToLabel(a.consultation_type)` and passes into `buildCancelChoiceListMessage`. Note: the caller uses the new `formatAppointmentChoiceDate` helper (en-US middot) rather than the task spec's `formatAppointmentStatusLine(..).replace(..).replace(..)` chain — `formatAppointmentStatusLine` is en-GB (`"Tue, 29 Apr 2026, 4:30 pm"`) and the regex chain the task spec proposed would have produced `"Tue · 29 Apr 2026, 4:30 pm"`, not the target `"Tue, Apr 29 · 4:30 PM"`. Using the dedicated helper keeps the date shape consistent with the Task-05 payment DM.
- [x] 3.2 Single-upcoming cancel branch (lines 2365–2378) funneled through the same builder — the ad-hoc `"Your appointment is on {date}. Reply **Yes** to cancel, or **No** to keep it."` string is gone. State transition (`step: 'awaiting_cancel_confirmation'`, `cancelAppointmentId`) is unchanged.
- [x] 3.3 **Scope note:** reschedule branch (lines 2422–2426) left untouched per the task's explicit "Reschedule list (parallel UI) is NOT in this task" scope trade-off. A follow-up task can reuse `buildCancelChoiceListMessage` as-is (renamed to `buildAppointmentChoiceListMessage`) when that ships.

### 4. Tests

- [x] 4.1 4 snapshots committed:
  - `cancel-list / 1 item / video — confirm-by-Yes shape`
  - `cancel-list / 2 items / mixed modalities — "Reply 1 or 2"`
  - `cancel-list / 3 items / all video — "Reply a number from 1 to 3"`
  - `cancel-list / 5 items / mixed + some unknown modality (suffix omitted)`
- [x] 4.2 9 invariant/detector unit tests added across two describes:
  - `appointmentConsultationTypeToLabel`: maps known values / normalizes case+whitespace / returns `undefined` for unknown (including the task's typo `'in_person'`, which is correctly not a real enum value).
  - `buildCancelChoiceListMessage`: throws on empty items / omits modality suffix when undefined/empty/whitespace / 2-item trailer regex / N≥3 trailer regex / single-item branch has no numbered list or trailer-number / `**N.**` bolding + input-order preservation.

### 5. Verification

- [x] 5.1 `tsc --noEmit` clean.
- [x] 5.2 Full unit suite green: **897 tests / 80 suites / 34 snapshots** (up from 884/80/30 post-Task-06, +13 tests, +4 snapshots). No regressions.
- [ ] 5.3 Staging: cancel-intent with 2 upcoming appointments → verify bold numbers + `Reply 1 or 2` trailer. _(manual, deferred to staging rollout)_

---

## Files to Create/Update

```
backend/src/utils/dm-copy.ts                                   — UPDATED (add builder + modality label helper if not co-located)
backend/src/workers/instagram-dm-webhook-handler.ts            — UPDATED (replace inline block at :2373 and any single-upcoming branch)
backend/tests/unit/utils/dm-copy.snap.test.ts                  — UPDATED (4 snapshots + 2 unit tests)
backend/tests/unit/utils/__snapshots__/dm-copy.snap.test.ts.snap — UPDATED
```

---

## Design Constraints

- **Bold the choice key** (`**1.**`), not the entire line.
- **` · ` separator between date and time**, not ` — ` (en-dash reserved for the modality suffix).
- **Modality suffix always comes after ` — `** (spaced en-dash).
- **Trailer is adaptive**: `Reply Yes` / `Reply 1 or 2` / `Reply a number from 1 to N`.
- **No emoji.**

---

## Global Safety Gate

- [x] **Data touched?** Reads upcoming appointments — already read today, no new fields queried.
- [x] **Any PHI in logs?** No new logging.
- [x] **External API or AI call?** No.
- [x] **Retention / deletion impact?** None.

---

## Acceptance & Verification Criteria

- [x] `buildCancelChoiceListMessage` exists and covers 1 / 2 / ≥3 item cases with the correct adaptive trailer.
- [x] Inline block at line 2380 (old ~2373) replaced with a builder call; single-upcoming branch at line 2365 also funneled through the same builder.
- [x] Modality suffix appears when `consultation_type` is known (`'text' | 'voice' | 'video' | 'in_clinic'`); omitted for `undefined` / `null` / unknown values.
- [x] 4 snapshots + 9 unit tests committed (3 for the label helper, 6 for the builder invariants).
- [x] `tsc --noEmit` clean; full suite green (897 / 80 / 34).
- [ ] Staging smoke on the 2-item case. _(manual step owned by rollout)_

---

## Related Tasks

- [Task 01](./task-01-dm-copy-helper-and-golden-snapshots.md) — prerequisite.
- Reschedule list (parallel UI) is NOT in this task. If patients complain about the reschedule list showing the same dense shape, a follow-up task can reuse `buildCancelChoiceListMessage` as-is by renaming it to `buildAppointmentChoiceListMessage`.

---

**Last Updated:** 2026-04-18  
**Pattern:** Adaptive pick-list with bolded choice keys  
**Reference:** [Plan — Patient DM copy polish](../plan-patient-dm-copy-polish.md)
