/**
 * Storage Service (Plan 02 · Task 34)
 * -----------------------------------
 *
 * Thin wrapper around Supabase Storage so the archival worker (and any
 * other caller that needs to hard-delete or mint a one-off signed URL
 * by full URI) can talk to one module rather than sprinkling
 * `admin.storage.from(...)` calls. Keeps the URI-parsing convention in
 * one place.
 *
 * ## URI convention
 *
 *   <bucket>/<path...>
 *
 *   e.g. `recordings/patient_<uuid>/sess_<uuid>/audio.mp4`
 *        `prescription-attachments/doctor_<uuid>/rx_<uuid>/file.pdf`
 *
 * First slash separates bucket from path. Anything beyond that is the
 * storage-side object key verbatim. We do NOT support `s3://` or
 * `supabase://` scheme prefixes — if a future provider lands, add a
 * `parseStorageUri` branch here rather than changing the callers.
 *
 * ## Why this module exists
 *
 * Task 34's hard-delete phase needs to remove objects whose URIs are
 * stored in `recording_artifact_index.storage_uri`. Existing code
 * (prescription-attachment-service) goes straight to
 * `admin.storage.from(BUCKET).remove(...)` with a hard-coded bucket.
 * Generalising that pattern here lets the archival worker stay
 * bucket-agnostic, which matters when Plan 07 / 08 add new buckets
 * (transcripts, exports) without needing to teach the worker about them.
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { InternalError, ValidationError } from '../utils/errors';

/**
 * Split a storage URI into its bucket + object-path components.
 *
 * Throws `ValidationError` if the URI is malformed (no slash, empty
 * bucket, or empty path) — the archival worker treats a bad URI as a
 * hard failure (not a silent skip) because it signals an
 * index-population bug upstream.
 */
export function parseStorageUri(storageUri: string): {
  bucket: string;
  path: string;
} {
  if (typeof storageUri !== 'string' || storageUri.trim().length === 0) {
    throw new ValidationError(
      'parseStorageUri: storageUri must be a non-empty string',
    );
  }
  const trimmed = storageUri.trim();
  // Strip any explicit scheme prefix callers may have injected. We only
  // understand the bare `<bucket>/<path>` convention, but tolerating
  // `supabase://` is cheap and future-friendly.
  const withoutScheme = trimmed.replace(/^supabase:\/\//, '');
  const slash = withoutScheme.indexOf('/');
  if (slash <= 0) {
    throw new ValidationError(
      `parseStorageUri: expected "<bucket>/<path>" shape, got "${storageUri}"`,
    );
  }
  const bucket = withoutScheme.slice(0, slash);
  const path = withoutScheme.slice(slash + 1);
  if (!bucket || !path) {
    throw new ValidationError(
      `parseStorageUri: bucket or path is empty in "${storageUri}"`,
    );
  }
  return { bucket, path };
}

/**
 * Delete a storage object by full `<bucket>/<path>` URI.
 *
 * Returns `true` if the storage API reports success, `false` only when
 * the admin client is not available (non-production test harness).
 * Throws `InternalError` on an API-level failure so the archival
 * worker knows the hard-delete did not happen and leaves
 * `hard_deleted_at` NULL — next run retries.
 *
 * Note on Supabase `remove([path])` semantics: it is idempotent in
 * practice (removing a non-existent path returns an error but does not
 * throw), but the SDK surfaces a StorageError for a missing object.
 * We treat that case as "already deleted" and return true — the
 * worker's job is "ensure this path is gone", not "ensure this was the
 * caller who deleted it".
 */
export async function deleteObject(storageUri: string): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.warn(
      { storageUri },
      'storage_service_delete_skipped_no_admin_client',
    );
    return false;
  }

  const { bucket, path } = parseStorageUri(storageUri);

  const { data, error } = await admin.storage.from(bucket).remove([path]);

  if (error) {
    // Object-not-found is a benign race (another caller beat us to it,
    // or the worker is re-running after a partial failure). Treat as
    // success so the caller can stamp hard_deleted_at.
    const msg = (error as { message?: string }).message?.toLowerCase() ?? '';
    if (msg.includes('not found') || msg.includes('object not found')) {
      logger.info(
        { storageUri, bucket, path },
        'storage_service_delete_already_gone',
      );
      return true;
    }
    throw new InternalError(
      `storage deleteObject failed for ${storageUri}: ${(error as { message?: string }).message ?? 'unknown'}`,
    );
  }

  logger.info(
    {
      storageUri,
      bucket,
      path,
      removed: Array.isArray(data) ? data.length : 0,
    },
    'storage_service_delete_ok',
  );
  return true;
}
