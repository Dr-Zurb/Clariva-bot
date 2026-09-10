# Bot testing — category stress packs

**Purpose:** Stress-test the receptionist bot **category by category**, with realistic patient wording (messy spelling, Hinglish, family-third-person, short bursts).

**Parent checklist:** [MANUAL_QA_CHECKLIST_DM_BOT.md](../MANUAL_QA_CHECKLIST_DM_BOT.md) — main categories, Pass/Fail, auto vs manual. These packs expand one category into many inputs.

| Pack | Category (checklist §) | File |
|------|------------------------|------|
| 01 | Control gates / emergency & safety (§1) | [01-emergency-and-safety.md](./01-emergency-and-safety.md) |
| 02 | Language (§2) | [02-language.md](./02-language.md) — corpus + 2026-08-02 reproduction; log `dm_language_decision` |
| 03 | Fees / reason-first (§3) | *(todo)* |
| 04 | Booking funnel (§4) | *(todo)* |
| 05 | Returning patient (§5) | *(todo)* |
| 06 | Book for someone else (§6) | *(todo)* |
| 07 | Service match / staff (§7) | *(todo)* |
| 08 | Cancel / reschedule / status (§8) | *(todo)* |
| 09 | Non-text (§9) | *(todo)* |
| 10 | Comments (§10) | *(todo)* |
| 11 | Out-of-band (§11) | *(todo)* |
| 12 | Reliability / abuse (§12) | *(todo)* |

**How to run a pack**

1. Backend up; webhook worker up; IG connected.
2. Run automated pre-check from the main checklist (§0.1) first.
3. Work the pack top-down. For each row: send the input, tick Pass/Fail, note `branch` from logs (`instagram_dm_routing`).
4. Log defects in the main checklist §15 (or attach this pack’s notes).

**PHI:** use aliases. Never paste real patient names or phones into tickets.

**Language decisions (lang-18):** every DM turn emits `dm_language_decision_total` (`alertMarker: dm_language_decision`). During a language smoke, confirm `resolved` / `reason` / marker counts — never expect message text in the log. Useful checks: fresh Hinglish opener → `resolved=hi-Latn` + `changed=true`; plain English opener → `resolved=en` + `changed=false` (LANG4-D1 undecided); crisis follow-up on a Hinglish thread → stays non-`en`.
