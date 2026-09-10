/**
 * Per-doctor Razorpay keys (P2.3). Secret is encrypted at rest.
 * Never log a key or secret. Never return the secret from an API shape.
 */

import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { razorpayAdapter } from '../adapters/razorpay-adapter';
import { decryptPayload, encryptPayload } from '../utils/encryption';
import { verifyRazorpaySignatureWithSecret } from '../utils/razorpay-verification';
import { InternalError, ValidationError } from '../utils/errors';
import { extractRazorpayWebhookHints } from './billing/razorpay-webhook-hints';
import type {
  DoctorGatewayPublicStatus,
  DoctorGatewayStatus,
  GatewayCredentials,
  PaymentCollectionMode,
} from '../types/gateway-credentials';

export function maskKeyId(keyId: string): string {
  const trimmed = keyId.trim();
  if (trimmed.length <= 8) return '****';
  return `${trimmed.slice(0, 7)}…${trimmed.slice(-4)}`;
}

export async function getDecryptedGatewayCredentials(
  doctorId: string,
  correlationId: string
): Promise<GatewayCredentials | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data, error } = await admin
    .from('doctor_payment_credentials')
    .select('key_id, key_secret_encrypted, status')
    .eq('doctor_id', doctorId)
    .eq('gateway', 'razorpay')
    .eq('status', 'connected')
    .maybeSingle();

  if (error) {
    logger.warn({ correlationId, error: error.message }, 'gateway credentials: read failed');
    throw new InternalError('Failed to load payment credentials');
  }
  if (!data) return null;

  const secret = decryptPayload(data.key_secret_encrypted as string, correlationId);
  return { keyId: data.key_id as string, keySecret: secret };
}

export async function hasConnectedGateway(doctorId: string, correlationId: string): Promise<boolean> {
  const creds = await getDecryptedGatewayCredentials(doctorId, correlationId);
  return creds != null;
}

export async function getDoctorGatewayPublicStatus(
  doctorId: string,
  correlationId: string
): Promise<DoctorGatewayPublicStatus> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: creds, error: credsError } = await admin
    .from('doctor_payment_credentials')
    .select('key_id, status, last_verified_at, gateway, webhook_secret_encrypted')
    .eq('doctor_id', doctorId)
    .eq('gateway', 'razorpay')
    .maybeSingle();

  if (credsError) {
    logger.warn({ correlationId, error: credsError.message }, 'gateway status: creds read failed');
    throw new InternalError('Failed to load payment credentials');
  }

  const { data: settings, error: settingsError } = await admin
    .from('doctor_settings')
    .select('payment_collection_mode')
    .eq('doctor_id', doctorId)
    .maybeSingle();

  if (settingsError) {
    logger.warn({ correlationId, error: settingsError.message }, 'gateway status: mode read failed');
    throw new InternalError('Failed to load payment mode');
  }

  const mode = (settings?.payment_collection_mode as PaymentCollectionMode | undefined) ?? 'bookings_only';
  const status = (creds?.status as DoctorGatewayStatus | undefined) ?? null;

  return {
    connected: status === 'connected',
    gateway: creds ? 'razorpay' : null,
    maskedKeyId: creds?.key_id ? maskKeyId(creds.key_id as string) : null,
    status,
    lastVerifiedAt: (creds?.last_verified_at as string | null) ?? null,
    paymentCollectionMode: mode,
    webhookConfigured: Boolean(creds?.webhook_secret_encrypted),
    webhookUrl: env.WEBHOOK_BASE_URL
      ? `${env.WEBHOOK_BASE_URL.replace(/\/$/, '')}/webhooks/razorpay`
      : null,
  };
}

