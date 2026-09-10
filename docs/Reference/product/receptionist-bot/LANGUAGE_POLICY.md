# Receptionist bot — language policy

Authoritative program decisions live in
[`docs/Work/Daily-plans/August 2026/02-08-2026/bot-language-policy/README.md`](../../Work/Daily-plans/August%202026/02-08-2026/bot-language-policy/README.md).
This page is the product-facing summary for QA and operators.

---

## One decision per conversation

1. **Resolve once** via `conversation-language.ts` (markers + optional classifier ratchet).
2. **Persist** on `conversations.language` (`NULL` = undecided).
3. **Every emitter reads** that value — in-turn (`turnLanguage`) or OOB (`getConversationLanguage`). No emitter re-detects from message text.
4. **The LLM never chooses** — it receives an explicit LANGUAGE directive derived from the resolved language.

## Defaults and stickiness

| Rule | Behaviour |
|------|-----------|
| LANG-D1 / LANG4-D1 | No signal → render English; **do not** persist `'en'` (column stays `NULL`) |
| LANG-D2 | Once non-English is stored, no automatic snap-back |
| LANG-D3 / LANG4-D3 | Roman Indic needs ≥2 strong markers (or accumulation / crisis bar) |
| LANG4-D4 | Classifier may move **off** English on undecided only; never toward `en`. Markers win. **Amend (2026-08-03):** confident English evidence vetoes adoption on marker `none` (keeps fill-in for genuine Hinglish wordlist misses). **Amend (2026-08-04):** one evidence word is enough (the veto only runs when the Indic wordlist found nothing, and a false adopt is sticky under LANG-D2 while a false veto is recoverable next turn); and a **native-script guard** downgrades a classifier `hi`/`pa` label to the Latin variant when the message contains no Devanagari/Gurmukhi. |
| LANG-D7 | Other scripts detected/stored but deterministic copy still English |
| LANG-D8 | No per-doctor default language in v1 |

## Copy arms (p6)

- Booking funnel, cancel/status, notifications, and comment DMs ship **Roman Hindi / Roman Punjabi** when the thread language is `hi` / `hi-Latn` / `pa` / `pa-Latn`.
- **Deliberate English** (`enByPolicy`): legal/versioned recording consent + account deletion (LANG6-D4); public comment reply; doctor/practice name fallbacks (LANG3-D6); modality labels patients say in English (LANG6-D6).
- Build-time translations only (LANG6-D2-B). Review workflow: [`backend/locale-arms/REVIEW_WORKFLOW.md`](../../../backend/locale-arms/REVIEW_WORKFLOW.md).

## Testing

| Surface | Link |
|---------|------|
| Stress pack | [`bot-testing/02-language.md`](./bot-testing/02-language.md) |
| Manual QA §2 | [`bot-testing/MANUAL_QA_CHECKLIST_DM_BOT.md`](./bot-testing/MANUAL_QA_CHECKLIST_DM_BOT.md) |
| Local harness | `npm run test:dm-language` / `npm run test:dm-conversation` |

---

**Created:** 2026-08-03 (lang-28) — replaces the language section of the deleted `RECEPTIONIST_BOT_CONVERSATION_RULES.md`.
