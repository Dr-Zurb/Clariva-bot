# cpv-04 · Examination General/Systemic split visibility ✅

> **Wave 2 / Lane β** of [cockpit-polish-visual](../plan-cockpit-polish-visual-batch.md). Resolves issue #16 — examination split not visually obvious.
>
> **Status:** Done (2026-05-26).

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | XS (~30 LOC delta + ~30 LOC tests) |
| **Model** | Auto |
| **Wave** | 2 |
| **Depends on** | — |
| **Blocks** | cpv-08 (close-out) |

---

## Goal

The two examination textareas (General + Systemic, shipped by chp-02) get labels + icons + a visible divider so doctors immediately see they're distinct fields (DL-4).

---

## What to do

### 1. Open `frontend/components/cockpit/rx/sections/ObjectiveSection.tsx`

Locate the two textareas (shipped by chp-02). Likely structure:

```tsx
<div className="…">
  <textarea
    value={general}
    onChange={(e) => setGeneralExam(e.target.value)}
    placeholder="General examination findings"
  />
  <textarea
    value={systemic}
    onChange={(e) => setSystemicExam(e.target.value)}
    placeholder="Systemic examination findings"
  />
</div>
```

### 2. Wrap in a labelled container

```tsx
import { User, Stethoscope } from "lucide-react";

<div className="rounded-md border border-border bg-card">
  {/* General Examination */}
  <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
    <User className="h-4 w-4 text-muted-foreground" aria-hidden />
    <label htmlFor="exam-general" className="text-xs font-medium text-foreground">
      General Examination
    </label>
  </div>
  <textarea
    id="exam-general"
    value={general}
    onChange={(e) => setGeneralExam(e.target.value)}
    placeholder="e.g. Alert, oriented, in no distress"
    className="block w-full resize-y border-0 bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    rows={3}
  />

  {/* Divider */}
  <div className="h-px bg-border" aria-hidden />

  {/* Systemic Examination */}
  <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
    <Stethoscope className="h-4 w-4 text-muted-foreground" aria-hidden />
    <label htmlFor="exam-systemic" className="text-xs font-medium text-foreground">
      Systemic Examination
    </label>
  </div>
  <textarea
    id="exam-systemic"
    value={systemic}
    onChange={(e) => setSystemicExam(e.target.value)}
    placeholder="e.g. Chest clear, HS S1+S2 normal, abdomen soft"
    className="block w-full resize-y border-0 bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    rows={4}
  />
</div>
```

Key elements:
- Single bordered container wrapping both textareas.
- Each textarea has a labelled header (icon + label).
- A 1px divider visually separates the two regions.
- Placeholders are realistic clinical examples.

### 3. Preserve existing data flow

The `general` + `systemic` state, `setGeneralExam` / `setSystemicExam` setters, and the serialize/parse logic (from chp-02) are unchanged. Only the visual treatment changes.

### 4. Tests in `__tests__/ObjectiveSection.test.tsx`

```tsx
describe("ObjectiveSection visual split (cpv-04)", () => {
  it("renders both labels with icons", () => {
    renderWithProvider();
    expect(screen.getByText("General Examination")).toBeInTheDocument();
    expect(screen.getByText("Systemic Examination")).toBeInTheDocument();
  });

  it("each textarea is labelled correctly", () => {
    renderWithProvider();
    expect(screen.getByLabelText("General Examination")).toBeInTheDocument();
    expect(screen.getByLabelText("Systemic Examination")).toBeInTheDocument();
  });

  it("typing in General does not affect Systemic", () => {
    renderWithProvider();
    fireEvent.change(screen.getByLabelText("General Examination"), {
      target: { value: "alert and oriented" },
    });
    expect(screen.getByLabelText("Systemic Examination")).toHaveValue("");
  });

  it("placeholders are visible clinical examples", () => {
    renderWithProvider();
    expect(
      screen.getByPlaceholderText(/alert, oriented/i),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/chest clear/i),
    ).toBeInTheDocument();
  });
});
```

### 5. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test components/cockpit/rx/sections/__tests__/ObjectiveSection.test.tsx
```

---

## Acceptance gate

- [x] Both textareas have labels (text + icon).
- [x] `<label htmlFor>` correctly associates with each textarea.
- [x] Visible divider between the two regions.
- [x] Existing data flow unchanged (general/systemic state still distinct).
- [x] Tests cover labels + data isolation.
- [x] tsc + lint clean.

---

## Anti-goals

- ❌ Don't change the serialize/parse helpers — chp-02 owns those.
- ❌ Don't add a third examination textarea — capture-inbox if needed.
- ❌ Don't change the underlying field shape — UI labelling only.
- ❌ Don't add icon-only rendering — labels are mandatory.

---

## Notes

- The two icons (User / Stethoscope) signal "general body assessment" + "system-specific exam" — the doctor pattern-matches at a glance.
- Placeholder copy is generic enough to be useful without being prescriptive. Doctors will type their own.
- The bordered container with internal divider is the standard "grouped fieldset" treatment used elsewhere in the codebase (search for `rounded-md border border-border bg-card` for similar patterns).
