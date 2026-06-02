# Task oq-08: Search box (name / phone / token / MRN)

## 08 May 2026 — Batch [OPD queue redesign](../plan-opd-queue-redesign-batch.md) — Phase 3, Lane γ step 1 — **XS, ~2h**

---

## Task overview

A single search input above the queue table that filters visible rows by name (substring, case-insensitive), phone (digits-only normalization both sides), token (`#NN` literal), or MRN. Composes with the status filter (`oq-07`).

Search state lives on the `useOpdQueueFilters` hook (already created in `oq-07`); this task ships only the input + filter logic.

**Estimated time:** ~2h. Mostly the matcher function + the UI.

**Status:** Drafted.

**Hard deps:** [oq-07](./task-oq-07-status-filter.md) shipped (so the shared hook owns `q`).

**Source:** [plan-opd-queue-redesign-batch.md § OQ-D5](../plan-opd-queue-redesign-batch.md#decision-lock-locked-2026-05-08-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium** (or Composer if you're confident — pure plumbing).

**New chat?** **Yes** (or stitch into the tail of `oq-07`'s chat). Pre-load:
- This task file.
- `frontend/hooks/useOpdQueueFilters.ts` (post-oq-07).
- `frontend/components/opd/OpdQueueTable.tsx` (post-oq-07 — currently filters on `status` only).
- `frontend/components/ui/input.tsx` (existing input primitive).

**Composer-OK sub-steps:** the entire matcher helper if specced tightly.

**Estimated turns:** 1–2 turns.

---

## Acceptance criteria

### Component shape

- [ ] New file `frontend/components/opd/OpdQueueSearchBox.tsx`:

  ```ts
  export interface OpdQueueSearchBoxProps {
    value: string;
    onChange: (next: string) => void;
    /** Optional placeholder; defaults to "Search name, phone, token, or MRN". */
    placeholder?: string;
  }

  export function OpdQueueSearchBox(props: OpdQueueSearchBoxProps): JSX.Element;
  ```

- [ ] Renders a single `<Input>` with:
  - Leading magnifying-glass icon (`Search` from lucide).
  - Trailing `×` button when `value !== ''` that clears the input (calls `onChange('')`).
  - `aria-label="Search the OPD queue"`.
  - `className="w-72"` at `≥md`, `w-full` below.
- [ ] Component is **uncontrolled internally** but controlled externally — pass `value` + `onChange` straight to the `<Input>`.
- [ ] **Debounce:** 200 ms via `useDebouncedCallback` (search the codebase first; if no helper exists, a tiny `useRef + setTimeout` pattern is fine).

### Matcher helper

- [ ] New file `frontend/components/opd/opdQueueMatcher.ts`:

  ```ts
  import type { DoctorQueueSessionRow } from '@/types/opd-doctor';

  /**
   * Returns true when `entry` matches the search query.
   *
   * Match rules (any of):
   *  1. `q` starts with `#` and the suffix is digits → exact `tokenNumber` match.
   *  2. `q` is digits-only (≥3 chars) → match against `patientPhone` after stripping
   *     non-digits from both sides (handles "+91 98765 43210" vs. "9876543210").
   *  3. Otherwise → case-insensitive substring match against
   *     `patientName + ' ' + (medicalRecordNumber ?? '')`.
   *
   * Empty `q` returns `true` (no filter).
   */
  export function matchesOpdQueueSearch(entry: DoctorQueueSessionRow, q: string): boolean;
  ```

  - The function **must** be a pure helper — no closures, no React. Easy to unit-test.
  - Token rule: `q.startsWith('#') && /^\d+$/.test(q.slice(1))` → `Number(q.slice(1)) === entry.tokenNumber`.
  - Phone rule: `q.replace(/\D/g, '')` is the normalized query; `entry.patientPhone.replace(/\D/g, '')` is the normalized phone. Triggered when the normalized query has ≥3 digits **and** the original `q` has no letters (no `[a-zA-Z]`).
  - Name rule: simple `String#includes` after lowercasing both. MRN included so a doctor can paste a recall code and find the row.

### Wiring into the table

- [ ] `OpdQueueTable` accepts an optional `q: string` prop. After applying the `status` filter, also apply `matchesOpdQueueSearch(entry, q)`.
- [ ] When `q !== '' && filteredEntries.length === 0`, render the per-filter empty state with copy `"No matches for "${q}". Try a different name, phone, or token."` (`oq-13` may further polish copy).

### Mount in `OpdTodayClient`

- [ ] Mount `<OpdQueueSearchBox>` to the right of the status chips on `≥md`, below them on `<md`.
- [ ] Pass `q`, `setQ` from `useOpdQueueFilters()`.
- [ ] Pass `q` into `<OpdQueueTable q={…} />`.

### Tests

- [ ] Unit-test `matchesOpdQueueSearch` (`frontend/__tests__/components/opd/opdQueueMatcher.test.ts`):
  - Empty query returns true for any entry.
  - `#3` matches `tokenNumber === 3`, not `tokenNumber === 13`.
  - `9876543210` matches `+91 98765 43210` (phone normalization).
  - `Ravi` matches `Ravi Kumar` (case-insensitive).
  - `PT-2024` matches when `medicalRecordNumber === 'PT-2024-0142'`.
  - Negative case: `xyz` returns false for an unrelated entry.

### Type-check + lint

- [ ] Clean.

---

## Out of scope

- **Server-side search** — not needed; lists are bounded (~80 rows max).
- **Fuzzy / typo-tolerant matching** — out of batch.
- **Search history / autocomplete suggestions** — out of batch.
- **Telemetry on search** — `oq-14` adds a debounced `opd_queue.searched` event with the query length only (no PHI).

---

## Files expected to touch

**New:**
- `frontend/components/opd/OpdQueueSearchBox.tsx` (~70 LOC)
- `frontend/components/opd/opdQueueMatcher.ts` (~40 LOC)
- `frontend/__tests__/components/opd/opdQueueMatcher.test.ts` (~80 LOC)

**Modified:**
- `frontend/components/opd/OpdQueueTable.tsx` (~5 LOC — accept and apply `q` after `status` filter)
- `frontend/components/opd/OpdTodayClient.tsx` (~5 LOC — mount the search box, wire props)

---

## Notes / open decisions

1. **Why a debounce.** Even on 80 rows the rerender is fast, but the URL-param write should be debounced — otherwise typing "ravi" hits the back-button history 4 times. 200 ms is the sweet spot.
2. **Phone digits-only with ≥3-char threshold.** Avoids false positives where typing `1` matches every Indian phone number.
3. **MRN included in name rule.** Doctors will paste a recall code; this is the simplest path. If MRN format ever clashes with names, we'd need a separate rule, but `PT-2024-0142`-style codes don't.
4. **Keyboard:** `oq-13` adds `/` to focus the search box. This task doesn't need keyboard work beyond the input being naturally focusable.

---

## References

- **Source plan:** [plan-opd-queue-redesign-batch.md § OQ-D5](../plan-opd-queue-redesign-batch.md)
- **Filter hook:** [task-oq-07-status-filter.md](./task-oq-07-status-filter.md)
- **Table shell:** [task-oq-04-table-shell-grouping.md](./task-oq-04-table-shell-grouping.md)

---

**Owner:** TBD
**Created:** 2026-05-08
**Status:** Drafted
