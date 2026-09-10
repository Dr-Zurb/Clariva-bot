# Task lat-06: Close gate p1

> **Links:** batch [`../plan-p1-quick-wins-batch.md`](../plan-p1-quick-wins-batch.md) · exec [`./EXECUTION-ORDER-p1-quick-wins.md`](./EXECUTION-ORDER-p1-quick-wins.md)

---

## 📋 Task Overview

Confirm the waste is gone, confirm nothing about the reply changed, and decide — with numbers rather than enthusiasm — whether p2 and p3 are still worth their risk.

**Program / Phase:** dm-reply-latency · p1 · Wave 4
**Status:** ⏳ Not started
**Model:** Composer / Founder

---

## ✅ Checklist

### Numbers (vs `BASELINE-p1.md`)
- [ ] Job total for a greeting turn **≤ 5 s** (baseline 10.6 s).
- [ ] `intentMs` p50 **≤ 700 ms** (baseline 2070 ms).
- [ ] `igSendMs` p50 **≤ 1.1 s** (baseline 1924 ms).
- [ ] `otherPreSendMs` **≤ 1.2 s** (baseline ~2241 ms).
- [ ] `generateMs` unchanged or better — it must **not** regress, since nothing in p1 should have touched it.

### Nothing else moved
- [ ] `npm run test:dm-language` passes 4/4, same languages, same behavior.
- [ ] Intent fixture labels still match the flagship reference (`lat-02` §4).
- [ ] No `Page token invalid for graph.facebook.com` on a normal send.
- [ ] Locks, idempotency, throttles, and retry/backoff untouched — confirm by diff, not by memory (LAT-D3).
- [ ] No migration in the phase diff.
- [ ] Typecheck + lint + backend suite green (allowing the known pre-existing `@react-pdf/renderer` ESM failures).

### Live sanity
- [ ] One real Instagram DM: reply arrives and *feels* faster. Subjective, but this is the actual product claim.
- [ ] One Hinglish thread: still Hinglish, still correct branch.
- [ ] One emergency phrase: safety copy still fires, still correct language, still first.

### Re-decide p2 and p3
- [ ] With the new number in hand, is a typing indicator (p2) still worth it? At ~4 s it is a genuine polish item; at ~2 s it may be noise.
- [ ] Is collapsing the two LLM calls (p3) still worth its risk? Compare the remaining `generateMs + intentMs` against the effort and the blast radius.
- [ ] Record the decision in the program README status line. **Deferring p2 or p3 on the evidence is a valid outcome** — that is why they were gated.

### Close-out
- [ ] Update `BASELINE-p1.md` with the after-column.
- [ ] Mark p1 in the program README table.
- [ ] Note any deferred follow-ups (e.g. sibling Graph call sites from `lat-03` §3, adaptive history from `lat-05` §3.3) in `docs/Work/capture/inbox.md`.
- [ ] Cross off the rows this phase closes in [`RBH-12`](../../../../../March%202026/2026-03-25/Receptionist%20Bot%20improvements/Tasks/e-task-rbh-12-dm-latency-faster-replies.md) (§2.3 history tuning; §1.2 baseline doc) so the older task stops looking open.

---

**Created:** 2026-08-02.
