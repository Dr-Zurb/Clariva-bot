# Plan p2 — Facebook Page comments (batch)

> **Status:** 🟡 Code done (2026-07-26). Founder: migration 188 + Meta `feed` + reconnect + smoke.  
> **Program:** [`../README.md`](../README.md) · Prefix `fbm` · Tasks `fbm-09`…`fbm-11`  
> **One-line intent:** High-intent comments on the connected Facebook Page create leads and get a public reply / Messenger follow-up, mirroring Instagram comment flow.

---

## Why this phase

Instagram already has comment → lead (+ DM). Page comments are the Facebook equivalent for clinics that post on their Page. Depends on Page token + webhook subscription from p1.

---

## Decision lock

Inherit **FBM-D\***. Phase-specific:

| ID | Decision | Implication |
|----|----------|-------------|
| **FBM2-D1** | Reuse / extend `comment_leads` (or sibling) with `platform = 'facebook'` — prefer extend existing table if columns allow; else additive columns. | Avoid a second lead silo if possible; Opus if schema widen. |
| **FBM2-D2** | Subscribe Page webhook field `feed` / `mention` / comment-related fields per current Meta Page webhook docs at implement time. | Confirm exact field names in `fbm-09`. |
| **FBM2-D3** | Public reply copy follows IG comment tone; proactive Messenger open when policy allows. | No new AI funnel. |

---

## Scope guard

- **DO NOT** start until p1 Messenger DMs green (`fbm-08`).
- **DO NOT** rebuild IG comment handler — extract shared pieces only if cheap.
- PHI: no comment body in logs (COMPLIANCE).

---

## Task list

| Task | Title | Size | Model |
|------|-------|------|-------|
| `fbm-09` | Page comment webhook → resolve Page → lead row | M | Sonnet / **Opus** if schema |
| `fbm-10` | Public reply + Messenger follow-up (mirror IG) | M | Sonnet |
| `fbm-11` | Close gate p2 | S | Composer |

---

## Acceptance gate

- [x] Comment on connected Page post → webhook processed → lead stored (no PHI in logs). *(code; smoke pending)*
- [x] Public reply and/or Messenger nudge behaves per FBM2-D3. *(code; smoke pending)*
- [x] Pause receptionist setting (if shared) respected or FB-specific pause documented. *(shared `instagram_receptionist_paused`)*
- [ ] Tests + manual smoke green. *(unit tests green; manual pending)*

---

**Created:** 2026-07-26.
