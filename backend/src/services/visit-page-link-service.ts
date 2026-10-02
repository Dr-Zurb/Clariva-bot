/**
 * Short code for an Instagram clinic link.
 * The code is a capability. Do not log it.
 */

import crypto from 'crypto';
import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { handleSupabaseError } from '../utils/db-helpers';
import {
  buildBookingPageUrl,
  buildShortVisitPageUrl,
  type BookingPageFor,
} from '../utils/booking-page-url';
import { isPublicSlugShape } from '../utils/public-clinic-slug';

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const CODE_LENGTH = 8;
const LINK_TTL_MS = 60 * 60 * 1000;

const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export function isVisitPageCode(value: string): boolean {
  return CODE_PATTERN.test(value);
}

function newVisitCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return code;
}

export type VisitPageLink = {
  conversationId: string;
  doctorId: string;
};

/**
 * Chat link for Instagram. Falls back to the long signed token when the
 * short-code table is unavailable, so a message still has a working link.
 */
export async function mintVisitPageLink(input: {
  conversationId: string;
  doctorId: string;
  publicSlug?: string | null;
  purpose?: BookingPageFor;
  correlationId: string;
}): Promise<string> {
  const longUrl = (): string =>
    buildBookingPageUrl(
      input.conversationId,
      input.doctorId,
      input.publicSlug,
      input.purpose
    );
  const slug = input.publicSlug?.trim() ?? '';
  if (!slug || !isPublicSlugShape(slug)) return longUrl();

  const admin = getSupabaseAdminClient();
  if (!admin) return longUrl();

  const expiresAt = new Date(Date.now() + LINK_TTL_MS).toISOString();
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = newVisitCode();
    const { error } = await admin.from('visit_page_links').insert({
      code,
      conversation_id: input.conversationId,
      doctor_id: input.doctorId,
      purpose: input.purpose ?? null,
      expires_at: expiresAt,
    });
    if (!error) return buildShortVisitPageUrl(slug, code, input.purpose);
    if (error.code === '23505') continue;
    logger.warn(
      { correlationId: input.correlationId, errorCode: error.code },
      'visit-page-link mint failed'
    );
    return longUrl();
  }
  return longUrl();
}

/** Active code only. Missing or expired is null. Does not log the code. */
export async function findVisitPageLink(
  code: string,
  correlationId: string
): Promise<VisitPageLink | null> {
  if (!isVisitPageCode(code)) return null;
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from('visit_page_links')
    .select('conversation_id, doctor_id, expires_at')
    .eq('code', code)
    .maybeSingle();
  if (error) {
    handleSupabaseError(error, correlationId);
  }
  if (!data?.conversation_id || !data.doctor_id || !data.expires_at) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;
  return {
    conversationId: data.conversation_id,
    doctorId: data.doctor_id,
  };
}
