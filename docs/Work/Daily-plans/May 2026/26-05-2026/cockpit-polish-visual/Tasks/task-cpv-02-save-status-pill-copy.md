# cpv-02 · SaveStatusPill copy + icons

> **Status:** ✅ Done (2026-05-26). Pill owns DL-2 copy/icons; maps `isPending` → `saving`.

> **Wave 1 step 1** of [cockpit-polish-visual](../plan-cockpit-polish-visual-batch.md). Resolves issue #14 — SaveStatusPill renders as "—" when idle.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | XS (~30 LOC delta + ~40 LOC tests) |
| **Model** | Auto |
| **Wave** | 1 |
| **Depends on** | cpv-01 (sequential in same Wave 1 lane) |
| **Blocks** | — (Wave 2 lanes are independent of cpv-01/02) |

---

## Goal

`<SaveStatusPill>` shows clear copy + icon in each of 4 states per DL-2. The `"—"` placeholder is removed entirely.

| State | Copy | Icon |
|---|---|---|
| idle | `Autosaving` | `CheckCircle2` (muted) |
| dirty / saving | `Saving…` | spinner |
| saved | `Saved` | `CheckCircle2` (muted-foreground) |
| error | `Save failed — retry` | `AlertCircle` (red) |

---

## What to do

### 1. Open `frontend/components/cockpit/rx/SaveStatusPill.tsx`

Read the existing implementation. Identify the state machine — likely `idle | dirty | saving | saved | error` or similar.

### 2. Update the state-to-copy + state-to-icon mapping

```tsx
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";

type SaveStatusUiState = "idle" | "saving" | "saved" | "error";

function getPillContent(state: SaveStatusUiState): {
  label: string;
  icon: JSX.Element;
  tone: "muted" | "neutral" | "destructive";
} {
  switch (state) {
    case "idle":
      return {
        label: "Autosaving",
        icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />,
        tone: "muted",
      };
    case "saving":
      return {
        label: "Saving…",
        icon: <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />,
        tone: "neutral",
      };
    case "saved":
      return {
        label: "Saved",
        icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />,
        tone: "neutral",
      };
    case "error":
      return {
        label: "Save failed — retry",
        icon: <AlertCircle className="h-3.5 w-3.5" aria-hidden />,
        tone: "destructive",
      };
  }
}
```

Map your existing state to `SaveStatusUiState`. The mapping might require unifying close-but-not-identical states (e.g., "dirty" → "saving" if a save is queued; "queued" → "saving").

### 3. Render

```tsx
const { label, icon, tone } = getPillContent(uiState);
const toneClass = {
  muted: "text-muted-foreground",
  neutral: "text-foreground",
  destructive: "text-destructive",
}[tone];

return (
  <div
    role="status"
    aria-live="polite"
    aria-label={`Save status: ${label}`}
    className={`inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-xs ${toneClass}`}
  >
    {icon}
    <span>{label}</span>
  </div>
);
```

### 4. Click-to-retry on error

If the existing pill is a button with a retry handler, preserve that. If not, in the error state, wrap the pill in a `<button>` that calls a `onRetry` prop (add the prop if not already there).

For v1, click-to-retry is optional — the error copy alone is the win. Capture-inbox if not done here.

### 5. Tests in `__tests__/SaveStatusPill.test.tsx` (mod or new)

```tsx
describe("SaveStatusPill copy + icons (cpv-02)", () => {
  it("idle state shows 'Autosaving'", () => {
    render(<SaveStatusPill state="idle" />);
    expect(screen.getByText("Autosaving")).toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("saving state shows 'Saving…' with spinner", () => {
    render(<SaveStatusPill state="saving" />);
    expect(screen.getByText("Saving…")).toBeInTheDocument();
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("saved state shows 'Saved' with check icon", () => {
    render(<SaveStatusPill state="saved" />);
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("error state shows 'Save failed — retry'", () => {
    render(<SaveStatusPill state="error" />);
    expect(screen.getByText(/save failed — retry/i)).toBeInTheDocument();
  });

  it("aria-label includes the current status", () => {
    render(<SaveStatusPill state="saving" />);
    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("Saving"),
    );
  });

  it("never shows the legacy '—' placeholder in any state", () => {
    const states: SaveStatusUiState[] = ["idle", "saving", "saved", "error"];
    states.forEach((s) => {
      const { unmount } = render(<SaveStatusPill state={s} />);
      expect(screen.queryByText("—")).not.toBeInTheDocument();
      unmount();
    });
  });
});
```

### 6. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test components/cockpit/rx/__tests__/SaveStatusPill.test.tsx
```

---

## Acceptance gate

- [x] All four states have meaningful copy + icon.
- [x] No state renders `"—"`.
- [x] `aria-live="polite"` + `aria-label` correctly reflect state.
- [x] Tests cover all four states + aria.
- [x] tsc + lint clean.

---

## Anti-goals

- ❌ Don't add new states — work with the existing state machine.
- ❌ Don't animate the icon transitions — capture-inbox.
- ❌ Don't replace icons with text — icon + label is the pattern.
- ❌ Don't change the autosave timing behavior — pill is purely a display concern.

---

## Notes

- The icon set: `CheckCircle2`, `Loader2`, `AlertCircle` from `lucide-react`. All are in the codebase already.
- The pill is rendered inside `<PrescriptionForm>` header. When `actionsInFooter === true` (cockpit mode), the pill moves to `<PlanActionFooter>`. Verify both surfaces show the new copy.
- For SR users, `role="status"` + `aria-live="polite"` ensures changes are announced.
