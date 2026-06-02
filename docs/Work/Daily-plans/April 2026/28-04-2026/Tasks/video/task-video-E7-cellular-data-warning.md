# Task video-E7: Cellular-data warning (one-time prompt on first cellular video session)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch E (T5 reliability) — **S item, ~3h**

---

## Task overview

Patient on cellular with a data cap doesn't know video burns ~5-10MB per minute (~150-300MB for a 30-min consult). T5.37 ships a one-time prompt before the FIRST cellular video session:

```
You're on cellular data
This 30-min video consult will use ~150 MB of data.
Want to switch to:
  [Wi-Fi (recommended)]
  [Audio-only (saves data)]
  [Continue on cellular]
```

Uses `navigator.connection.effectiveType` and `navigator.connection.type` to detect cellular. Estimated MB/min figure pulls from B8 quality picker current value.

**One-time per device** — show once via localStorage flag. Don't pester.

**Cheapest item in Sub-batch E.**

**Estimated time:** ~3h.

**Status:** ✅ **Shipped (2026-05-02)** — Phase 1. Pre-call cellular-data warning modal mounted on the patient join page. Pure detection + estimate helpers in `frontend/lib/video/data-estimate.ts` (cellular tri-state + MB/min mapping per Decision §30); `<CellularDataWarning>` overlay self-gates on `navigator.connection` + the `video-cellular-warning-shown` localStorage flag, so it renders nothing on Safari / desktop / Wi-Fi / second-visit. "Audio-only" CTA writes to the same `localStorage["video-quality"]` key that `<VideoRoom>` reads at connect time (Decision §30); "I'll switch to Wi-Fi" intentionally does NOT set the one-time flag (the user is expected to physically switch and re-enter — if they don't, the warning fires again). Frontend tsc + eslint clean.

**Depends on:** [task-video-B8](./task-video-B8-video-quality-picker.md) (SOFT — uses picker current value for MB/min estimate) — **shipped.** Reads `isQualityOption` + `QualityOption` type from `<VideoQualityPicker>`; writes back to the same `video-quality` localStorage key.

**Source:** [T5 §T5.37](../../../../Product%20plans/video-consult/plan-t5-video-reliability-safety.md); [decision §30](../Plans/plan-video-consult-selected-features.md#before-sub-batch-e-starts).

---

## Audit + scope decision (2026-05-02)

Execution-time audit confirmed the spec and codebase are aligned on this one — no scope reshaping needed. Notes worth preserving:

1. **Pre-call surface is the join page, not `<VideoConsultPreCall>` directly.** The task spec lists `frontend/components/consultation/VideoConsultPreCall.tsx` as the integration point, but B1 (lobby chrome) moved branding + countdown ABOVE the A7 component. The actual pre-call viewport lives in `frontend/app/consult/join/page.tsx` (`step === "precall"` branch), which composes `<VideoConsultLobbyHeader>` + `<VideoConsultLobbyCountdown>` + `<VideoConsultPreCall>`. Mounting the modal at the page level (outside the centered column) lets the scrim cover all three pieces.
2. **B8 picker write target is `localStorage["video-quality"]` (verified).** `<VideoRoom>` reads this synchronously via `readPersistedVideoQuality()` at connect time so the bandwidth profile + `createLocalTracks` constraints honour the user's last choice without a reconnect. The "Audio-only" CTA writes to the SAME key — when the patient clicks Continue on the A7 form, `<VideoRoom>` will mount with `quality='audio-only'` and never publish a video track.
3. **Duration is hard-coded to 30 minutes.** No per-appointment duration is plumbed down to the lobby props yet. The 30-min figure matches the task spec's example copy; the component exposes a `durationMinutes` prop so it's a one-liner to swap in real duration when scheduling exposes it.
4. **Auto = 720p in the estimate.** `<VideoQualityPicker>` documents `'auto'` as Twilio's connect-time default which today resolves to 720p (`videoConstraintsForQuality('auto')` returns `null` → `width: 640, height: 480` per the comment, but the bandwidth profile caps to 720p-equivalent). The estimator treats `'auto'` as 720p (~6 MB/min) — slightly conservative vs reality but matches the `<VideoRoom>` comment chain.
5. **No frontend Jest infra in this repo.** The `data-estimate.ts` helpers (`classifyConnection`, `mbPerMinuteForQuality`, `estimatedMbForDuration`, `formatMbEstimate`) are pure and trivially testable, but there is no `jest.config.*` or `frontend/**/*.test.ts` file anywhere — matches the D.2 / D.3 / D.4 pattern. Verification limited to `tsc --noEmit` + `eslint`. When frontend test infra lands, the helpers are ready to import.

---

## Files actually touched (Phase 1, 2026-05-02)

**Frontend:**
- `frontend/lib/video/data-estimate.ts` — **NEW** (~165 LOC; pure cellular detection + MB/min estimator + formatter; SSR-safe; no DOM access beyond the narrow `navigator.connection` read).
- `frontend/components/consultation/CellularDataWarning.tsx` — **NEW** (~225 LOC; self-gating modal overlay; reads `video-quality` for the estimate; writes `audio-only` + the one-time flag on the appropriate CTAs).
- `frontend/app/consult/join/page.tsx` — edited (`+~10` lines: import + mount `<CellularDataWarning>` outside the centered pre-call column so the scrim covers the entire viewport).

**Backend / migrations / tests:** none. (Pure frontend feature; no API, no schema, no Jest infra in repo.)

---

## Verification (2026-05-02)

- ✅ Frontend `tsc --noEmit` — clean.
- ✅ Frontend `eslint lib/video/data-estimate.ts components/consultation/CellularDataWarning.tsx app/consult/join/page.tsx` — 0 errors, 0 warnings.
- ✅ ReadLints sweep on the three touched files — clean.

Manual smoke deferred to PR time (requires actual cellular Android device, an iPhone Safari, and a desktop Wi-Fi browser to walk through the matrix in [Manual smoke](#manual-smoke) below).

---

## Acceptance criteria

### Cellular detection

- [ ] **Capability check** at A7 pre-call mount:
  ```ts
  const conn = (navigator as any).connection;
  const isCellular = conn && (conn.type === 'cellular' || ['2g','3g','4g'].includes(conn.effectiveType));
  ```
- [ ] If `navigator.connection` unsupported (Safari): skip warning entirely (degradation acceptable; can't detect).

### `<CellularDataWarning>` component

- [ ] **New component** at `frontend/components/consultation/CellularDataWarning.tsx`:
  - Modal-like overlay shown on top of A7 pre-call screen.
  - Three buttons: "Wi-Fi (recommended)" / "Audio-only (saves data)" / "Continue on cellular".
  - "Wi-Fi (recommended)" button: dismisses modal but doesn't proceed; user clicks again when on Wi-Fi (manual choice).
  - "Audio-only" → sets B8 picker to `'audio-only'` + dismisses + proceeds to live room.
  - "Continue on cellular" → dismisses; persists "warning shown" flag; proceeds.

### MB/min estimate

- [ ] Pull current B8 quality (default 'auto' = 720p) and map:
  - 1080p → ~10 MB/min
  - 720p → ~6 MB/min
  - 480p → ~3 MB/min
  - audio-only → ~0.5 MB/min
- [ ] Display in modal: "This 30-min video consult will use ~XXX MB of data".
- [ ] Update copy when user changes B8 picker before clicking Continue.

### One-time gate

- [ ] **localStorage key:** `video-cellular-warning-shown` — boolean.
- [ ] If set to `true`, never show again (decision §30 — one-time).
- [ ] If user clicks "Audio-only" or "Continue on cellular", set the flag.
- [ ] If user clicks "Wi-Fi (recommended)" and dismisses without proceeding, do NOT set flag (they'll see it again).

### Manual smoke

- [ ] Open consult on cellular Android device first time → modal appears.
- [ ] Pick Audio-only → B8 picker set; live room joins audio-only.
- [ ] Open second time → no modal.
- [ ] Pick Continue on cellular → proceeds to live room.
- [ ] Same device on Wi-Fi → no modal even on first session (cellular detection failed).
- [ ] iPhone Safari (no `navigator.connection`) → no modal at all.

### `mode='readonly'`

- [ ] N/A; modal only shows pre-call.

### General

- [ ] Type-check + lint clean.
- [ ] No console errors.

---

## Out of scope

- **Real-time data-usage display during call.** Out of scope.
- **Auto-pause when data cap hit.** Out of scope; user owns their cellular plan.
- **Carrier-specific suggestions ("Try Jio's free plan").** Out of scope.

---

## Files expected to touch

**Frontend:**
- `frontend/components/consultation/CellularDataWarning.tsx` — **new** (~120 LOC).
- `frontend/components/consultation/VideoConsultPreCall.tsx` — **edit** (~20 LOC: detect + show modal).
- `frontend/lib/video/data-estimate.ts` — **new** (~30 LOC; small mapping helper).

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **Decision §30** — show MB/min estimate based on current B8 picker value; update on picker change.
2. **iOS degradation** — `navigator.connection` is unsupported on Safari; can't detect cellular reliably. Document gracefully (no modal). Patient can still pick audio-only via B8 picker.
3. **One-time vs per-session** — one-time per device (recommended). Per-session would be annoying.
4. **Wi-Fi vs cellular vs ethernet** — only show on cellular; ethernet + Wi-Fi suppressed.
5. **Battery context** — at very-low battery, F4 (battery-saver) may auto-trigger audio-only; coordinate so the two warnings don't fire simultaneously.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch E](../Plans/plan-video-consult-selected-features.md#sub-batch-e--reliability--safety-12-days)
- **Source item:** [T5 §T5.37](../../../../Product%20plans/video-consult/plan-t5-video-reliability-safety.md)
- **Decision:** [§30 — MB/min figure](../Plans/plan-video-consult-selected-features.md#before-sub-batch-e-starts)
- **Coupled:** [task-video-B8](./task-video-B8-video-quality-picker.md), [task-video-F4](./task-video-F4-battery-saver-downgrade.md)
- **W3C:** Network Information API

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** ✅ Shipped (2026-05-02) — Phase 1. Pre-call cellular-data warning live; one-time per device; routes through B8's `video-quality` localStorage key for the audio-only branch. First Sub-batch E item shipped.
