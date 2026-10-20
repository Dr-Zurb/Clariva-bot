-- ============================================================================
-- 258_social_card_media.sql
-- social-assist
-- Date: 2026-10-14
-- ============================================================================
-- Purpose:
--   More photos, more video, and a voice note. Ready still posts only
--   JPEG, PNG, WebP, MP4, and MOV. Caps stay in the service.
--
-- Reverse migration (document only):
--   Re-apply the mime list from 257_social_card_documents.sql.
-- ============================================================================

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY[
         'image/jpeg',
         'image/png',
         'image/webp',
         'image/gif',
         'image/heic',
         'image/heif',
         'image/avif',
         'image/bmp',
         'image/tiff',
         'video/mp4',
         'video/quicktime',
         'video/webm',
         'video/x-m4v',
         'video/3gpp',
         'video/x-msvideo',
         'video/x-matroska',
         'audio/mpeg',
         'audio/mp4',
         'audio/wav',
         'audio/x-wav',
         'application/pdf',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-powerpoint',
         'application/vnd.openxmlformats-officedocument.presentationml.presentation',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'text/plain',
         'text/csv',
         'application/rtf',
         'application/vnd.oasis.opendocument.text',
         'application/vnd.oasis.opendocument.spreadsheet',
         'application/vnd.oasis.opendocument.presentation'
       ]
 WHERE id = 'social-card-files';
