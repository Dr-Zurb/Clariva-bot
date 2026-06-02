# rxf-07 · Verification + close-out

> **Wave 4** of [rx-polish-favorites](../plan-rx-polish-favorites-batch.md). Smoke matrix, 3 telemetry events, docs.

| Property | Value |
|---|---|
| **Size** | XS | **Model** | Composer 2 Fast | **Wave** | 4 | **Depends on** | rxf-06 | **Blocks** | — |

---

## What to do

### 1. Smoke matrix

Walk through plan-batch §"Cross-cutting acceptance gate." Pay attention to:
- Multi-doctor RLS: log in as doctor B, confirm zero access to doctor A's data.
- Cold-start: brand-new doctor sees autocomplete behavior identical to pre-batch.
- Send Rx → confirm `doctor_drug_usage` rows increment via direct DB check.
- 30-max guard: create 30 favorites, attempt 31 → 400.

### 2. Wire 3 telemetry events in `frontend/lib/patient-profile/telemetry.ts`

```ts
declare global {
  interface Window {
    __cockpitV2RRxPolishFavoritesLanded?: boolean;
    __cockpitV2RRxPolishRankingLanded?: boolean;
  }
}

export function trackCockpitV2RRxPolishFavoritesLanded(payload: {
  favoritesCount: number;
}): void {
  if (typeof window === "undefined") return;
  if (window.__cockpitV2RRxPolishFavoritesLanded) return;
  window.__cockpitV2RRxPolishFavoritesLanded = true;
  logCockpitEvent("cockpit_v2.r_rx_polish_favorites_landed", payload as Record<string, string | number | boolean>);
}

/** Fires per chip-tap (not one-shot) — adoption signal. */
export function trackCockpitV2RRxPolishFavoriteApplied(payload: {
  favoriteId: string;
  fromCount: number;
}): void {
  logCockpitEvent("cockpit_v2.r_rx_polish_favorite_applied", payload as Record<string, string | number | boolean>);
}

export function trackCockpitV2RRxPolishRankingLanded(payload: {
  topResultPersonalScore: number;
}): void {
  if (typeof window === "undefined") return;
  if (window.__cockpitV2RRxPolishRankingLanded) return;
  window.__cockpitV2RRxPolishRankingLanded = true;
  logCockpitEvent("cockpit_v2.r_rx_polish_ranking_landed", payload as Record<string, string | number | boolean>);
}
```

Fire `favoritesLanded` from `<FavoritesChipStrip>` first mount. Fire `rankingLanded` from `<DrugAutocomplete>` first render where the top result has score > 0. Fire `favoriteApplied` from `handleApplyFavorite` (rxf-06).

### 3. Update `docs/Reference/product/cockpit/COCKPIT.md`

Add sub-section: "Per-doctor drug favorites + autocomplete ranking (R-RX-POLISH/2.2 + /2.3, 2026-05-24)" with chip-strip diagram + side-sheet description.

### 4. Update `plan-cockpit-v2-execution-roadmap.md`

R-RX-POLISH/2.2 + /2.3 → ✅; ledger row; §6; §10 changelog.

### 5. Capture-inbox

```md
- [ ] [rx-polish-favorites follow-up] Time-decay on personal-score ranking. (Source: docs/Work/Daily-plans/May 2026/24-05-2026/rx-polish-favorites/plan-rx-polish-favorites-batch.md)
- [ ] [rx-polish-favorites follow-up] Fuzz-match free-text drugs against drug-master for partial credit. (Source: same)
- [ ] [rx-polish-favorites follow-up] Cross-doctor / clinic-wide favorite sharing. (Source: same)
- [ ] [rx-polish-favorites follow-up] Drag-to-reorder favorites in side-sheet. (Source: same)
- [ ] [rx-polish-favorites follow-up] Decrement usage when an Rx is voided / cancelled. (Source: same)
- [ ] [rx-polish-favorites follow-up] Surface "your top 5 drugs this month" dashboard widget — adjacent analytics. (Source: same)
```

---

## Acceptance gate

- [x] Smoke green.
- [x] 3 telemetry events firing.
- [x] Docs updated.
- [x] Capture-inbox.

---

## Anti-goals

- ❌ Don't update `plan-cockpit-v2.md` source plan — that's cockpit-v2-decommission.
- ❌ Don't add a doctor-facing analytics page; capture-inbox.
