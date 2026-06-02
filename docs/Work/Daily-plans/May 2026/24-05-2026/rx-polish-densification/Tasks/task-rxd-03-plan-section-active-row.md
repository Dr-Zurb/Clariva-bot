# rxd-03 · PlanSection active-row tracking

> **Wave 2 task β** of [rx-polish-densification](../plan-rx-polish-densification-batch.md). Parent-side state to enforce DL-3's one-editor-at-a-time invariant.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | S (~30 LOC component delta + ~80 LOC tests) |
| **Model** | Auto |
| **Wave** | 2 |
| **Depends on** | rxd-02 |
| **Blocks** | rxd-04 |

---

## Goal

Track which medicine row is currently in editor-mode. Pass the right `isEditing` + `onRequest*` props into each `<MedicineRow>`. New rows start as the active editor (DL-5).

---

## What to do

### 1. Open `frontend/components/cockpit/rx/sections/PlanSection.tsx`

Add the active-row state:

```ts
const [activeRowIndex, setActiveRowIndex] = useState<number | null>(null);
```

### 2. Wire the existing medicine-list render

Wherever `medicines.map((value, idx) => <MedicineRow ... />)` lives today, add the three new props:

```tsx
medicines.map((value, idx) => (
  <MedicineRow
    key={idx}
    index={idx}
    value={value}
    onChange={handleChange}
    onPatch={handlePatch}
    onDelete={handleDelete}
    isReadOnly={isReadOnly}
    // rxd-03 additions:
    isEditing={activeRowIndex === idx}
    onRequestEdit={(i) => setActiveRowIndex(i)}
    onRequestCollapse={(i) => {
      if (activeRowIndex === i) setActiveRowIndex(null);
    }}
  />
))
```

### 3. Update `[+ Add medicine]` handler

When the doctor adds a new medicine, set the new row as the active editor (DL-5):

```ts
function handleAddMedicine() {
  const nextIndex = medicines.length;
  appendMedicine(emptyMedicineRowValue());
  setActiveRowIndex(nextIndex);
}
```

(Use whatever the existing add-medicine function is named; pattern is identical — append then activate.)

### 4. Reconcile `activeRowIndex` when rows are deleted

Add an effect or in-handler reconciliation:

```ts
function handleDelete(index: number) {
  // existing delete logic...
  if (activeRowIndex === index) {
    setActiveRowIndex(null);
  } else if (activeRowIndex !== null && activeRowIndex > index) {
    setActiveRowIndex(activeRowIndex - 1);
  }
}
```

Same for reorder if reorder shifts indices — the safer pattern is to use a stable id per row and key off that instead of array index for the active marker. Verify what the existing code uses; if there's a `row.id` (or `key`) field, prefer:

```ts
const [activeRowId, setActiveRowId] = useState<string | null>(null);
// then: isEditing={row.id === activeRowId}
```

If no stable id exists, prefer adding one as part of this task rather than relying on index (which is fragile under reorder + delete). A simple `crypto.randomUUID()` at row-creation time is enough; not persisted to the DB.

### 5. Keyboard navigation between summary rows (DL-8)

At the container level (the `<ol>` or `<div>` wrapping the medicine rows), add a `keydown` handler:

```ts
function handleListKeyDown(e: React.KeyboardEvent<HTMLOListElement>) {
  const focusable = e.currentTarget.querySelectorAll<HTMLElement>(
    "[role='button'][aria-label*='Medicine row']"
  );
  const currentIndex = Array.from(focusable).indexOf(
    document.activeElement as HTMLElement
  );
  if (currentIndex === -1) return;

  if (e.key === "ArrowDown" && currentIndex < focusable.length - 1) {
    e.preventDefault();
    focusable[currentIndex + 1].focus();
  } else if (e.key === "ArrowUp" && currentIndex > 0) {
    e.preventDefault();
    focusable[currentIndex - 1].focus();
  }
}
```

### 6. Tests in `frontend/components/cockpit/rx/sections/__tests__/PlanSection.test.tsx`

- "one editor at a time" — tapping row B's summary while A is in editor → A collapses, B expands.
- "incomplete row stays editor" — tapping a sibling while A is incomplete → A does NOT collapse (DL-3).
- "new row starts as editor" — clicking `[+ Add medicine]` → new row is active.
- "delete active row clears active" — deleting the active row → active becomes null.
- "delete non-active row before active shifts index" — deleting row 0 when row 2 is active → row 2 becomes the new row 1, still active.
- "ArrowDown/ArrowUp" — focus moves between summary rows.

### 7. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test cockpit/rx/sections/__tests__/PlanSection.test.tsx
```

---

## Acceptance gate

- [x] `activeRowIndex` (or `activeRowId`) state added to `<PlanSection>`.
- [x] Each `<MedicineRow>` receives `isEditing` + two callbacks.
- [x] One-at-a-time invariant enforced.
- [x] Incomplete row can't be collapsed (DL-3).
- [x] New row starts as active (DL-5).
- [x] Delete reconciles `activeRowIndex` correctly.
- [x] Keyboard nav between summary rows works.
- [x] Tests all green.

---

## Anti-goals

- ❌ Don't move the active-row state into a context — local `useState` in `<PlanSection>` is enough; no other component needs to read it.
- ❌ Don't persist active-row to the DB — UI-only ephemeral state.
- ❌ Don't add a "collapse all" / "expand all" button — out of scope for this batch; capture-inbox if dogfooding wants it.
- ❌ Don't affect autosave timing — DL-6.

---

## Notes

- **Stable id vs index:** index is fragile (reorder / delete shifts everything). If the medicine list already has a stable id per row, use it; if not, add one at this task as a small refactor. The "stable id" pattern is a one-line change at row-creation time and pays dividends across rxd-03 + future favorites in rxf-04.
- **Read-only mode:** `<PlanSection>` already passes `isReadOnly` through; with rxd-02, the row renders summary without tap affordances when read-only. `activeRowIndex` should remain `null` in read-only mode; the parent never sets it.
