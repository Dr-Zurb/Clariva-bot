/**
 * OPD observability — structured log lines for metrics pipelines (OPD-09).
 * No PHI in labels; use mode/strategy/correlationId only.
 * @see docs/Reference/OBSERVABILITY.md
 */

import { logger } from '../../config/logger';

type BookingMode = 'slot' | 'queue';

/**
 * Counter: successful appointment creates by OPD mode (maps to opd_booking_total{mode}).
 */
export function recordOpdBookingTotal(mode: BookingMode, correlationId: string): void {
  logger.info(
    {
      context: 'opd_metric',
      metric: 'opd_booking_total',
      mode,
      correlationId,
    },
    'opd_metric_opd_booking_total'
  );
}

/**
 * Counter: queue ETA inputs computed (maps to opd_eta_computed_total).
 */
export function recordOpdEtaComputed(correlationId: string): void {
  logger.info(
    {
      context: 'opd_metric',
      metric: 'opd_eta_computed_total',
      correlationId,
    },
    'opd_metric_opd_eta_computed_total'
  );
}

type RequeueStrategy = 'end_of_queue' | 'after_current';

/**
 * Counter: doctor requeue actions (maps to opd_queue_reinsert_total{strategy}).
 */
export function recordOpdQueueReinsertTotal(
  strategy: RequeueStrategy,
  correlationId: string
): void {
  logger.info(
    {
      context: 'opd_metric',
      metric: 'opd_queue_reinsert_total',
      strategy,
      correlationId,
    },
    'opd_metric_opd_queue_reinsert_total'
  );
}
