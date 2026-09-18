# p6 translation input — families awaiting human-reviewed arms

> Produced by **lang-24** (p5 close gate). p6 (`lang-25`…`28`) translates these; until then every arm ships English (LANG3-D4 / LANG5-D1).

**Exception list (never translate):** [`DM_COPY_ENGLISH_ONLY_EXCEPTIONS`](../../../../../../backend/src/utils/dm-copy.ts) — no-doctor fallback, public comment reply, LANG3-D7 recording/account-deletion.

---

## Count

| Bucket | Approx. families |
|--------|------------------|
| p3 `dm-copy` (`enAllLocales`) | ~35 |
| p5 lang-20…23 new builders + booking-link + staff-review | ~40 |
| Sibling locale tables (status-empty, consent-unclear, safety, fees, triage, clarification) | ~15 |
| **Total awaiting translation** | **~90** |

Exact builder names are the keys of `DM_COPY_PHI_REGISTRY` plus sibling modules below.

---

## Modules

### `backend/src/utils/dm-copy.ts`
All exported `build*` / payment / intake / consent / cancel / status / staff-review-resolved / prescription / refund / lang-20…23 families. PHI flags: `DM_COPY_PHI_REGISTRY`.

### Sibling locale tables (already take `language`)
- `booking-link-copy.ts` — 4 families (queue/slot)
- `staff-service-review-dm.ts` — awaiting / still-pending / SLA timeout / resolved wrapper
- `safety-messages.ts`
- `reason-first-triage.ts`
- `consultation-fees.ts`
- `complaint-clarification.ts`
- `dm-appointment-status.ts` — no-upcoming
- `booking-consent-context.ts` — consent-unclear
- `post-medical-ack-copy.ts`
- `dm-reply-composer.ts` — mid-collection continue + welcome-back (delegates)

### Explicitly out of p5 (deferred — not in this translation batch unless p6 expands)
- Prescription delivery one-liners still inline in `notification-service` (partial overlap with `buildPrescriptionReady*`)
- OPD mode-conversion patient templates
- In-consult chat banners / OTP SMS / web-push
- Booking-page `ValidationError` strings (non-DM API surface)

---

## Expected live behaviour until p6

A Hinglish thread still receives **English booking mechanics** (slot links, cancel prompts, consent defaults). That is intentional for p5 — structural coverage only.

---

**Created:** 2026-08-03 (lang-24).
