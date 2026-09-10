# Plan p5 — Copy coverage (batch)

> **Status:** 🟡 eng ✅ `lang-20`…`24` (2026-08-03). Founder IG English E2E + harness open. Next program phase: p6 (blocked on LANG6-D2).
> **Program:** [`../README.md`](../README.md) · Prefix `lang` · Tasks `lang-20`…`lang-24`
> **One-line intent:** p3 localized the strings that were already in `dm-copy.ts`. p5 finds the ~55 that never got there.

---

## Why this phase

p3's acceptance gate reads:

> *"Every `dm-copy` builder is localized or explicitly English-only with a stated reason."*

That was met, and it is true. The gap is the premise — it measures builders that exist. A full audit of every patient-facing DM string on 2026-08-02 found **~55 hardcoded English literals living directly in stage handlers and services**, which were never migrated into `dm-copy.ts` and so were never in scope for p3's sweep.

They are not edge cases. They are the middle of the funnel.

| Cluster | Examples | Where |
|---|---|---|
| Cancel / reschedule / status | `Cancel appointment on ${dateStr}? Reply **Yes** or **No**.` · `Your next appointment is on …` · `Please reply 1, 2, or ${n}.` | `cancel-reschedule-status.ts`, `action-executor-service.ts` |
| Consent / revocation | `Done. I've removed your personal information…` · `No problem. I haven't saved any…` | `consent-service.ts` (8 strings) |
| Booking links | `Pick your slot and complete payment here…` · `Join the queue for your visit here…` | `booking-link-copy.ts` (4 families, no `language` param) |
| Staff review | `Thanks — **${practice}** will confirm your visit type…` | `staff-service-review-dm.ts` |
| Funnel clarifiers | `Would you like to book one for yourself now?` · `Please reply Yes to use the existing record…` · `We found a record for **${name}**…` | `booking-funnel.ts`, `service-match.ts`, `booking-entry.ts` |
| Comment proactive DM | `You expressed interest in booking.` · `Check your DM for more information.` | `instagram-comment-webhook-handler.ts`, `facebook-comment-webhook-handler.ts`, `instagram-service.ts` |
| Acks and fallbacks | `Thanks for your message. We'll get back to you soon.` · `I see your messages — give me a moment to respond.` | `run-conversation-turn.ts:91`, `instagram-dm-webhook-handler.ts` |
| Pause gate | `DEFAULT_RECEPTIONIST_PAUSE_MESSAGE` | `control-gates.ts:60-61` — receives no `turnLanguage` at all |

### The failure this produces

A Hinglish patient gets Hinglish from the LLM turns and the safety and fee copy, then English the moment they touch booking, cancellation, or a confirmation. Mid-thread, mid-funnel, with no pattern the patient can perceive.

That is a language flip-flop — the exact failure the resolver's own header says the module exists to prevent:

```7:10:backend/src/utils/conversation-language.ts
 * LANG-D2 (no automatic snap-back): there is no "strong English" signal.
 * A non-English conversation never returns to English on its own. Patients
 * routinely drop English sentences mid-Hinglish thread; snapping back is the
 * flip-flop this module exists to stop.
```

p1 fixed the flip-flop in *detection*. The flip-flop in *emission* was never in scope for any phase.

### Deliberately not translation

p5 moves strings into locale-dispatched builders and ships **English in every arm**, exactly as LANG3-D4 already prescribes. Nothing a patient sees changes when p5 lands.

That is the point. The mechanism and the translation are separate reviews: a 55-string structural migration is reviewable by an engineer, and a translation set is reviewable by a Hindi speaker. Combined, neither reviewer can do their job. p6 fills the arms — for every family, at once, including the ones p3 left English.

---

## Decision lock

Inherit **LANG-D1…D9**, **LANG3-D1…D7**, **LANG4-D1…D6**. Phase-specific:

