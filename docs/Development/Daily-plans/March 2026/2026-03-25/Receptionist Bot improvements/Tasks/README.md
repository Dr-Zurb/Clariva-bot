# Receptionist bot hardening — task index

**Source plan:** [RECEPTIONIST_BOT_ENGINEERING.md](../../../Development/Daily-plans/March%202026/2026-03-25/Receptionist%20Bot%20improvements/RECEPTIONIST_BOT_ENGINEERING.md)

**Goal:** Market-ready reliability, observability, test coverage, and maintainable structure for the Instagram DM + comment webhook worker without changing product behavior unless noted.

**Recommended order**

| Order | Task | Dependency |
|-------|------|------------|
| 1 | [e-task-rbh-01](./e-task-rbh-01-webhook-observability.md) | — |
| 2 | [e-task-rbh-02](./e-task-rbh-02-webhook-characterization-tests.md) | — (parallel with 1) |
| 3 | [e-task-rbh-03](./e-task-rbh-03-merge-upcoming-appointments-helper.md) | 2 preferred |
| 4 | [e-task-rbh-04](./e-task-rbh-04-unify-dm-send-locks-fallback.md) | 2 preferred |
| 5 | [e-task-rbh-05](./e-task-rbh-05-split-webhook-worker-modules.md) | 3, 4 |
| 6 | [e-task-rbh-06](./e-task-rbh-06-migrate-legacy-slot-conversation-steps.md) | 2 |
| 7 | [e-task-rbh-07](./e-task-rbh-07-structured-prompt-kind-in-state.md) | 5 optional |
| 8 | [e-task-rbh-08](./e-task-rbh-08-instagram-webhook-signature-threat-model.md) | — |
| 9 | [e-task-rbh-09](./e-task-rbh-09-bot-pause-human-handoff.md) | product spec |
| 10 | [e-task-rbh-10](./e-task-rbh-10-dashboard-instagram-health.md) | — |
| 11 | [e-task-rbh-11](./e-task-rbh-11-message-edit-fallback-docs.md) | — |
| 12 | [e-task-rbh-12](./e-task-rbh-12-dm-latency-faster-replies.md) | 14 preferred (routing may cut wasted LLM) |
| 13 | [e-task-rbh-13](./e-task-rbh-13-fee-pricing-structured-path.md) | 14 preferred |
| 14 | [e-task-rbh-14](./e-task-rbh-14-context-aware-intent-routing.md) | pairs with 13 |
| 15 | [e-task-rbh-15](./e-task-rbh-15-multilingual-safety-messages-emergency.md) | — |
| 16 | [e-task-rbh-16](./e-task-rbh-16-utf8-deterministic-strings.md) | quick win; before 13 UX polish |
| 17 | [e-task-rbh-17](./e-task-rbh-17-receptionist-architecture-llm-vs-system-actions.md) ✅ | architecture: LLM understands, system executes facts (see `RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md`) |
| 18 | [e-task-rbh-18](./e-task-rbh-18-intent-schema-topics-and-pricing-signal.md) ✅ | 17; classifier `topics` / `is_fee_question` + keyword fallback |
| 19 | [e-task-rbh-19](./e-task-rbh-19-hybrid-reply-composer-server-blocks-plus-ai.md) ✅ | 18 + 13; fee/link blocks + optional AI bridge (`dm-reply-composer` + `appendOptionalDmReplyBridge`) |
| 20 | [e-task-rbh-20](./e-task-rbh-20-routing-observability-and-golden-transcripts.md) ✅ | `instagram_dm_routing` + golden fixtures (`DmHandlerBranch`) |

**Suggested product-quality order (post-RBH-11):** **16** (mojibake) → **15** (safety language) → **14** + **13** (routing + fees) → **12** (latency).

**Suggested “AI receptionist” hardening order (post-RBH-16):** **17** (doc + clarify layers) → **18** (classifier `topics` / `is_fee_question`) → **19** (hybrid composer for mid-flow pricing) → **20** (branch logging + goldens).

**Related day plan (bot intelligence):** [2026-03-25 README](../../../Development/Daily-plans/March%202026/2026-03-25/README.md) — e-task-1…e-task-6 overlap with RBH-07 / AI alignment where relevant.

---

**Last updated:** 2026-03-28 (RBH-20 done — DM routing logs + transcript goldens)
