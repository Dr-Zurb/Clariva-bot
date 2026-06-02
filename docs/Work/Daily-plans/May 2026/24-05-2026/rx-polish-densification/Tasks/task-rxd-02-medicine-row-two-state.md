# rxd-02 · MedicineRow two-state rendering

> **Wave 2 task α** of [rx-polish-densification](../plan-rx-polish-densification-batch.md). The visible work of the batch — adds summary mode to `<MedicineRow>`. Consumes rxd-01's helper.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | M (~120 LOC component delta + ~100 LOC tests) |
| **Model** | Auto |
| **Wave** | 2 |
| **Depends on** | rxd-01 |
| **Blocks** | rxd-03 (parent active-row tracking), rxd-04 (close-out) |

---

## Goal

Render `<MedicineRow>` in either editor-mode (today's existing UI, ~260px) or summary-mode (compact single line, ~44-48px). Switch driven by a new `isEditing` prop + `isMedicineRowComplete(value)` from rxd-01.

---

## What to do

### 1. Open `frontend/components/consultation/MedicineRow.tsx`

Add three new props to the existing `MedicineRowProps` interface:

```ts
interface MedicineRowProps {
  // ... existing props (index, value, onChange, onPatch, onDelete, isReadOnly, etc.) ...

  /**
   * R-RX-POLISH/2.1 (rxd-02): when false (and the row is `isMedicineRowComplete`),
   * render the compact summary line instead of the full editor. When true OR the
   * row is incomplete, render today's existing editor UI unchanged.
   *
   * Defaults to `true` to preserve legacy single-state behavior for callers that
   * haven't opted in (e.g. existing tests or non-cockpit mounts that haven't
   * been retrofitted with the parent active-row tracking).
   */
  isEditing?: boolean;
  /** Fired when the doctor taps the summary row (or presses Enter/Space on it). */
  onRequestEdit?: (index: number) => void;
  /** Fired when the row should collapse (Esc, blur-to-outside, sibling-tapped). */
  onRequestCollapse?: (index: number) => void;
}
```

### 2. Add the summary-mode branch

At the top of the component body, after destructuring, decide which UI to render:

```tsx
const shouldShowSummary =
  isEditing === false && isMedicineRowComplete(value) && !isReadOnly;

if (shouldShowSummary) {
  return (
    <MedicineRowSummary
      index={index}
      value={value}
      onRequestEdit={onRequestEdit}
      onDelete={onDelete}
      dragHandleProps={dragHandleProps}
    />
  );
}

// Existing editor UI continues below unchanged...
```

### 3. Add the `<MedicineRowSummary>` sub-component (same file)

```tsx
interface MedicineRowSummaryProps {
  index: number;
  value: MedicineRowValue;
  onRequestEdit?: (index: number) => void;
  onDelete?: (index: number) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

function MedicineRowSummary({
  index,
  value,
  onRequestEdit,
  onDelete,
  dragHandleProps,
}: MedicineRowSummaryProps): JSX.Element {
  // DL-2: drug · dosage · frequency-short · duration-short
  const frequencyShort =
    value.frequencyCode != null
      ? getFrequencyLegacyLabel(value.frequencyCode)
      : value.frequency;
  const durationShort =
    value.durationValue != null && value.durationUnit != null
      ? formatDurationLegacyLabel(value.durationValue, value.durationUnit)
      : value.duration;

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onRequestEdit?.(index);
    }
    // ArrowUp / ArrowDown navigation handled at the parent (rxd-03) level.
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onRequestEdit?.(index)}
      onKeyDown={handleKeyDown}
      className="group flex h-11 items-center gap-2 rounded-md border border-border bg-card px-2 hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-ring"
      aria-label={`Medicine row ${index + 1} — tap to edit`}
    >
      {/* Drag handle — DL-7 */}
      <div
        {...dragHandleProps}
        className="cursor-grab text-muted-foreground"
        onClick={(e) => e.stopPropagation()}
        aria-hidden
      >
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Primary content — single line, drug truncated if needed */}
      <div className="flex min-w-0 flex-1 items-baseline gap-2 text-sm">
        <span className="truncate font-medium">{value.medicineName}</span>
        <span className="text-muted-foreground">·</span>
        <span className="whitespace-nowrap">{value.dosage}</span>
        <span className="text-muted-foreground">·</span>
        <span className="whitespace-nowrap text-muted-foreground">
          {frequencyShort}
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="whitespace-nowrap text-muted-foreground">
          {durationShort}
        </span>
      </div>

      {/* Affordances — DL-4: stopPropagation so clicks don't expand */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRequestEdit?.(index);
        }}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Edit medicine row"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete?.(index);
        }}
        className="text-muted-foreground hover:text-destructive"
        aria-label="Delete medicine row"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
```

Imports needed at the top of the file:

```ts
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { isMedicineRowComplete } from "@/lib/cockpit/medicine-row-state";
```

### 4. Wire `Esc` + blur-to-outside in editor mode

Inside the editor branch (today's existing UI), wrap the outermost container with:

```tsx
<div
  onKeyDown={(e) => {
    if (e.key === "Escape" && isMedicineRowComplete(value)) {
      onRequestCollapse?.(index);
    }
  }}
  onBlur={(e) => {
    // Only collapse if focus moved completely outside this row.
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      if (isMedicineRowComplete(value)) {
        onRequestCollapse?.(index);
      }
    }
  }}
>
  {/* existing editor JSX */}
</div>
```

### 5. Read-only mode summary (DL behavior)

If `isReadOnly` is true AND the row is complete, render the summary (un-tappable — omit `onClick` + `tabIndex` + Edit/Delete affordances). Doctors viewing an ended visit see the recap. This is a small variant inside `<MedicineRowSummary>` — pass `readOnly` through.

### 6. Tests in `frontend/components/consultation/__tests__/MedicineRow.test.tsx`

Add (or create) describe blocks:

- "summary mode" — renders the compact line when `isEditing={false}` AND row is complete.
- "editor mode" — renders the full editor when `isEditing={true}` OR row is incomplete.
- "tap to edit" — clicking the summary fires `onRequestEdit` with the right index.
- "delete from summary" — clicking Delete fires `onDelete` and does NOT fire `onRequestEdit`.
- "Esc in editor" — pressing Esc on a complete row fires `onRequestCollapse`; on an incomplete row, does nothing.
- "blur to outside" — when focus leaves the editor entirely, if complete, fires `onRequestCollapse`.
- "read-only summary" — complete row in read-only mode renders summary without tap affordances.
- "default behavior" — when `isEditing` / callbacks are omitted, renders today's editor behavior unchanged (backwards compat).

### 7. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test components/consultation/__tests__/MedicineRow.test.tsx
```

---

## Acceptance gate

- [x] `<MedicineRow>` accepts `isEditing` + two callbacks; defaults preserve legacy.
- [x] Summary mode renders DL-2 template line at ~44-48px height.
- [x] Tap on summary → `onRequestEdit(index)`.
- [x] Edit / Delete icons on summary fire correct callbacks without triggering edit.
- [x] `Esc` in editor → `onRequestCollapse(index)` (when complete).
- [x] Blur out of editor → `onRequestCollapse(index)` (when complete).
- [x] Read-only mode → summary without tap affordances.
- [x] Drag handle still works in summary mode.
- [x] Tests all green.
- [x] tsc + lint clean.

---

## Anti-goals

- ❌ Don't change `MedicineRowValue` shape — render differently only.
- ❌ Don't change autosave behavior — DL-6.
- ❌ Don't add animations — capture-inbox.
- ❌ Don't inline-edit individual fields from summary mode — capture-inbox for Phase 4.
- ❌ Don't render anything else in the summary (e.g. "Instructions: …" line) — DL-2 is a single line.

---

## Notes

- **Why the `isEditing` default is `true` not `false`:** preserves backwards compat for non-cockpit mounts and existing tests that haven't been retrofitted. Behavior changes only when consumers opt in by passing `isEditing={false}` (rxd-03 does this for cockpit mounts).
- **DL-7 drag handle:** `dragHandleProps` is the existing pattern in the codebase (passed by the parent's drag-and-drop library, likely `@dnd-kit` or `react-beautiful-dnd`). Verify the actual prop name; the snippet uses a generic placeholder.
- **Tabular nums** on dosage / duration not added; if the summary jiggles visibly as values change at the boundary, add `font-variant-numeric: tabular-nums` to those spans.
