# Instagram DM — observe → analyze → fix

**Purpose:** dummy clinic DMs through the live webhook, write what the bot said, decide copy against the Meta lock, then fix. Same three steps as a human phone test, without typing in Instagram.

Use this when the ask is “test real-world DMs,” “what does the bot reply,” or “fix the observe transcript.” Do **not** start at fix. Do **not** treat `test:dm-conversation` assertions as this loop — that harness expects old 112 / catalog copy.

Meta lock (pass rule for every reply): receptionist FAQ, or `/book` only when they ask to book / timings / the link. Symptom, emergency, prescribe, refill → receptionist sentence only — no URL, no 112, no “get an appointment.” No name, phone, symptoms collected. No diagnosis. No clinical fee catalog or doctor name. No teleconsult list in the DM. Exact Healthcare line: [`notes/2026-09-18-meta-healthcare-clause.md`](../capture/notes/2026-09-18-meta-healthcare-clause.md).

Dummy patients only. No real names, phones, or threads.

---

## 1 — Test (observe)

Backend must be running (`cd backend && npm run dev`). Synthetic senders do **not** prove Meta Graph delivery.

```bash
cd backend && npm run test:dm-observe
# one thread: npm run test:dm-observe -- --conversation tape-hello-book
# subset + other file: npm run test:dm-observe -- --out docs/Work/capture/notes/2026-09-18-ig-dm-observe-varied.md --conversation hello-doctor
```

| Piece | Path |
|---|---|
| Patient lines | `backend/scripts/fixtures/dm-observe-conversations.ts` |
| Runner | `backend/scripts/test-dm-observe.ts` |
| Transcript | `docs/Work/capture/notes/2026-09-17-ig-dm-observe.md` (overwritten each run) |

Add a conversation to the fixture when a real clinic DM is missing. Keep names/phones obviously dummy. After a code fix, **restart `npm run dev`** (or wait for nodemon) before re-running — a stale worker is why chest pain still sent 112 on the first pass.

Gap between turns is ~12s (conversation lock). A full pack is several minutes.

---

## 2 — Analyze

Read the transcript. For each thread: patient line, bot reply, intent/step. Sort into:

1. **Already fine** — do not touch.
2. **Meta / no-patient-data** — change this sitting (112, catalog, promised a page with no URL, “say book appointment”).
3. **Later** — tone, language polish, Tailscale vs production host.

Write the suggested sitting order in chat (or a short note). **No code in this step.**

Tape for App Review stays: `hi` → `I want to book`. Do not tape hours / fees / chest pain until those replies match the lock.

---

## 3 — Fix

Implement only the analyze list. Prefer existing link-first helpers (`applyReadyPatientBookingPath`, `applyLeadPlusBookingLink`, `instagram-faq-copy.ts`). Then:

1. Focused tests + typecheck + lint on the edited files.
2. Restart the backend.
3. Re-run observe (full pack or the threads you changed).
4. Confirm the new transcript — do not declare done from unit tests alone.

STOP silence after opt-out can look like a repeated STOP ack if a failed Meta send retries; check the gate before assuming copy is wrong.

---

## Triggers

| User says | Do |
|---|---|
| “run the dummy DM pass” / “observe” | Step 1 only |
| “analyze the replies” | Step 2 only |
| “fix” (after analyze) | Step 3 |
| “test analyze fix” | All three, in order |

Last used: 2026-09-18 (receptionist pack + recheck after send-link / book+fever / payment FAQ). Outbound-spike auto-pause can flip the clinic mid-pack — unpause again before a re-run.
