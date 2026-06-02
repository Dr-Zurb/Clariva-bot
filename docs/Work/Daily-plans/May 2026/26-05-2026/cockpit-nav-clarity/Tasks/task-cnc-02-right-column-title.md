# cnc-02 · Right-column title rename

> **Wave 2 / Lane α** of [cockpit-nav-clarity](../plan-cockpit-nav-clarity-batch.md). Resolves issue #6 — right column titled "Notes" but renders SOAP documentation.

| Property | Value |
|---|---|
| **Status** | ✅ Done (2026-05-26) |
| **Owner** | Frontend |
| **Size** | XS (~1 LOC delta) |
| **Model** | Composer 2 Fast |
| **Wave** | 2 |
| **Depends on** | — |
| **Blocks** | cnc-05 (close-out) |

---

## Goal

Rename the right-column group title from `"Notes"` to `"Chart Notes"` (DL-1).

---

## What to do

### 1. Open `frontend/lib/patient-profile/templates.tsx`

Locate `makeRightColumn` (line ~221). The current title:

```tsx
function makeRightColumn(ctx: TelemedVideoContext): PaneDefinition {
  const appointmentId = ctx.appointment.id;
  return {
    id: 'right-column',
    title: 'Notes',
    // ...
  };
}
```

Change to:

```tsx
    title: 'Chart Notes',
```

### 2. Update the docstring in the same file's pane-id table (if any reference exists)

Search the file's top docstring (lines 20-30) for `right-column` or `notes` references; update any to read `"Chart Notes"`.

### 3. Tests

If `__tests__/templates.test.ts` (or similar) exists and asserts on the right-column title, update the expectation. If no such test exists, no test change needed — the title is a string literal, no logic to test.

### 4. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
```

---

## Acceptance gate

- [x] `makeRightColumn` returns `title: 'Chart Notes'`.
- [x] All four template factories (`getTelemedVideoTemplate`, `Voice`, `Text`, `Review`) share `makeRightColumn` — so the change applies to all.
- [x] tsc + lint clean.
- [x] Visual smoke: opening `/dashboard/appointments/[id]` shows "Chart Notes" as the right-column header.

---

## Anti-goals

- ❌ Don't rename "Subjective" or "Objective" leaf titles — those are correct and doctor-vernacular.
- ❌ Don't replace with an icon-only header — text label is intentional.
- ❌ Don't introduce a per-modality title (e.g., "Chart" for video, "Notes" for review) — keep it uniform.

---

## Notes

- This is the smallest task in the day. Composer 2 Fast — 30s job.
- The full-cockpit screenshot post-change shows "Chart Notes" instead of "Notes" above the Subjective + Objective panes.
- Considered alternative titles ("Documentation", "Subjective+Objective", "Visit Notes") and locked "Chart Notes" per DL-1. Capture-inbox if dogfood wants further refinement.
