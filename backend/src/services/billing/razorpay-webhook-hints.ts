/**
 * Untrusted peek of a Razorpay webhook body to find which doctor owns it.
 * Signature is verified separately with that doctor's secret.
 */

export interface RazorpayWebhookHints {
  appointmentId: string | null;
  gatewayOrderIds: string[];
}

export function extractRazorpayWebhookHints(rawBody: Buffer): RazorpayWebhookHints {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return { appointmentId: null, gatewayOrderIds: [] };
  }
  const payload = (parsed as { payload?: Record<string, { entity?: Record<string, unknown> }> })
    ?.payload;
  const payment = payload?.payment?.entity;
  const plink = payload?.payment_link?.entity;
  const order = payload?.order?.entity;

  const notes =
    (payment?.notes as Record<string, unknown> | undefined) ??
    (plink?.notes as Record<string, unknown> | undefined) ??
    (order?.notes as Record<string, unknown> | undefined);

  const appointmentId =
    typeof notes?.appointment_id === 'string' && notes.appointment_id.length > 0
      ? notes.appointment_id
      : null;

  const ids = [plink?.id, order?.id, payment?.order_id, payment?.id]
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  return { appointmentId, gatewayOrderIds: [...new Set(ids)] };
}
