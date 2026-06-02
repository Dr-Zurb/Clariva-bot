# task-cockpit-fix-2 — `ConsultationLauncher` is mode-aware (hide pre-call UI during `live`)

**Lane:** H2 (Launcher cleanup) — first task in the lane.  
**Status:** Drafted.  
**Effort:** S (~30 minutes).  
**Owner:** TBD.  
**Hard deps:** none.

---

## Why

`ConsultationCockpit.tsx` (cockpit-3) mounts the **whole** `<ConsultationLauncher>` for the `live` cockpit state because the launcher holds the in-memory `liveSession` / `textSession` records that drive video/voice/text room mounting. Mounting the launcher is correct — **but the launcher's own pre-call UI is wrong inside the cockpit's `live` state**.

The screenshots from 2026-05-06 show the launcher's `Text Consultation / Voice Consultation / Video Consultation` button row rendering **above** the live video room. That row is for *starting* a consult, not for switching during one.

Lock from the parent plan (K-H1):

> When `sessionLive === true`, the launcher renders **only** the live panel (its existing `<LiveConsultPanel>` block). The pre-call header strip + modality button grid are gated behind `!sessionLive`.

This task lands that lock.

---

## What you'll change

**One file:** `frontend/components/consultation/ConsultationLauncher.tsx`.

Wrap the pre-call UI (the header strip with `<h2>Consultation</h2> + Booked as: …` + the 3-button modality grid + the start-error / coming-soon paragraphs) in `{!sessionLive && (...) }`. Leave everything else (the live panel, the rehydrate effects, the session-state plumbing) alone.

---

## Locked design

### Where the pre-call UI lives

In the current file, the pre-call UI is the JSX block roughly at **lines 484–571**:

- A `<header>` with `<h2>Consultation</h2>` and a `Booked as: …` pill.
- A `<div role="group" aria-label="Choose consultation modality">` with the 3 modality buttons.
- An optional `<p>` with `startError` if a start failed.
- An optional `<p>` with the `comingSoon` toast for unsupported modalities.

The live panel (`<LiveConsultPanel>` or whatever your file calls the post-start render) lives below that and is gated on `liveSession` / `textSession`.

### `sessionLive` derivation

`sessionLive` already exists locally in the launcher as a `useMemo` / boolean derived from `liveSession || textSession`. **Re-use it; do not invent a new var.** If your code instead uses `liveSession || textSession` inline, lift it into a single `const sessionLive = Boolean(liveSession ?? textSession);` near the top of the render.

### The wrap

```tsx
{!sessionLive && (
  <>
    <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gray-200 pb-3">
      <h2 className="text-lg font-semibold text-gray-900">Consultation</h2>
      <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
        Booked as: {MODALITY_META[bookedModality].bookedLabel}
      </span>
    </header>

    <div
      role="group"
      aria-label="Choose consultation modality"
      className="grid grid-cols-1 gap-3 sm:grid-cols-3"
    >
      {/* …existing 3-button .map()… */}
    </div>

    {startError && <p className="…">{startError}</p>}
    {comingSoon && <p className="…">{comingSoon}</p>}
  </>
)}

{/* live panel below — UNCHANGED */}
{sessionLive && /* existing render */}
```

The transient `comingSoon` / `startError` paragraphs go inside the `{!sessionLive && ...}` block too — they only make sense pre-call.

### Don't touch

- All session-state effects (`useEffect` / rehydrate-on-refresh / starting / starting-error setters).
- The live panel render itself.
- The Twilio helpers, the ICE-servers fetch, the SWR keys.
- Header CSS — keep the exact class strings; just wrap them in the conditional.
- `MODALITY_META`, `BUTTON_MODALITIES`, primary/secondary handlers.

If your wrap accidentally moves a `useEffect` or a `useMemo` inside the `{!sessionLive && ...}` block, **revert and try again** — only JSX moves; no hooks may be conditionally called.

### Live-panel sanity check

If your live-panel JSX *also* renders a "Consultation" h2 or any pill, you may end up with duplicate headers when `sessionLive === true`. Visually verify after editing. The cockpit's `<CockpitHeader>` already shows "Live · 4:32" in the page chrome, so the live-panel does NOT need its own header. If a duplicate appears, remove the redundant one from the live-panel block (separate scoped commit; do not merge with this task).

---

## Acceptance

```
- [ ] When sessionLive === false:
      - The header strip (h2 "Consultation" + "Booked as: …" pill) renders.
      - The 3-button modality grid renders.
      - The startError / comingSoon paragraphs render when relevant.

- [ ] When sessionLive === true:
      - The header strip is GONE.
      - The 3-button modality grid is GONE.
      - The startError / comingSoon paragraphs are GONE.
      - The live panel (<VideoRoom> / <VoiceConsultRoom> / <TextConsultRoom>)
        renders untouched.

- [ ] No new lint warnings; no new TS errors.
- [ ] No hook moved inside a conditional. Verify by skimming the diff.
- [ ] Smoke (text appt): start a text consult. Header + buttons disappear,
      <TextConsultRoom> renders.
- [ ] Smoke (video appt): start a video consult. Header + buttons disappear,
      <VideoRoom> renders.
- [ ] Smoke (refresh during live): refresh the page mid-call. Rehydrates as
      sessionLive === true; pre-call UI does NOT flash before the live panel
      mounts (or if it flashes <100ms during rehydrate, that's acceptable —
      flag in PR description if longer).
```

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6**.

This is judgement-light but requires careful reading of a long file (`ConsultationLauncher.tsx` is the modality-juggling brain — don't break the live-panel rehydrate path). Sonnet is the right tier; Opus would be overkill, Composer would risk dropping a hook into the conditional.

**Pre-load in the chat:**

1. This task file.
2. The full `frontend/components/consultation/ConsultationLauncher.tsx`.
3. The K-H1 lock from `plan-cockpit-hardening-batch.md`.

**Open with this prompt:**

```
You are implementing task-cockpit-fix-2. Read the task file at docs/Work/Daily-plans/May 2026/06-05-2026/Tasks/task-cockpit-fix-2-launcher-mode-aware.md, then read frontend/components/consultation/ConsultationLauncher.tsx in full.

The locked design says: wrap the pre-call UI (header strip + 3-button modality grid + startError + comingSoon paragraphs) in {!sessionLive && (...)}. No hooks may move inside the conditional — only JSX.

Show me the diff before applying. After applying, run cd frontend && npx tsc --noEmit and report.
```

---

## Hand-off to fix-4

After this task ships, the launcher's pre-call UI is gated on `!sessionLive`. fix-4 then adds an imperative-handle ref so the cockpit's header `Start consult` CTA can call `launcherRef.current.start("video" | "voice" | "text")` directly, replacing the current `document.querySelector` hack. The `start(...)` impl will internally call the same `handlePrimaryClick` / `handleSecondaryClick` paths that today are bound to the modality buttons — so even though the buttons are hidden, the start logic stays reachable.

---

## References

- Parent: [plan-cockpit-hardening-batch.md](../plan-cockpit-hardening-batch.md) (lock K-H1)
- Order: [EXECUTION-ORDER-cockpit-hardening.md](./EXECUTION-ORDER-cockpit-hardening.md)
- Bug surface: `ConsultationLauncher.tsx:485-571` (approximate; confirm before edit)

---

**Status:** `Drafted` — ready to execute.
