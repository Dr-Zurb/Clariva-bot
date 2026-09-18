# Plan p3 — One LLM round trip per turn (batch)

> **Status:** 🔒 Blocked on `lat-06`. May be cancelled on p1 evidence.
> **Program:** [`../README.md`](../README.md) · Prefix `lat` · Tasks `lat-09`…`lat-11`
> **One-line intent:** After p1, the biggest remaining cost is that the receptionist thinks twice — classify, then compose — sequentially. Make it think once, or think in parallel.

---

## Why this phase

Every turn pays two serial OpenAI round trips: `classifyIntent` decides the branch, then `generateResponse` writes the reply. p1 makes the first one cheap, but *cheap is not free* — two sequential network hops to a model still cost two network hops.

This is the last big structural win and the only genuinely risky one, because intent does not merely precede the reply — it **routes** it. The stage router, the control gates, the fee logic, and the safety branches all read the classification before anything is composed. Collapsing the calls means either the model does routing and composition together, or the system commits to composing before it knows the branch.

Either way this is a change to how the receptionist decides things, not a tuning knob. Hence: a design spike **before** any implementation, and an explicit right to cancel.

**Not in this phase:** anything from p1 (waste removal) or p2 (perception). Streaming responses — a real option, but a different design with its own webhook/send implications.

---

## Decision lock

Inherit program **LAT-D1…D8**. Phase-specific:

| ID | Decision | Implication |
|----|----------|-------------|
| **LAT3-D1** | **`lat-09` is a spike with a written recommendation and the right to say "don't".** Implementation does not start until the spike is read and accepted. | This phase can lose money. A spike is cheap; an abandoned half-refactor of the turn pipeline is not. |
| **LAT3-D2** | Safety branches — emergency, `medical_query`, receptionist-paused — must keep a **deterministic, non-speculative** decision path. | These fire on the worst turns a patient can send. They may not depend on a merged model output being well-formed, or on a speculative call being right. |
| **LAT3-D3** | Any speculative/parallel approach must **discard** wrong-branch output silently. A discarded draft must never reach the patient, appear in `messages`, or enter the LLM history. | The failure mode of speculation is sending the wrong reply. That is unacceptable, so it must be structurally impossible rather than carefully avoided. |
| **LAT3-D4** | Correctness is measured as **branch parity** against the current pipeline on a recorded scenario corpus, not by eyeballing a few replies. | The router has many branches. Two or three manual tests will not find the one that regressed. |
| **LAT3-D5** | The reply model stays flagship, and the reply prompt's language directive is preserved verbatim (LANG-D6 / `lang-04`). | A merged prompt is the single easiest place to accidentally re-introduce "let the model pick the language", which three phases of `bot-language-policy` exist to prevent. |
| **LAT3-D6** | If the spike's projected saving is under ~1 s, **cancel the phase.** | Below that, the risk to routing correctness is not worth it. |

---

## Scope guard

- **DO NOT** implement anything before `lat-09` is accepted (LAT3-D1).
- **DO NOT** let a speculative draft reach the patient, the `messages` table, or the AI history (LAT3-D3).
- **DO NOT** make emergency / medical_query / paused depend on merged-model output (LAT3-D2).
- **DO NOT** change the reply model, the language directive, or `dm-copy` behavior (LAT-D1 / LAT3-D5).
- **DO NOT** weaken idempotency, locks, or throttles (LAT-D3).
- **DO NOT** double LLM spend to save latency without saying so explicitly — speculative execution can mean paying for two replies to use one.

---

## Task list

| Task | Title | Size | Model |
|------|-------|------|-------|
| `lat-09` | Design spike — merged call vs speculative parallel | M | **Opus** |
| `lat-10` | Implement the chosen approach | L | **Opus** |
| `lat-11` | Close gate p3 | S | Composer / Founder |

---

## Acceptance gate

- [ ] Job total **≤ 3.5 s** for a greeting turn (LAT-D5).
- [ ] Branch parity with the pre-change pipeline across the full scenario corpus — **zero** regressions on emergency, medical_query, fee, cancel, or consent branches.
- [ ] No speculative draft ever persisted or sent.
- [ ] Language behavior identical — `npm run test:dm-language` 4/4, stickiness intact.
- [ ] LLM cost per turn measured and accepted (or improved).
- [ ] Typecheck + lint + full backend suite green.

---

**Created:** 2026-08-02.
