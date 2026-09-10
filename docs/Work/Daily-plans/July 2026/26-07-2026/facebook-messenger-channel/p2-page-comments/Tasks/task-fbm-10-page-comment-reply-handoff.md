# Task fbm-10: Public reply + Messenger follow-up (mirror IG)

> **Links:** batch [`../plan-p2-facebook-page-comments-batch.md`](../plan-p2-facebook-page-comments-batch.md) · exec [`./EXECUTION-ORDER-p2-facebook-page-comments.md`](./EXECUTION-ORDER-p2-facebook-page-comments.md)

---

## 📋 Task Overview

After lead capture: public reply on the comment (fixed/templated copy) and optional Messenger message when policy allows — mirror Instagram comment handler behavior, not a new AI funnel.

**Program / Phase:** facebook-messenger-channel · p2 · Wave 2  
**Status:** ✅ DONE (2026-07-26)  
**Model:** Sonnet  
**Depends on:** `fbm-09`

---

## ✅ Task Breakdown

- [x] 1.1 Public reply via Page token (`POST /{comment-id}/comments`).
- [x] 1.2 Proactive Messenger open / CTA when Meta allows for that commenter.
- [x] 1.3 Respect shared receptionist pause (`instagram_receptionist_paused`).
- [x] 1.4 Failures audited without dropping the whole webhook pipeline.

---

## ✅ Acceptance Criteria

- [x] High-intent path mirrors IG (lead + reply + DM when token present).
- [x] Failures audited without dropping the whole webhook pipeline.

---

**Created:** 2026-07-26.  
**Closed:** 2026-07-26.
