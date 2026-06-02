# rxd-04 · Verification + close-out

> **Wave 3** of [rx-polish-densification](../plan-rx-polish-densification-batch.md). Smoke matrix, telemetry, docs, capture-inbox.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | XS |
| **Model** | Composer 2 Fast |
| **Wave** | 3 |
| **Depends on** | rxd-03 |
| **Blocks** | — (closes R-RX-POLISH/2.1) |

---

## What to do

### 1. Run cross-cutting smoke matrix

Walk through [`plan-rx-polish-densification-batch.md` §"Cross-cutting acceptance gate"](../plan-rx-polish-densification-batch.md#cross-cutting-acceptance-gate-whole-batch). Tick every box.

Visual regression check (the headline win):
- Open `/dashboard/appointments/[id]` with a draft containing 3 complete medicines on a 1366×768 monitor.
- Assessment strip, Safety strip, all 3 medicine summary rows, and the Plan-footer all visible **without scroll**.
- Tap any medicine row → editor expands; others stay summarized.

### 2. Add `trackCockpitV2RRxPolishDensificationLanded` to `frontend/lib/patient-profile/telemetry.ts`

```ts
declare global {
  interface Window {
    __cockpitV2RRxPolishDensificationLanded?: boolean;
  }
}

/** One-shot per session — first `<MedicineRow>` mount in summary mode. */
export function trackCockpitV2RRxPolishDensificationLanded(payload: {
  appointmentId: string;
  completedRowsCount: number;
  editorRowsCount: number;
}): void {
  if (typeof window === "undefined") return;
  if (window.__cockpitV2RRxPolishDensificationLanded) return;
  window.__cockpitV2RRxPolishDensificationLanded = true;
  logCockpitEvent(
    "cockpit_v2.r_rx_polish_densification_landed",
    payload as Record<string, string | number | boolean>,
  );
}
```

Fire from `<PlanSection>` (rxd-03) via a `useEffect` on mount that computes `completedRowsCount` from `isMedicineRowComplete` per row.

### 3. Update `docs/Reference/product/cockpit/COCKPIT.md`

Add a sub-section under the middle-column / Plan zone description:

````markdown
### Medicine row densification (R-RX-POLISH/2.1, 2026-05-24)

Medicine rows now render in two states:

```
Editor (incomplete OR active):           Summary (complete + inactive):
┌────────────────────────────────┐       ┌────────────────────────────────┐
│ Drug name [autocomplete______] │       │ ⋮ PCM 500mg · TID · 5d  ✎ 🗑   │
│ Dosage    [_________________]  │       └────────────────────────────────┘
│ Route     [_________________]  │       ~44-48px tall
│ Frequency [_________________]  │
│ Duration  [_________________]  │
│ Instructions                   │
│ [____________________________] │
└────────────────────────────────┘
~260px tall
```

One row in editor at a time per `<PlanSection>`. New rows start as editor.
Incomplete rows can't collapse (data-loss guard).

**Source:** [`Daily-plans/May 2026/24-05-2026/rx-polish-densification/`](../Work/Daily-plans/May%202026/24-05-2026/rx-polish-densification/).
````

### 4. Update `plan-cockpit-v2-execution-roadmap.md`

- **§2 R-item table:** R-RX-POLISH row — note "/2.1 ✅ via rx-polish-densification (2026-05-24)" in Status (or refactor the row to break out sub-items).
- **§3 Batch ledger:** new row for `rx-polish-densification` shipped.
- **§6 Recommended ordering:** move this batch to shipped.
- **§10 Changelog:** append a line.

### 5. Capture-inbox

```md
- [ ] [rx-polish-densification follow-up] Animated transitions on collapse/expand if dogfooding wants polish. (Source: docs/Work/Daily-plans/May 2026/24-05-2026/rx-polish-densification/plan-rx-polish-densification-batch.md)
- [ ] [rx-polish-densification follow-up] Inline-edit a single field on a summary row without full editor expansion (Phase 4+). (Source: same)
- [ ] [rx-polish-densification follow-up] Per-doctor "always-expanded" density-default toggle. (Source: same)
- [ ] [rx-polish-densification follow-up] Stable-id refactor for medicine rows if not done in rxd-03 — needed for reliable favorites + reorder. (Source: same)
```

---

## Acceptance gate

- [x] Smoke matrix all green.
- [x] Telemetry event fires once per session.
- [x] `COCKPIT.md` updated.
- [x] Roadmap updated.
- [x] Capture-inbox lines added.

---

## Anti-goals

- ❌ Don't add new features here. Verification + docs only.
- ❌ Don't update `plan-cockpit-v2.md` itself — that's the cockpit-v2-decommission batch's scope.
