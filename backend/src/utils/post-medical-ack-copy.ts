/**
 * Single source of truth (English) for post–medical-deflection payment-existence ack.
 * Localized at runtime via `resolvePostMedicalPaymentExistenceAck` in ai-service when enabled.
 * Policy: no amounts; visit type set by practice; no patient fee-menu picking (e-task-dm-04b).
 */

export const POST_MEDICAL_PAYMENT_EXISTENCE_ACK_CANONICAL_EN =
  '**Yes** — **consultations with the doctor are paid**; they’re **not free** or complimentary.\n\n' +
  'We use what you describe to line up the **right visit type** for you. You won’t be asked to **pick between fee packages** here in chat.\n\n' +
  'When you’re ready for the **amount**, just say you’d like the **fee** or **price** — we’ll share it based on what you’re seeing the doctor about.';
