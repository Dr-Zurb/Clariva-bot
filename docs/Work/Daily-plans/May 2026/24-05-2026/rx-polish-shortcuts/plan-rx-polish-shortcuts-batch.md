# Rx-polish shortcuts — R-RX-POLISH/3.x — 24 May 2026 batch plan

> **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). **Zero Opus tasks.** Three Auto + one Composer 2 Fast close-out.
>
> **Source plan:** [`plan-cockpit-v2.md` §R-RX-POLISH/3.x](../../../Product%20plans/plan-cockpit-v2.md) — "Keyboard shortcuts scoped to focused pane (DL-10): `Cmd/Ctrl+Enter` → Send Rx & finish, `Cmd/Ctrl+M` → add medicine, `Cmd/Ctrl+Shift+T` → templates, `Cmd/Ctrl+Shift+P` → preview." Plus Cmd+K command palette real handler (cv2-09 shipped the placeholder; this batch ships the real handler).
>
> **Predecessor batches:** All Phase 2 + rx-polish-densification + rx-polish-favorites (none strictly required — shortcuts are an orthogonal surface; only the existing Send / Add Medicine / Template / Preview actions need to exist, which they do). **Disjoint from rx-polish-side-sheet and cockpit-layout-presets-modality** — fully parallelizable.
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-rx-polish-shortcuts.md`](./Tasks/EXECUTION-ORDER-rx-polish-shortcuts.md).

---

## Why this batch

Power users want their hands on the keyboard. The current cockpit forces mouse hops for the four most-frequent actions: Send Rx & finish (clicked once per visit, ~50 visits/day = 50 mouse hops), Add medicine (~3 per visit = 150 mouse hops), open Templates (~1 per visit = 50 mouse hops), open Preview (~1 per visit = 50 mouse hops). At ~2 seconds per mouse hop, that's ~300 seconds (5 minutes) of pure mouse-acquisition friction per doctor per day.

R-RX-POLISH/3.x ships four scoped shortcuts:

| Shortcut | Action | Scope |
|---|---|---|
| `Cmd/Ctrl+Enter` | Send Rx & finish | Plan pane focused OR anywhere when safe (no input is mid-composition) |
| `Cmd/Ctrl+M` | Add medicine | Plan pane focused |
| `Cmd/Ctrl+Shift+T` | Open Templates | Plan pane focused |
| `Cmd/Ctrl+Shift+P` | Open Preview | Plan pane focused |

Plus the **Cmd+K command palette real handler** — cv2-09 shipped a "Coming soon" placeholder dialog. This batch replaces it with a working palette that lets doctors fuzzy-search registered commands (Send Rx, Add medicine, Save preset, Open Previous-Rx, etc.) and execute them via keyboard.

DL-10 of the source plan stipulates **pane-scoped shortcuts** — not global. The reason: `Cmd+M` is also the standard "Minimize window" on Mac; binding it globally would frustrate doctors who use it for window management. Scoping it to the focused Plan pane preserves OS semantics elsewhere on the page.

This batch closes R-RX-POLISH/3.x with **4 tasks across 3 waves**, **~8-10h wall-clock single-engineer (~1-1.5 dev-days)**, **zero migrations**, **zero Opus tasks**.

---

## Decision lock

**DL-1: New hook `usePaneKeyboardShortcuts` registers bindings scoped to a pane id.** Lives at `frontend/hooks/usePaneKeyboardShortcuts.ts`. Signature:

```ts
usePaneKeyboardShortcuts({
  paneId: "plan",
  shortcuts: [
    { combo: "mod+enter", action: handleSend, when: "safe" },
    { combo: "mod+m", action: handleAddMedicine, when: "pane-focused" },
    { combo: "mod+shift+t", action: handleOpenTemplates, when: "pane-focused" },
    { combo: "mod+shift+p", action: handleOpenPreview, when: "pane-focused" },
  ],
});
```

Internally listens on `document.keydown` but filters by `when`:
- `when: "pane-focused"` — fires only if `document.activeElement` is inside the pane with the given id (or the pane itself is focused).
- `when: "safe"` — fires if `document.activeElement` is NOT a text-input mid-composition (textarea, contentEditable) OR if the user explicitly opted in by also holding Shift. `Cmd+Enter` from inside a textarea would naturally produce a newline; `Cmd+Shift+Enter` triggers Send.

**DL-2: `mod` = `metaKey` on macOS, `ctrlKey` on Windows/Linux.** Detect via `navigator.platform.includes('Mac')`. No need for a runtime opt; the existing project pattern (see `CommandBar.tsx`) does this same detection.

**DL-3: Pane-focus detection uses `data-cockpit-pane-id` attribute.** `<PatientProfileShell>` already renders each leaf inside a container; add `data-cockpit-pane-id={pane.id}`. The hook checks `closest('[data-cockpit-pane-id="plan"]')` against `document.activeElement`.

**DL-4: Shortcuts are NOT customisable per-doctor in v1.** Universal bindings. Capture-inbox for Phase 4 if dogfooding wants per-doctor remap (rare; almost no clinical software does this).

**DL-5: Cmd+K command palette uses a registry pattern.** New `frontend/lib/patient-profile/command-registry.ts`. Commands register via `registerCommand({ id, label, keywords, action, enabled })`. `<CommandBar>` opens a real `<Command>` (shadcn `cmdk`) that fuzzy-searches the registry. The four Plan-pane shortcuts above auto-register a corresponding command (so doctors who don't remember `Cmd+M` can still get there via Cmd+K → "add medicine").

**DL-6: No hotkey collisions with browser defaults that matter.** `Cmd+Enter` is rarely bound (Gmail's Send is the precedent). `Cmd+M` minimizes window on Mac — pane-scoped avoids the collision. `Cmd+Shift+T` reopens last tab in browsers — pane-scoped avoids. `Cmd+Shift+P` opens InPrivate / DevTools profiles — pane-scoped avoids. `Cmd+K` per cv2-09 is ours globally.

**DL-7: Visible affordances.** Tooltip on each action button shows the shortcut (e.g. `[Send Rx & finish ▸ Ctrl+Enter]`). The keyboard help dialog (opened via `?` or via Cmd+K → "Keyboard shortcuts") lists all bindings. Discoverability without bloating the UI.

**DL-8: Telemetry — one event per shortcut use** — `cockpit_v2.r_rx_polish_shortcut_used` with payload `{ combo, action }`. NOT one-shot — every fire is an adoption signal.

---

## Phases

### Wave 1 — Hook + command registry (2 tasks, ~3-4h, parallel-safe)

- [`task-rxs-01-pane-keyboard-shortcuts-hook.md`](./Tasks/task-rxs-01-pane-keyboard-shortcuts-hook.md) — **S, Auto** — New `frontend/hooks/usePaneKeyboardShortcuts.ts` (~120 LOC) + tests. Implements DL-1, DL-2, DL-3.
- [`task-rxs-02-command-registry.md`](./Tasks/task-rxs-02-command-registry.md) — **S, Auto** — New `frontend/lib/patient-profile/command-registry.ts` (~80 LOC) + tests. Implements DL-5 contract; no consumers yet.

### Wave 2 — Plan-pane shortcut bindings + Cmd+K real palette (1 task, ~4h)

- [`task-rxs-03-plan-shortcuts-and-cmdk.md`](./Tasks/task-rxs-03-plan-shortcuts-and-cmdk.md) — **M, Auto** — Modify `<PlanSection>` to call `usePaneKeyboardShortcuts` with the four DL-1 bindings. Modify `<CommandBar>` (existing Cmd+K stub) to render a real `cmdk`-backed palette consuming the command-registry. Auto-register the four Plan shortcuts as commands. Add `data-cockpit-pane-id` attribute in `<PatientProfileShell>` per pane (small touch to shell). Add tooltip-with-shortcut on the Send Rx + Add Medicine buttons.

### Wave 3 — Verification + close-out (1 task, ~1h)

- [`task-rxs-04-verification-and-close-out.md`](./Tasks/task-rxs-04-verification-and-close-out.md) — **XS, Composer 2 Fast** — Smoke matrix; wire telemetry event; keyboard help dialog content (lists all bindings); update COCKPIT.md, roadmap, capture-inbox.

---

## Cross-cutting acceptance gate

### Structural
- [x] `usePaneKeyboardShortcuts` hook exported.
- [x] `command-registry.ts` exports register/list/execute helpers.
- [x] `<CommandBar>` renders a real palette (no more "Coming soon" placeholder).
- [x] `<PatientProfileShell>` sets `data-cockpit-pane-id` per pane.

### Behavior
- [x] `Cmd/Ctrl+Enter` from inside Plan pane → Send Rx & finish (if safe).
- [x] `Cmd/Ctrl+Enter` from inside a textarea → inserts newline (default browser behavior); only `Cmd/Ctrl+Shift+Enter` triggers Send.
- [x] `Cmd/Ctrl+M` from inside Plan pane → adds medicine row + sets it active.
- [x] `Cmd/Ctrl+M` from inside Subjective/Objective pane → does nothing (pane-scoped).
- [x] `Cmd/Ctrl+Shift+T` → opens template picker.
- [x] `Cmd/Ctrl+Shift+P` → opens preview.
- [x] `Cmd/Ctrl+K` → opens palette; typing "send" matches Send Rx command; Enter executes.
- [x] Tooltip on Send + Add Medicine buttons shows shortcut hint.
- [x] Keyboard help dialog accessible via `?` key OR Cmd+K → "keyboard shortcuts".

### Quality
- [x] tsc / lint / test / build clean.
- [x] Telemetry `r_rx_polish_shortcut_used` fires per shortcut use.

### Documentation
- [x] COCKPIT.md updated.
- [x] Roadmap: R-RX-POLISH/3.x → ✅.
- [x] Capture-inbox.

---

## Cost estimate

| Wave | Tasks | Auto | Composer | Opus | Wall-clock |
|---|---|---|---|---|---|
| 1 | rxs-01, rxs-02 | 2 | 0 | 0 | ~3-4h |
| 2 | rxs-03 | 1 | 0 | 0 | ~4h |
| 3 | rxs-04 | 0 | 1 | 0 | ~1h |
| **Total** | **4** | **3** | **1** | **0** | **~8-10h** |

---

## References

- Source plan §R-RX-POLISH/3.x.
- Existing Cmd+K stub: [`frontend/components/patient-profile/CommandBar.tsx`](../../../../../frontend/components/patient-profile/CommandBar.tsx).
- aux-surfaces command-bar contract: [`frontend/lib/patient-profile/aux-surfaces.ts`](../../../../../frontend/lib/patient-profile/aux-surfaces.ts).
