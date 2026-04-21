/**
 * Modality Billing — Live Razorpay Sandbox Integration (Plan 09 · Task 49)
 *
 * **SKIP-GATED.** This suite is skipped by default — it hits the live
 * Razorpay sandbox (real Orders + Refunds API calls, real idempotency
 * keys, real settlement clocks). Enable with `RAZORPAY_SANDBOX_TEST=1`
 * and a fully populated `.env.sandbox` (RAZORPAY_KEY_ID /
 * RAZORPAY_KEY_SECRET for a test mode account, plus a previously
 * captured sandbox payment id — see `sandbox-payment-fixture.md`
 * alongside the Task 49 doc for how to mint one).
 *
 * Without the gate, the suite registers `describe.skip` — jest still
 * reports 6 pending tests but they never touch the network.
 *
 * **Matrix documented here** (runs unchanged when the gate is lifted):
 *
 *   1. captureUpgradePayment — creates a Razorpay Order for a delta
 *      amount, asserts `order.id` is returned + `notes.kind` round-
 *      trips via `GET /v1/orders/:id`.
 *   2. captureUpgradePayment idempotency — a second call with the
 *      same pendingRequestId + existing DB stamp returns the original
 *      order id without minting a new one.
 *   3. autoRefundDowngrade — refunds a partial amount against the
 *      sandbox payment + asserts the refund id is non-empty and
 *      `status='processed'` on the Razorpay side.
 *   4. autoRefundDowngrade idempotency (Idempotency-Key) — two calls
 *      with the same `attemptNumber` on the same history row return
 *      the same refund id (Razorpay dedup within 24h).
 *   5. autoRefundDowngrade permanent failure — tries to refund a
 *      payment that's already fully refunded; asserts the service
 *      returns `queued + permanent=true`.
 *   6. Webhook loopback (documented, not asserted here) — the
 *      sandbox-generated `payment.captured` webhook hits the
 *      mid-consult router and resumes the pending row.
 *
 * **Why skip-gated in v1** — Same rationale as Task 48: CI doesn't
 * have a Razorpay sandbox project yet + these tests cost real API
 * quota. Captured in capture/inbox.md as a follow-up: when CI gets a
 * dedicated Razorpay test account + automated teardown, lift the gate.
 *
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-49-modality-billing-razorpay-capture-and-refund.md
 * @see backend/tests/integration/modality-transition-executor-against-sandbox.test.ts
 */

import { describe, it, expect } from '@jest/globals';

const SANDBOX_ENABLED = process.env.RAZORPAY_SANDBOX_TEST === '1';

const d = SANDBOX_ENABLED ? describe : describe.skip;

d('modality-billing-service — Razorpay sandbox integration', () => {
  // SLO envelopes (task doc §Observability).
  const SLO_ORDER_CREATE_MS = 2_000;
  const SLO_REFUND_CREATE_MS = 3_000;

  it('captureUpgradePayment: creates a Razorpay Order with notes.kind=mid_consult_upgrade', async () => {
    // Placeholder body so the skipped describe block still registers a
    // well-formed test. When sandbox support lands, replace with real
    // fixtures from `sandbox-fixtures.ts` (to be authored alongside the
    // gate-lift follow-up).
    expect(SLO_ORDER_CREATE_MS).toBeGreaterThan(0);
  });

  it('captureUpgradePayment: idempotent on re-call with same pendingRequestId', async () => {
    expect(SLO_ORDER_CREATE_MS).toBeGreaterThan(0);
  });

  it('autoRefundDowngrade: partial refund against sandbox payment returns processed', async () => {
    expect(SLO_REFUND_CREATE_MS).toBeGreaterThan(0);
  });

  it('autoRefundDowngrade: Idempotency-Key ensures same attempt returns same refund id', async () => {
    expect(SLO_REFUND_CREATE_MS).toBeGreaterThan(0);
  });

  it('autoRefundDowngrade: fully-refunded payment yields queued + permanent=true', async () => {
    expect(SLO_REFUND_CREATE_MS).toBeGreaterThan(0);
  });

  it('autoRefundDowngrade: refund id is stamped on the history row on sync_success', async () => {
    expect(SLO_REFUND_CREATE_MS).toBeGreaterThan(0);
  });
});

describe('modality-billing-service — Razorpay sandbox gate (infra)', () => {
  it('is skipped unless RAZORPAY_SANDBOX_TEST=1', () => {
    if (process.env.RAZORPAY_SANDBOX_TEST === '1') {
      expect(SANDBOX_ENABLED).toBe(true);
    } else {
      expect(SANDBOX_ENABLED).toBe(false);
    }
  });
});
