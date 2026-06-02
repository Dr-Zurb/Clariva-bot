# Deferred: Instagram DM — interim “please wait” message

**Status:** ⏸️ **DEFERRED** (decide later)

**Context:** When webhook processing is slow (LLM intent, DB, Instagram `igSendMs`), we discussed sending a **first** short DM (“Please wait while we process…”) and then the **real** reply, to improve perceived latency.

**Defer reason:** Product/UX tradeoffs (two bubbles, throttle/locks, dedupe) need a deliberate pass; not blocking current work.

**Resume when:** You want to invest in perceived-latency UX for IG DMs and are ready to validate against Meta send limits and `sendInstagramDmWithLocksAndFallback` behavior.

---

## When you pick this up

1. **Trigger:** Optional time threshold (e.g. more than 2–3 seconds before reply) or path-based (heavy branches only); avoid sending on every message.
2. **Copy:** Neutral, no PHI, no medical claims before the real reply (especially on emergency/safety paths).
3. **Implementation:** Early in the Instagram DM worker path: first Graph send → existing pipeline → second Graph send. Confirm **throttle** / **conversation lock** allow two sends in one job; align with **webhook idempotency** so duplicate events don’t double “please wait.”
4. **Cost:** Extra Graph round-trip per use (~adds `igSendMs`-class latency for the first bubble).

---

## Related discussion

- Pipeline timing: `webhook_instagram_dm_pipeline_timing` (`intentMs`, `handlerPreSendMs`, `igSendMs`) in `instagram-dm-webhook-handler` / webhook metrics.

---

**Last updated:** 2026-04-14
