# rxss-04 · Verification + close-out

> **Wave 4** of [rx-polish-side-sheet](../plan-rx-polish-side-sheet-batch.md).

| **Size** | XS | **Model** | Composer 2 Fast | **Wave** | 4 | **Depends on** | rxss-03 | **Blocks** | — | **Status** | ✅ Done (2026-05-24) |

---

## What to do

### 1. Smoke

- Open `/dashboard/appointments/[id]` for a patient with 10+ prior Rxes.
- Trigger side sheet from Plan zone → opens at 480px right-edge.
- Try all chips; verify disabled states for empty Dx / conditions.
- Type "amox" in search; list narrows.
- Apply (Append) on a prior Rx; confirm; medicines appended to draft.
- Apply (Replace) on a prior Rx; confirm; medicines replaced.
- ESC closes.
- Open appointment-detail / in-call / post-call mounts → still uses popover (DL-1).

### 2. Three telemetry events

Add to `frontend/lib/patient-profile/telemetry.ts`:

```ts
declare global {
  interface Window {
    // none — these aren't one-shot
  }
}

export function trackCockpitV2RRxPolishSideSheetOpened(payload: { priorRxCount: number }): void {
  logCockpitEvent("cockpit_v2.r_rx_polish_side_sheet_opened", payload as Record<string, string | number | boolean>);
}

export function trackCockpitV2RRxPolishSideSheetFilterChanged(payload: { chip: string; hasSearch: boolean }): void {
  logCockpitEvent("cockpit_v2.r_rx_polish_side_sheet_filter_changed", payload as Record<string, string | number | boolean>);
}

export function trackCockpitV2RRxPolishSideSheetApplied(payload: { priorRxId: string; mode: "append" | "replace"; medicineCount: number }): void {
  logCockpitEvent("cockpit_v2.r_rx_polish_side_sheet_applied", payload as Record<string, string | number | boolean>);
}
```

Fire from the side-sheet component lifecycle (open), chip/search interactions (filter), and Apply confirm handler.

### 3. Update `COCKPIT.md`

Add: "Previous-Rx side sheet (R-RX-POLISH/4.x, 2026-05-24)" sub-section — anchor id, dimensions, filter chips, Apply modes, integration with cv2-09 SideSheetAnchor.

### 4. Update roadmap

R-RX-POLISH/4.x → ✅; ledger; §6; §10.

### 5. Capture-inbox

```md
- [ ] [rx-polish-side-sheet follow-up] Field-level diff inside individual medicines (dosage / frequency changes). (Source: docs/Work/Daily-plans/May 2026/24-05-2026/rx-polish-side-sheet/plan-rx-polish-side-sheet-batch.md)
- [ ] [rx-polish-side-sheet follow-up] Fuzzy search-by-medicine. (Source: same)
- [ ] [rx-polish-side-sheet follow-up] Persisted doctor preference for default Append vs Replace. (Source: same)
- [ ] [rx-polish-side-sheet follow-up] Multi-select chips. (Source: same)
- [ ] [rx-polish-side-sheet follow-up] Sort options (by drug count, by date asc/desc). (Source: same)
- [ ] [rx-polish-side-sheet follow-up] Drop appointment-detail / in-call / post-call popover after side-sheet adopted everywhere (DL-1 transition). (Source: same)
```

---

## Acceptance gate

- [x] Smoke green (unit tests + code review; manual smoke on `/dashboard/appointments/[id]` recommended).
- [x] 3 telemetry events firing (`PreviousRxSideSheet` open/filter; `RxWorkspace` apply confirm).
- [x] Docs + roadmap + capture-inbox.