export async function connectDoctorGateway(
  doctorId: string,
  keyId: string,
  keySecret: string,
  correlationId: string,
  webhookSecret?: string
): Promise<DoctorGatewayPublicStatus> {
  const trimmedId = keyId.trim();
  const trimmedSecret = keySecret.trim();
  if (!trimmedId.startsWith('rzp_') || trimmedId.length < 12) {
    throw new ValidationError('Enter a valid Razorpay key id');
  }
  if (trimmedSecret.length < 16) {
    throw new ValidationError('Enter a valid Razorpay key secret');
  }

  const ok = await razorpayAdapter.verifyCredentials({
    keyId: trimmedId,
    keySecret: trimmedSecret,
  });
  if (!ok) {
    throw new ValidationError('Razorpay rejected these keys. Check the id and secret and try again.');
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const trimmedWebhook = webhookSecret?.trim();
  if (trimmedWebhook != null && trimmedWebhook.length > 0 && trimmedWebhook.length < 8) {
    throw new ValidationError('Enter the webhook secret from your Razorpay dashboard');
  }

  const encrypted = encryptPayload(trimmedSecret, correlationId);
  const nowIso = new Date().toISOString();
  const row: Record<string, unknown> = {
    doctor_id: doctorId,
    gateway: 'razorpay',
    key_id: trimmedId,
    key_secret_encrypted: encrypted,
    status: 'connected',
    connected_at: nowIso,
    last_verified_at: nowIso,
    updated_at: nowIso,
  };
  if (trimmedWebhook && trimmedWebhook.length >= 8) {
    row.webhook_secret_encrypted = encryptPayload(trimmedWebhook, correlationId);
  }

  const { error } = await admin.from('doctor_payment_credentials').upsert(row, {
    onConflict: 'doctor_id,gateway',
  });

  if (error) {
    logger.warn({ correlationId, error: error.message }, 'gateway connect: upsert failed');
    throw new InternalError('Failed to save payment credentials');
  }

  return getDoctorGatewayPublicStatus(doctorId, correlationId);
}

export async function setPaymentCollectionMode(
  doctorId: string,
  mode: PaymentCollectionMode,
  correlationId: string
): Promise<DoctorGatewayPublicStatus> {
  if (mode === 'prepaid') {
    const status = await getDoctorGatewayPublicStatus(doctorId, correlationId);
    if (!status.connected) {
      throw new ValidationError(
        'Connect your Razorpay account before switching to prepaid bookings'
      );
    }
    if (!status.webhookConfigured) {
      throw new ValidationError(
        'Add your Razorpay webhook secret so we can confirm patient payments'
      );
    }
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { error } = await admin
    .from('doctor_settings')
    .update({ payment_collection_mode: mode })
    .eq('doctor_id', doctorId);

  if (error) {
    logger.warn({ correlationId, error: error.message }, 'collection mode: update failed');
    throw new InternalError('Failed to update payment mode');
  }

  return getDoctorGatewayPublicStatus(doctorId, correlationId);
}

export async function verifyDoctorOwnedRazorpayWebhook(
  signature: string,
  rawBody: Buffer,
  correlationId: string
): Promise<boolean> {
  const doctorId = await resolveDoctorIdFromRazorpayWebhook(rawBody, correlationId);
  if (!doctorId) return false;

  const admin = getSupabaseAdminClient();
  if (!admin) return false;

  const { data, error } = await admin
    .from('doctor_payment_credentials')
    .select('webhook_secret_encrypted')
    .eq('doctor_id', doctorId)
    .eq('gateway', 'razorpay')
    .eq('status', 'connected')
    .maybeSingle();

  if (error || !data?.webhook_secret_encrypted) {
    return false;
  }

  const secret = decryptPayload(data.webhook_secret_encrypted as string, correlationId);
  return verifyRazorpaySignatureWithSecret(signature, rawBody, secret, correlationId);
}

async function resolveDoctorIdFromRazorpayWebhook(
  rawBody: Buffer,
  correlationId: string
): Promise<string | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;

  const hints = extractRazorpayWebhookHints(rawBody);
  if (hints.appointmentId) {
    const { data, error } = await admin
      .from('appointments')
      .select('doctor_id')
      .eq('id', hints.appointmentId)
      .maybeSingle();
    if (error) {
      logger.warn({ correlationId, error: error.message }, 'webhook doctor lookup: appointment failed');
    }
    if (data?.doctor_id) return data.doctor_id as string;
  }

  if (hints.gatewayOrderIds.length === 0) return null;

  const { data, error } = await admin
    .from('payments')
    .select('appointment_id')
    .in('gateway_order_id', hints.gatewayOrderIds)
    .limit(1)
    .maybeSingle();

  if (error || !data?.appointment_id) return null;

  const { data: apt, error: aptError } = await admin
    .from('appointments')
    .select('doctor_id')
    .eq('id', data.appointment_id)
    .maybeSingle();

  if (aptError) {
    logger.warn({ correlationId, error: aptError.message }, 'webhook doctor lookup: payment apt failed');
  }
  return (apt?.doctor_id as string | undefined) ?? null;
}
