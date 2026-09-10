# Task lat-11: Close gate p3

> **Links:** batch [`../plan-p3-single-llm-turn-batch.md`](../plan-p3-single-llm-turn-batch.md) · exec [`./EXECUTION-ORDER-p3-single-llm-turn.md`](./EXECUTION-ORDER-p3-single-llm-turn.md)

---

## 📋 Task Overview

Turn the flag on, prove the receptionist still routes correctly, and close the program.

**Program / Phase:** dm-reply-latency · p3 · Wave 3
**Status:** 🔒 Blocked on `lat-10`
**Model:** Composer / Founder

---

## ✅ Checklist

### Parity (the real gate)
- [ ] Re-run `parity-lat-10.ts` on the full corpus. **Zero** branch regressions on emergency, medical_query, fee, cancel, consent.
- [ ] Advisory-field drift reviewed and accepted, not just recorded.
- [ ] Forced branch miss → draft discarded, nothing extra in `messages`, correct reply delivered.
- [ ] Malformed model output → still degrades gracefully.

### Numbers
- [ ] Job total **≤ 3.5 s** for a greeting turn.
- [ ] Compare against `BASELINE-p1.md` — full journey from 10.6 s.
- [ ] LLM cost per turn measured, including discarded speculative work, and explicitly accepted.

### Language (three phases of work must survive this)
- [ ] `npm run test:dm-language` 4/4 with the flag on.
- [ ] Hinglish thread stays Hinglish after a plain English turn (LANG-D2).
- [ ] The explicit `LANGUAGE:` directive is present in the merged prompt — asserted by test, not by reading.
- [ ] The model is not choosing language anywhere (LANG-D6).

### Live smoke
- [ ] English booking thread end to end.
- [ ] Hinglish thread end to end.
- [ ] Emergency phrase → safety copy fires first, correct language.
- [ ] Fee question mid-funnel → correct fee block, correct branch.

### Rollback readiness
- [ ] Flag off verified in the same session — behavior returns to the two-call path exactly.
- [ ] Someone other than the implementer knows how to flip it.

### Close-out
- [ ] Mark p3 and the program README **Status: ✅ Done** (or **partially shipped** if the flag stays off).
- [ ] Record the final before/after table in `BASELINE-p1.md`.
- [ ] Decide the fate of the old two-call path — keep behind the flag for now, or schedule removal. **Do not remove it in this task.**
- [ ] Close the remaining [`RBH-12`](../../../../../March%202026/2026-03-25/Receptionist%20Bot%20improvements/Tasks/e-task-rbh-12-dm-latency-faster-replies.md) rows this program covered (§3.2 merged call; §5.1 latency sign-off), and leave §4.1 (Render/Redis) open as the ops item it always was.
- [ ] Note any deferred follow-ups in `docs/Work/capture/inbox.md`.

---

**Created:** 2026-08-02.
