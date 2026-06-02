# RT-05 — Safety, emergency, webhook worker, delivery

**Philosophy:** §5 (closed domain = deterministic OK), §4.3 (no invented policy).

## Paths to read

- `backend/src/utils/safety-messages.ts`
- `backend/src/workers/webhook-worker.ts` — entry, dispatch to DM handler
- `backend/src/workers/webhook-dm-send.ts`
- `backend/src/controllers/webhook-controller.ts` — high-level routing only

## What to verify

1. **Emergency:** Keyword lists — justified as latency-sensitive per §5?
2. **No LLM for URLs** in safety copy — confirm templates are fixed.
3. **Worker:** Idempotency, queue — not philosophy violations but note failure modes.

## Deliverable

Confirm **which** safety paths must stay deterministic vs could be **LLM-assisted** (probably none for emergency).