| ID | Decision | Rationale |
|----|----------|-----------|
| **LANG5-D1** | **No patient-visible change in p5.** Every arm ships English; `en` output is byte-identical before and after. | Makes the diff mechanically verifiable by snapshot. Any English text change is a separate, visible decision. |
| **LANG5-D2** | Every migrated string becomes a **`dm-copy.ts` builder** following LANG3-D1/D2 — typed input carrying `language`, colocated locale record. | One destination. A second copy module would recreate the problem the program exists to remove. |
| **LANG5-D3** | Strings that **interpolate PHI** (patient name, age, phone, MRN) are marked `phi: true` in a builder-level registry. | p6 needs to know which strings can never be sent to a translation service. Recording it during migration costs nothing; reconstructing it later means re-auditing 55 strings. |
| **LANG5-D4** | The **receptionist pause gate** receives `turnLanguage` like every other gate. A doctor's custom pause message is passed through **untranslated** in whatever language they wrote it. | Doctor-authored text is not ours to localize. The *default* is. |
| **LANG5-D5** | `FALLBACK_REPLY` and the throttle ack resolve language from the **stored column**, falling back to `en`. They fire on paths where no turn context exists. | These are the error-adjacent strings most likely to be the only thing a patient sees. |
| **LANG5-D6** | **Comment proactive DMs** resolve language from the linked conversation when one exists; otherwise **English**. Do **not** detect from comment text. | A public comment is a different register and often a different author than the DM thread. Detecting there would let a stranger's comment set a patient's thread language. |
| **LANG5-D7** | Duplicated strings are **collapsed into one builder**, not migrated twice. | `cancel-reschedule-status.ts:243` and `:287` already duplicate a helper that exists. Migrating the duplicate preserves a bug. |

---

## Scope guard

- **DO NOT** translate anything. English in all arms (LANG5-D1). Translation is `lang-26`/`lang-27`.
- **DO NOT** reword English copy while moving it. If a string reads badly, capture it — a copy edit inside a 55-string migration is invisible to review.
- **DO NOT** change routing, branch selection, or state transitions. This phase moves strings and threads a parameter. Nothing else.
- **DO NOT** touch versioned consent text or legal explainers (LANG3-D6/D7).
- **DO NOT** localize doctor-authored custom messages (LANG5-D4).
- **DO NOT** localize `COMMENT_PUBLIC_REPLY_TEXT` beyond LANG5-D6 — the public comment reply is seen by strangers, not just the patient.
- Marker lists, thresholds, and resolver logic are **p4**. Not here.

---

## Task list

| Task | Title | Size | Model |
|------|-------|------|-------|
| `lang-20` | Cancel / reschedule / status + action-executor (~20 strings) | L | **Opus** |
| `lang-21` | Consent, revocation, and the pause gate (~10 strings) | M | **Opus** |
| `lang-22` | Booking links, staff review, funnel clarifiers (~18 strings) | L | Sonnet |
| `lang-23` | Comment DMs, throttle ack, fallback, OOB stragglers (~10 strings) | M | Sonnet |
| `lang-24` | Close gate p5 | S | Composer / Founder |

`lang-20` and `lang-21` are **Opus**: the first spans stage handlers plus the action executor used by LLM tool calls, the second touches consent and revocation, which the agent contract names explicitly.

---

## Acceptance gate

- [ ] A repo-wide sweep finds no patient-facing English literal outside a locale-dispatched builder, or it is on a documented exception list with a reason.
- [ ] Every builder receives a language — `turnLanguage` in-turn, stored column out-of-band (LANG3-D3).
- [ ] `en` output byte-identical to pre-phase for every migrated string (LANG5-D1).
- [ ] PHI-interpolating builders marked in the registry (LANG5-D3).
- [ ] The pause gate, throttle ack, and `FALLBACK_REPLY` all resolve a language.
- [ ] Per-locale golden snapshots for every new builder (LANG3-D5).
- [ ] Typecheck + lint + tests green.

---

**Created:** 2026-08-02.
