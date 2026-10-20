-- ============================================================================
-- 257_social_card_documents.sql
-- social-assist
-- Date: 2026-10-14
-- ============================================================================
-- Purpose:
--   A card can hold a common document as well as a photo or a video.
--   Documents stay off Ready. The service still caps a document at 10 MB.
--
-- Reverse migration (document only):
--   UPDATE storage.buckets
--      SET allowed_mime_types = ARRAY[
--            'image/jpeg', 'image/png', 'image/webp',
--            'video/mp4', 'video/quicktime', 'application/pdf'
--          ]
--    WHERE id = 'social-card-files';
-- ============================================================================

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY[
         'image/jpeg',
         'image/png',
         'image/webp',
         'video/mp4',
         'video/quicktime',
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
