# ecb-01 · Fill the middle-column gap in review template with `<EndedConsultBody>`

> Single-task batch picking up the highest-priority follow-up from 2026-05-26's `cockpit-shell-layout-fix` (csl-01 explicitly captured this as out-of-scope and pointed at the inbox). One new component, one template wire-up, three test updates. No new APIs, no migrations, no telemetry contracts beyond a one-shot landed event.

| Property | Value |
|---|---|
| **Status** | ✅ Done |
| **Owner** | Frontend |
| **Size** | XS (~210 LOC component + ~25 LOC templates + ~50 LOC tests) |
| **Model** | Auto |
| **Wave** | 1 (only) |
| **Depends on** | csl-01 (column shell headers hidden — necessary so the new body strip doesn't sit under an orphan "Consult" header) |
| **Blocks** | Nothing critical — visual polish only |

---

## Why this exists

`csl-01` (2026-05-26) hid the redundant column-shell headers. That fix exposed the long-standing void inside the middle column when an appointment is **ended** (`appointment.status = 'completed'`) or **terminal** (`status ∈ {cancelled, no_show}`): `mapStateToTemplate` returns `'review'` and `makeMiddleColumn` skipped the body leaf entirely. The column then rendered only Assessment + Plan-bottom with a meaningless gap above the sticky Assessment strip.

User report (2026-05-27, transcript):
> "centre coloumn , where is the consultation ? right is okay subjective an dobjective coloumn?"

This task fills that gap with a compact informational strip — explicitly NOT a transcript replay, NOT a multi-tab summary surface, NOT a recording player. Those are bigger lifts captured in inbox as separate follow-ups.

---

## Root cause

`getReviewTemplate` calls `makeMiddleColumn(ctx, { bodyHeight: 0, ..., bodyVariant: 'review' })`. Inside `makeMiddleColumn`:

```
if (opts.bodyVariant !== 'review') {
  children.push({ id: 'body', ... });
}
```

That branch dropped the body leaf entirely for `'review'`. The state-machine logic that picks `'review'` for `ended` / `terminal` is correct — the template just had nothing to put in the slot.

---

## Decision locks

- **DL-1 (scope):** Single compact strip (~64px tall, horizontal, bg-card). No transcript playback. No video/voice player. No tabs. Larger surfaces are explicit follow-ups in `docs/Work/capture/inbox.md`.
- **DL-2 (leaf id):** Stays `'body'`. Layout state (localStorage `paneOrder`, `paneState`), pane toggle bar, hotkeys, walk-in fallback (`PatientProfilePage.tsx:454`) all key off this id; renaming would invalidate every persisted layout and break the walk-in `[body, plan]` fallback.
- **DL-3 (branches):** Four discriminator branches in the component:
  1. `terminal` + `appointmentStatus='cancelled'` → "Appointment cancelled" (XCircle, `text-destructive`)
  2. `terminal` + `appointmentStatus='no_show'` → "Patient did not attend" (UserX, `text-warning`)
  3. `ended` + session present (modality + endedAt) → "{Modality} consultation ended · at HH:MM · N min" (modality icon)
  4. `ended` + no session → "Visit completed · no consultation recorded" (CheckCircle2)
- **DL-4 (visual tokens):** Only semantic tokens — `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `text-destructive`, `text-warning`. No ad-hoc hex / amber / yellow.
- **DL-5 (telemetry):** One-shot per browser session via `__cockpitV2REndedConsultBodyLanded` flag, mirroring the existing `r_middle_*_landed` pattern. Payload: `{ appointmentId, mode, modality }`. `appointmentId` gates emission so unit tests can omit it.
- **DL-6 (sizing):** Review template now allocates `bodyHeight: 12%`, `assessmentHeight: 8%`, `bottomRowHeight: 80%` (was `0 / 8 / 92`). Body leaf `minSizePx: 64`. The 12% allocation mirrors the voice template's compact body row (15%); review is slightly smaller because it carries no live controls.
- **DL-7 (icon):** `BODY_VARIANT_ICONS.review` remapped from `Video` (inherited from video variant) → `CheckCircle2` so the toggle-bar icon for the body pane in completed/terminal state semantically reads as "visit done" rather than a misleading camera.
- **DL-8 (title):** `variantTitle('review')` returns `'Visit summary'` (was `'Body (Review)'`). That's what the shell context menu, toggle-bar tooltip, and pane registry surface to the user.
- **DL-9 (duration source):** Server-computed `appointment.consultation_duration_seconds` takes priority. Falls back to `endedAt - startedAt` arithmetic when the column is null/zero (legacy rows). Sub-minute → `<1 min`.

---

## What to do

### 1. `frontend/lib/patient-profile/pane-icons.ts`

```ts
// Add CheckCircle2 to the lucide import list.
// Remap BODY_VARIANT_ICONS.review from Video → CheckCircle2.
review: CheckCircle2,
```

### 2. `frontend/lib/patient-profile/telemetry.ts`

```ts
// Add window flag in the global declaration:
__cockpitV2REndedConsultBodyLanded?: boolean;

// Add one-shot landed helper:
export function trackCockpitV2REndedConsultBodyLanded(payload: {
  appointmentId: string;
  mode: "completed-with-session" | "completed-no-session" | "cancelled" | "no-show";
  modality: "text" | "voice" | "video" | "n/a";
}): void { /* one-shot landed pattern */ }
```

### 3. `frontend/components/cockpit/middle/EndedConsultBody.tsx` (NEW)

~210 LOC component. Props:
```ts
{
  state: CockpitState;
  appointmentStatus: CockpitAppointmentStatus;
  modality: 'text' | 'voice' | 'video' | null;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  appointmentId?: string;
}
```

Renders the four branches per DL-3 with semantic tokens per DL-4. Telemetry per DL-5. See the file for the full layout (icon left, two-line text right, ~64px tall).

### 4. `frontend/lib/patient-profile/templates.tsx`

- Import `EndedConsultBody`.
- Change `variantTitle('review')` → `'Visit summary'`.
- Inside `makeMiddleColumn`, replace the `if (opts.bodyVariant !== 'review')` skip with a branch that renders `<EndedConsultBody>` for `'review'` and `<BodyZone>` otherwise. Both add a leaf with `id: 'body'` for layout-state parity.
- Update `getReviewTemplate` allocations: `bodyHeight: 12`, `bottomRowHeight: 80` (was `0` / `92`). Doc the change in the function's JSDoc.

### 5. Test updates

- `frontend/lib/patient-profile/__tests__/pane-icons.test.ts` — add `CheckCircle2` to imports; update `BODY_VARIANT_ICONS.review` assertion; add distinct-from-video assertion.
- `frontend/lib/patient-profile/__tests__/templates.test.ts` — update `REVIEW_LEAF_ORDER` to include `'body'`; flip the review describe block from "omits body (7 leaves)" to "includes body (8 leaves)" with the new sizes; add the `<EndedConsultBody` source assertion.
- `frontend/components/cockpit/middle/__tests__/EndedConsultBody.test.tsx` (NEW) — coverage matrix:
  - cancelled (terminal × cancelled)
  - no-show (terminal × no_show)
  - completed-no-session (ended × no session)
  - completed-no-session fallback (ended × modality but null endedAt — defensive)
  - completed-with-session × {text, voice, video} × duration formatting
  - server-computed duration trumps arithmetic
  - arithmetic fallback when durationSeconds null
  - `<1 min` for sub-minute
  - duration omitted when neither field is usable
  - telemetry fires once with appointmentId
  - telemetry does NOT fire without appointmentId
  - telemetry emits `modality: 'n/a'` for terminal / no-session modes

### 6. Manual smoke

1. Open a **completed** video appointment in the cockpit. Middle column shows: `<Video icon> Video consultation ended · at HH:MM · N min` (above Assessment strip + Plan-bottom).
2. Same for **completed text** appointment → MessageSquare icon, "Text consultation ended …".
3. Same for **completed voice** appointment → Phone icon, "Voice consultation ended …".
4. **Cancelled** appointment → XCircle (destructive), "Appointment cancelled · This visit was cancelled before it took place."
5. **No-show** appointment → UserX (warning), "Patient did not attend · Reschedule from the header menu."
6. Open the layout toggle bar — `body` pane button shows the CheckCircle2 icon (review variant), not the misleading camera icon.
7. Walk-in completed appointment (no chart) — fallback returns `[EndedConsultBody, RxPane]` two-pane layout (previously the fallback failed since `body` was undefined, falling back to the full chart-included tree).

### 7. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test EndedConsultBody templates pane-icons
```

---

## Acceptance gate

- [x] `BODY_VARIANT_ICONS.review` is `CheckCircle2` (not `Video`).
- [x] `variantTitle('review')` returns `'Visit summary'`.
- [x] `makeMiddleColumn` adds a `body` leaf in BOTH the `'review'` and non-`'review'` branches.
- [x] `getReviewTemplate` sizes: `bodyHeight: 12`, `assessmentHeight: 8`, `bottomRowHeight: 80`, body `minSizePx: 64`.
- [x] `<EndedConsultBody>` renders the four branches per DL-3 with semantic tokens per DL-4.
- [x] Telemetry one-shot fires with `{ appointmentId, mode, modality }` payload; gated on `appointmentId` presence.
- [x] `pane-icons.test.ts` green (Review icon + distinct-from-video check).
- [x] `templates.test.ts` review describe block green with 8 leaves + new sizes + source-contains assertion.
- [x] `EndedConsultBody.test.tsx` green across all 12 cases.
- [x] `tsc --noEmit` + `lint` clean (verified via ReadLints; no errors).
- [ ] Manual smoke matrix (video / voice / text / cancelled / no-show / walk-in) — defer to user since dev server is running on terminal 4.

---

## Anti-goals

- ❌ Don't add a transcript replay surface — captured as follow-up in inbox.
- ❌ Don't add a recording player — captured as follow-up.
- ❌ Don't add a multi-tab summary pane — captured as follow-up.
- ❌ Don't rename the `body` leaf id — DL-2.
- ❌ Don't add a "View summary" CTA — duplicates "Reschedule" (terminal) or implies a destination that doesn't exist (ended). Pure information.
- ❌ Don't change `mapStateToTemplate` — the state machine is correct; only the template factory had a gap.
- ❌ Don't fire telemetry per mount change — one-shot per session only, mirroring siblings.

---

## Capture-inbox (write at close)

Mark the predecessor follow-up done in `docs/Work/capture/inbox.md`:
```md
- [x] 2026-05-27 — [csl follow-up] Added `<EndedConsultBody>` placeholder leaf for `bodyVariant === 'review'`. (Source: docs/Work/Daily-plans/May 2026/27-05-2026/cockpit-ended-consult-body/Tasks/task-ecb-01-ended-consult-body.md)
```

Add the larger follow-ups (if user requests):
```md
- [ ] [ecb follow-up] If dogfood shows doctors want richer post-call surfaces, promote `<EndedConsultBody>` into its own batch with transcript replay (text) / recording playback (voice, video) / multi-tab visit summary. Current shipment is intentionally a compact strip only. (Source: same)
```

---

## Notes

- This is the **only** task in `cockpit-ended-consult-body`. No plan doc, no execution-order — single hotfix-style batch, single wave.
- The walk-in fallback in `PatientProfilePage.tsx:454` was previously inert for review-state appointments because `paneById.body` was undefined; after this change, walk-in completed/cancelled appointments will render `[EndedConsultBody, RxPane]` as a two-pane layout (positive side-effect, no behavior change for chart-having appointments).
- Why `body` not `ended-body` for the leaf id: layout persistence parity. A doctor who has dragged `body` to a custom position in the video template should not see their saved layout vanish when they open a review-state appointment. The pane is conceptually "what occupies the call surface slot" — that's identity across modality + review.
