# ppd-03 · Hide entry-mode radio + Photo block in cockpit mode

> **Status:** ✅ Done (2026-05-26)

> **Wave 2 / Lane β** of [cockpit-plan-pane-deduplication](../plan-cockpit-plan-pane-deduplication-batch.md). Resolves issues #3 + #4 from the day-26 dogfood crosswalk.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | M (~80 LOC delta + ~80 LOC tests) |
| **Model** | Auto |
| **Wave** | 2 |
| **Depends on** | ppd-01 |
| **Blocks** | ppd-05 (close-out) |

---

## Goal

In `PrescriptionFormBody`:

- When `entryModeLifted === true`, do NOT render the `<fieldset>` containing the "Prescription type" radio AND force `entryMode = "structured"` (one-shot on mount).
- When `photoLifted === true`, do NOT render the Photo / attachments block AND no-op the photo upload handler with a console warning in dev.

Default behavior preserved for non-cockpit mounts (both props default `false`).

---

## What to do

### 1. Open `frontend/components/consultation/PrescriptionForm.tsx`

Locate the `<fieldset>` block (lines ~1083-1107):

```tsx
        <fieldset className="rounded border border-gray-200 bg-gray-50 p-3">
          <legend className="text-sm font-medium text-gray-700">Prescription type</legend>
          {/* ...radio buttons for photo / structured / both... */}
        </fieldset>
```

Wrap in `{!entryModeLifted && (...)}`:

```tsx
        {!entryModeLifted && (
          <fieldset className="rounded border border-gray-200 bg-gray-50 p-3">
            <legend className="text-sm font-medium text-gray-700">Prescription type</legend>
            {/* ...existing radio buttons unchanged... */}
          </fieldset>
        )}
```

### 2. Force `entryMode = "structured"` on mount when `entryModeLifted === true`

Inside `PrescriptionFormBody`, near other `useEffect` blocks, add:

```tsx
  // ppd-03 (DL-4 / DL-5): cockpit-lifted entry-mode forces structured for
  // the lifetime of the form. The radio is hidden by the parent branch
  // above; this ensures the underlying state agrees.
  useEffect(() => {
    if (entryModeLifted && entryMode !== "structured") {
      setEntryMode("structured");
    }
  }, [entryModeLifted, entryMode, setEntryMode]);
```

This is idempotent — the effect runs whenever `entryModeLifted` flips or `entryMode` drifts (it shouldn't, but defensive).

### 3. Hide the Photo / attachments block

Locate the photo section (line ~1136+):

```tsx
      {(entryMode === "photo" || entryMode === "both") && (
        <section /* ...Photo section... */>
          {/* ... */}
        </section>
      )}
```

Add the `photoLifted` gate:

```tsx
      {!photoLifted && (entryMode === "photo" || entryMode === "both") && (
        <section /* ...unchanged... */>
          {/* ... */}
        </section>
      )}
```

### 4. No-op photo upload when `photoLifted === true`

Locate `ensurePrescriptionForPhoto` (line ~961):

```tsx
  const ensurePrescriptionForPhoto = async (): Promise<string> => {
```

At the top of the function body, add:

```tsx
    if (photoLifted) {
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console
        console.warn(
          "[ppd-03] ensurePrescriptionForPhoto called while photoLifted=true; no-op.",
        );
      }
      throw new Error("Photo upload is disabled in the cockpit Plan pane.");
    }
```

(Throwing is intentional — the calling code surfaces the error in a toast. In practice this code path should be unreachable because the photo block is hidden; the throw is the dev-time alarm if something slips through.)

### 5. Wire `subjectiveLifted` + `objectiveLifted` into the existing comp-root call

Inside `PrescriptionFormBody`, locate the existing `<PrescriptionFormCompositionRoot>` call (grep for `<PrescriptionFormCompositionRoot`). Add the two props to the existing prop list:

```tsx
        <PrescriptionFormCompositionRoot
          {/* ... existing props ... */}
          subjectiveLifted={subjectiveLifted}
          objectiveLifted={objectiveLifted}
          {/* ... existing props ... */}
        />
```

(This forwards what ppd-01 plumbed; ppd-02 consumes inside the comp root.)

### 6. Tests in `frontend/components/consultation/__tests__/PrescriptionForm.test.tsx`

Add describe blocks:

- `"entryModeLifted — hides the radio fieldset"` — render with `entryModeLifted={true}`; expect `screen.queryByText("Prescription type")` to be null.
- `"entryModeLifted — forces structured mode"` — start with `entryMode = "photo"` via prop or fixture; on mount with `entryModeLifted={true}`, assert `setEntryMode` was called with `"structured"`.
- `"photoLifted — hides the Photo section"` — render with `photoLifted={true}` and any `entryMode`; expect no Photo upload UI in the DOM.
- `"photoLifted — throws on upload attempt (dev)"` — programmatically call `ensurePrescriptionForPhoto` (or simulate); expect a thrown error.
- `"defaults — radio + photo render as before"` — no new props passed; existing behavior unchanged.

Pattern: if the existing test file is sparse, use `@testing-library/react` `render` + a minimal `<RxFormProvider>` wrapper. Reference sibling tests in `__tests__/PrescriptionForm.tsx` (existing).

### 7. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test components/consultation/__tests__/PrescriptionForm.test.tsx
```

---

## Acceptance gate

- [x] `<PrescriptionForm entryModeLifted>` does NOT render the "Prescription type" fieldset.
- [x] `<PrescriptionForm entryModeLifted>` forces `entryMode = "structured"` on mount.
- [x] `<PrescriptionForm photoLifted>` does NOT render the Photo section.
- [x] `<PrescriptionForm photoLifted>` causes `ensurePrescriptionForPhoto()` to throw with a dev warning.
- [x] `<PrescriptionForm subjectiveLifted objectiveLifted>` forwards both into `<PrescriptionFormCompositionRoot>`.
- [x] Defaults preserved.
- [x] tsc + lint + tests clean.

---

## Anti-goals

- ❌ Don't remove the radio buttons entirely — non-cockpit mounts still need them.
- ❌ Don't change the `prescription.type` DB shape — DL-10 freezes backend.
- ❌ Don't add a "warn doctor if they had a photo and now it's hidden" banner — there's no migration path (cockpit was always Plan-only). Capture-inbox if this surfaces.
- ❌ Don't refactor `entryMode` to a derived value — keep it as state for parity with non-cockpit mounts.

---

## Notes

- The `entryModeLifted` effect uses `setEntryMode` which is the existing setter — this is the cleanest way to flip the underlying state without re-architecting.
- The throw in `ensurePrescriptionForPhoto` is defensive; in practice the photo button is hidden so the call site is unreachable. If a future cockpit feature re-introduces a photo path, that batch must explicitly remove `photoLifted` from `templates.tsx` (ppd-04).
- For test setup, the existing test fixture in `__tests__/PrescriptionForm.test.tsx` already mounts `<RxFormProvider>` — reuse that pattern.
