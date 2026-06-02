# task-cockpit-fix-4 — `ConsultationLauncher` imperative-handle ref (replace `document.querySelector` hack)

**Lane:** H2 (Launcher cleanup) — runs after fix-2.  
**Status:** Drafted.  
**Effort:** S (~1 hour).  
**Owner:** TBD.  
**Hard deps:** fix-2 should land first to keep the diff focused on the imperative-handle work (otherwise the launcher's pre-call UI clutters the same file).

---

## Why

`ConsultationCockpit.tsx` (cockpit-4) wired the header `Start consult` and `End consult` CTAs by calling:

```ts
// ConsultationCockpit.tsx ~line 171
document.querySelector("[data-cockpit-start-btn]")?.dispatchEvent(...);
// ConsultationCockpit.tsx ~line 181
document.querySelector("[data-cockpit-end-btn]")?.dispatchEvent(...);
```

But:

- `rg "data-cockpit-start-btn"` returns **zero matches** anywhere in the codebase.
- `rg "data-cockpit-end-btn"` returns **zero matches** anywhere in the codebase.

The data attributes were never added to the launcher's modality buttons (and after fix-2 those buttons are hidden during `live` anyway). **The header CTAs are no-ops today**.

This task replaces the querySelector hack with a real imperative-handle ref.

Lock from the parent plan (K-H2):

> The cockpit header CTA is hidden during `live`. Doctor uses the room's own `Leave call` button. fix-4 only needs to expose `start(modality)` upward via ref — not `endCall`. Smaller surface, no two-level forwardRef chain through `<VideoRoom>`.

---

## What you'll change

**Three files:**

1. `frontend/components/consultation/ConsultationLauncher.tsx` — convert to `forwardRef`, add `useImperativeHandle` exposing `start(modality)`. (Do **not** expose `endCall`.)
2. `frontend/components/consultation/ConsultationCockpit.tsx` — create a `launcherRef`, pass it to the launcher, drop the `document.querySelector` calls and call `launcherRef.current?.start(...)` from `onStartConsult`. **Hide the header `End consult` CTA** when state is `live` (the room's own Leave button is the source of truth).
3. `frontend/components/consultation/cockpit/CockpitHeader.tsx` — adapt the prop signature so the header doesn't render an `End consult` CTA in `live` state.

---

## Locked design

### `ConsultationLauncherHandle` interface

In `ConsultationLauncher.tsx`, **export** an interface alongside the existing component:

```tsx
export interface ConsultationLauncherHandle {
  /**
   * Programmatically start a consult of the requested modality, as if the
   * user clicked the corresponding modality button. Same gating, same
   * error handling — calls the launcher's existing `handlePrimaryClick(m)`
   * (or its equivalent) under the hood.
   *
   * Resolves once the start request is dispatched (not once the call is
   * fully connected). Caller may render a "starting…" state on its CTA
   * by reading the launcher-side props it already holds.
   */
  start: (modality: "text" | "voice" | "video") => Promise<void>;

  /** Live status — useful for the cockpit to disable Start CTAs on race. */
  isLive: boolean;
}
```

### `forwardRef` rewrite

The current `ConsultationLauncher` is `function ConsultationLauncher(props: ConsultationLauncherProps)`. Convert to:

```tsx
import { forwardRef, useImperativeHandle, /* existing imports */ } from "react";

const ConsultationLauncher = forwardRef<
  ConsultationLauncherHandle,
  ConsultationLauncherProps
>(function ConsultationLauncher(props, ref) {
  // …all existing component body unchanged…

  useImperativeHandle(
    ref,
    () => ({
      start: async (modality) => {
        if (modality === "video") return handlePrimaryClick("video");
        if (modality === "voice") return handlePrimaryClick("voice");
        if (modality === "text") return handlePrimaryClick("text");
      },
      get isLive() {
        return sessionLive;
      },
    }),
    [handlePrimaryClick, sessionLive], // dep list per existing handler closure
  );

  return /* existing JSX (already gated by fix-2) */;
});

ConsultationLauncher.displayName = "ConsultationLauncher";

export default ConsultationLauncher;
```

**If the existing handler is `handlePrimaryClick` it's already mode-aware** — pass the modality through. **If the launcher has separate `handleStartVideo` / `handleStartVoice` / `handleStartText` functions**, the `start` impl dispatches to the right one. Read the file before deciding.

### `useImperativeHandle` dep list — pitfalls

If `handlePrimaryClick` is not memoised, the imperative handle re-creates every render — that's fine functionally (refs don't tear) but signals stale-closure risk. Use `useCallback` if not already, OR use the inline-getter form for `isLive` (shown above) so the closure can read fresh state.

**Don't expose `endCall`.** K-H2 is non-negotiable: the room's Leave button is the only end-call surface. Adding `endCall` here would require either (a) a two-level ref chain through `<VideoRoom>`, or (b) a "send a message to disconnect" pattern. Both add risk for a feature we're choosing to remove.

### `ConsultationCockpit` — the ref

In `ConsultationCockpit.tsx`:

```tsx
import { useRef } from "react";
import type { ConsultationLauncherHandle } from "./ConsultationLauncher";

export default function ConsultationCockpit(/* … */) {
  const launcherRef = useRef<ConsultationLauncherHandle>(null);

  // …existing state derivations…

  // CockpitHeader callbacks
  const onStartConsult = async (modality: "text" | "voice" | "video") => {
    await launcherRef.current?.start(modality);
  };

  // DELETE the document.querySelector lines (~171, ~181). DELETE onEndConsult
  // entirely; the header doesn't render an End CTA during live (see header
  // edit below).

  return (
    /* existing JSX, but: */
    <CockpitHeader
      /* existing props */
      onStartConsult={onStartConsult}
      /* onEndConsult REMOVED */
    />
    /* … */
    {cockpitState === "live" || cockpitState === "lobby" || cockpitState === "ready" /* etc */ ? (
      <ConsultationLauncher ref={launcherRef} {...launcherProps} />
    ) : null}
  );
}
```

### `CockpitHeader` — the prop change

In `CockpitHeader.tsx`:

- Drop the `onEndConsult` prop from the props interface.
- In the JSX, the `live` state's CTA section is **rendered as an empty fragment** (or the network-bars / live-timer chip the header already shows; just no End button).

If the header file currently has a switch on `state === "live"` that renders an `<EndConsultButton onClick={onEndConsult}>`, replace that branch with a small inline live indicator (e.g. the existing "Live · 4:32" pill) and delete the button.

The `ready` state's `Start consult` split-button keeps using `onStartConsult` — that's the only callback the header needs now.

### What to audit / clean up

- `rg "data-cockpit-start-btn|data-cockpit-end-btn"` should return zero matches after the diff.
- `rg "document.querySelector" frontend/components/consultation/` should return zero matches (or at least no NEW additions).
- The launcher's modality buttons may have had `data-cockpit-start-btn` markers added in some intermediate state — remove those if present.

---

## Acceptance

```
- [ ] frontend/components/consultation/ConsultationLauncher.tsx exports a
      ConsultationLauncherHandle interface with start(modality) and isLive.
- [ ] The launcher uses forwardRef + useImperativeHandle.
- [ ] frontend/components/consultation/ConsultationCockpit.tsx holds a
      `launcherRef`, passes it to the launcher, and onStartConsult delegates
      to launcherRef.current.start(modality).
- [ ] No document.querySelector calls remain in ConsultationCockpit.tsx.
- [ ] CockpitHeader.tsx no longer accepts an onEndConsult prop, and renders
      no End-consult button when state === "live".
- [ ] Smoke ready→live: from the cockpit, click the header "Start consult ▾"
      split-button, choose a modality. The consult starts (same as clicking
      the launcher's modality button used to). The header CTA disappears
      once state flips to "live".
- [ ] Smoke live: header CTA area shows only the "Live · NN:NN" pill (or
      whatever non-button affordance lives there). No End button. The room's
      own "Leave call" button is the only way to end.
- [ ] cd frontend && npx tsc --noEmit clean. No lint warnings.
- [ ] No regression on the non-cockpit launcher mount (if any).
```

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6**.

This task involves React patterns (`forwardRef` + `useImperativeHandle`) that Sonnet handles cleanly. **Opus is overkill** — the design is fully locked above. **Composer is risky** — three files, ref plumbing, easy to fumble the dep array.

**Pre-load in the chat:**

1. This task file.
2. The full `frontend/components/consultation/ConsultationLauncher.tsx` (post-fix-2 if available).
3. The full `frontend/components/consultation/ConsultationCockpit.tsx`.
4. The full `frontend/components/consultation/cockpit/CockpitHeader.tsx`.
5. K-H2 from `plan-cockpit-hardening-batch.md`.

**Suggested chat flow (2–3 turns):**

1. *Turn 1:* "Read the task file + the three target files. Show me the diff plan: which functions become memoised, what the `useImperativeHandle` dep list looks like, and what changes in CockpitHeader.tsx. Don't write code."
2. *Turn 2:* "Apply the changes. Show the full diff."
3. *Turn 3 (if needed):* "Run tsc + lint, fix any issues."

**Watch for:**

- The launcher's existing handlers may close over stale state if `useCallback` is missing. If you have to add `useCallback` to make the ref handle work correctly, capture that in the PR description (small refactor side-effect, fine).
- If the launcher already has unused `data-cockpit-start-btn` markers from a prior attempt, delete them.

---

## References

- Parent: [plan-cockpit-hardening-batch.md](../plan-cockpit-hardening-batch.md) (lock K-H2)
- Order: [EXECUTION-ORDER-cockpit-hardening.md](./EXECUTION-ORDER-cockpit-hardening.md)
- Bug surface: `ConsultationCockpit.tsx:171, 181` (querySelector calls)
- React docs: `useImperativeHandle` + `forwardRef`

---

**Status:** `Drafted` — ready to execute.
