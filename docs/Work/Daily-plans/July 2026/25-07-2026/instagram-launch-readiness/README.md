# Instagram launch-readiness

> Make the **one live acquisition channel** (Instagram DM + comments) bulletproof and polish the shared receptionist bot before launch. WhatsApp is **out of scope** (post-sales — integrations Decision I8).

**Parent roadmap:** [`../../../Product plans/integrations/plan-00-integrations-roadmap.md`](../../../Product%20plans/integrations/plan-00-integrations-roadmap.md)  
**Audit source:** 2026-07-25 conversation-quality + P0 Meta infra audit (this chat).  
**Task prefix:** `ilr` (continuous across phases).

---

## Execute in order

| Phase | Folder | Theme | Status |
|-------|--------|-------|--------|
| **p1** | [`p1-launch-critical/`](./p1-launch-critical/) | Data deletion, consent-persist fix, token lifecycle, Meta App Review ops | 🟡 In progress — `ilr-02` ✅ `ilr-03` ✅ `ilr-04` ✅ · `ilr-01` ops (ongoing) · `ilr-05` close-gate ready |
| **p2** | [`p2-bot-reliability/`](./p2-bot-reliability/) | Throttle desync, non-text mid-funnel, staff-review stall, webhook signature | 📋 Scaffolded — after p1 |
| **p3** | [`p3-bot-polish/`](./p3-bot-polish/) | Funnel dead-ends, fallbacks, brand/copy, returning memory, comment→conversation link | 📋 Scaffolded — after p2 |
| **p4** | [`p4-direct-instagram-login/`](./p4-direct-instagram-login/) | Direct Instagram Login connect (no Facebook Page) + IG token refresh | 📋 Scaffolded — can parallel ops with p1; code after decision lock |

---

## Decision lock (program-level)

| ID | Decision |
|----|----------|
| **ILR-D1** | Pre-launch work is Instagram-only. No WhatsApp task files in this program. |
| **ILR-D2** | Shared bot engine polish benefits future WhatsApp for free — polish here, don't fork. |
| **ILR-D3** | Launch-blockers (p1) ship before reliability (p2) before polish (p3). |
| **ILR-D4** | PHI / consent / deletion / migration-adjacent tasks run on **Opus**; decision lock confirmed before Wave 1 of each phase. |
| **ILR-D5** | Meta App Review + business verification is an **ops track** started immediately (parallel to p1 code). |
| **ILR-D6** | Direct Instagram Login (no Facebook Page) is a **pre-launch onboarding win** — clean OAuth swap + IG token refresh; generalized 3-social connections table deferred. |

---

## Task index

| Task | Phase | Title |
|------|-------|-------|
| ilr-01 | p1 | Meta App Review + business verification (ops checklist) |
| ilr-02 | p1 | Real Meta data-deletion callback + worker |
| ilr-03 | p1 | Consent-persist failure must not send booking link |
| ilr-04 | p1 | Token lifecycle: health sweep + reconnect alerts |
| ilr-05 | p1 | Close gate p1 |
| ilr-06 | p2 | Throttle skip: don't persist unsent reply |
| ilr-07 | p2 | Non-text mid-funnel: always ack |
| ilr-08 | p2 | Staff service-review stall: SLA / escalation |
| ilr-09 | p2 | Webhook signature: remove or gate DM/comment bypass |
| ilr-10 | p2 | Close gate p2 |
| ilr-11 | p3 | Reschedule slot follow-up handler |
| ilr-12 | p3 | Match-unclear re-prompt + fallbacks + no_doctor_token reply |
| ilr-13 | p3 | Brand / localization / slot-link copy |
| ilr-14 | p3 | Fee↔book intent + returning-patient memory flag |
| ilr-15 | p3 | Comment lead → conversation link (+ doctor_id scope) |
| ilr-16 | p3 | Close gate p3 |
| ilr-17 | p4 | Meta App: Instagram Login product + App Review (ops) |
| ilr-18 | p4 | OAuth swap: Instagram Login connect (code) |
| ilr-19 | p4 | IG long-lived token refresh in health sweep |
| ilr-20 | p4 | Settings UI copy: drop Facebook Page dead-ends |
| ilr-21 | p4 | Close gate p4 |

---

**Created:** 2026-07-25.  
**Status:** Scaffolded — do not start p1 Wave 1 until `ILR-D*` confirmed and open questions in each batch plan answered.
