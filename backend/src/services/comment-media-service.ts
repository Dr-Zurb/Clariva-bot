/**
 * Comment Media Service
 *
 * Resolves doctor_id from Instagram comment webhook context (entry_id, media_id).
 * Used by comment worker to route comment leads to the correct doctor.
 *
 * Strategy:
 * 1. Direct lookup: entry[].id (Instagram account ID) → doctor_instagram.instagram_page_id
 * 2. Fallback: GET /{media_id}?fields=owner (Instagram Graph API) with each doctor's token;
 *    owner.id matches instagram_page_id → doctor found
 *
 * IMPORTANT:
 * - No PHI in logs (no comment text)
 * - Uses service role for DB; doctor tokens for API
 *
 * @see e-task-5-comment-doctor-media-mapping.md
 * @see https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/
 */

import axios, { AxiosError } from 'axios';
import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { handleSupabaseError } from '../utils/db-helpers';
import { getDoctorIdByPageId } from './instagram-connect-service';

const INSTAGRAM_GRAPH_BASE = 'https://graph.instagram.com/v18.0';
const META_HTTP_TIMEOUT_MS = 10000;

/** Instagram media API response (owner only returned when token owner created the media) */
interface MediaOwnerResponse {
  owner?: { id: string };
  username?: string;
}

/**
 * Resolve doctor_id from comment webhook context.
 *
 * @param entryId - Instagram account ID from entry[].id (subscribed object)
 * @param mediaId - Media ID from value.media.id (post the comment was on)
 * @param correlationId - For audit logs (no PHI)
 * @returns doctor_id if found, null otherwise
 */
export async function resolveDoctorIdFromComment(
  entryId: string,
  mediaId: string | null,
  correlationId: string
): Promise<string | null> {
  if (!entryId || typeof entryId !== 'string') {
    return null;
  }

  // 1. Direct lookup: entry_id → doctor_instagram.instagram_page_id
  const doctorId = await getDoctorIdByPageId(entryId, correlationId);
  if (doctorId) {
    return doctorId;
  }

  // 2. Fallback: media owner lookup (only if we have mediaId)
  if (!mediaId || typeof mediaId !== 'string') {
    logger.warn(
      { correlationId, entryId },
      'Comment: no doctor for entry_id; mediaId missing, skipping media owner fallback'
    );
    return null;
  }

  return resolveDoctorIdFromMediaOwner(mediaId, correlationId);
}

/**
 * Fallback: fetch media owner via API, match to doctor_instagram.
 * Tries each connected doctor's token; owner is only returned when token owner created the media.
 */
async function resolveDoctorIdFromMediaOwner(
  mediaId: string,
  correlationId: string
): Promise<string | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    logger.warn({ correlationId }, 'Comment: service role unavailable for media owner lookup');
    return null;
  }

  const { data: rows, error } = await supabase
    .from('doctor_instagram')
    .select('doctor_id, instagram_page_id, instagram_access_token');

  if (error) {
    handleSupabaseError(error, correlationId);
    return null;
  }

  if (!rows?.length) {
    logger.warn({ correlationId }, 'Comment: no doctor_instagram rows for media owner lookup');
    return null;
  }

  for (const row of rows) {
    const token = row.instagram_access_token as string | undefined;
    const pageId = row.instagram_page_id as string;
    if (!token) continue;

    try {
      const res = await axios.get<MediaOwnerResponse>(
        `${INSTAGRAM_GRAPH_BASE}/${mediaId}`,
        {
          params: { fields: 'owner', access_token: token },
          timeout: META_HTTP_TIMEOUT_MS,
        }
      );

      const ownerId = res.data?.owner?.id;
      if (ownerId && ownerId === pageId) {
        logger.debug(
          { correlationId, mediaId, pageId },
          'Comment: resolved doctor from media owner'
        );
        return row.doctor_id as string;
      }
      // owner not returned (we don't own this media) or id mismatch → try next
    } catch (err: unknown) {
      const status = err instanceof AxiosError ? err.response?.status : undefined;
      const code = err instanceof AxiosError ? err.response?.data?.error?.code : undefined;

      if (status === 429) {
        logger.warn(
          { correlationId, mediaId },
          'Comment: Instagram API rate limit (429) during media owner lookup'
        );
        return null;
      }

      // 400/403: media not accessible to this token, try next doctor
      if (status === 400 || status === 403 || code === 190) {
        continue;
      }

      logger.warn(
        {
          correlationId,
          mediaId,
          status,
          code,
          message: err instanceof Error ? err.message : String(err),
        },
        'Comment: media owner API error (trying next doctor)'
      );
    }
  }

  logger.warn(
    { correlationId, mediaId },
    'Comment: no doctor matched media owner'
  );
  return null;
}
