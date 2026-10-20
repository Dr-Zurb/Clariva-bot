-- ============================================================================
-- 256_social_card_file_kinds.sql
-- social-assist
-- Date: 2026-10-14
-- ============================================================================
-- Purpose:
--   A card file can be a photo, a video, or a PDF. The bucket cap is the
--   largest of those: 100 MB for a video. Photos and PDFs are capped in
--   the service. A PDF cannot become the Ready piece.
--
-- Reverse migration (document only):
--   UPDATE storage.buckets
--      SET file_size_limit = 52428800,
--          allowed_mime_types = ARRAY[
--            'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'
--          ]
--    WHERE id = 'social-card-files';
-- ============================================================================

UPDATE storage.buckets
   SET file_size_limit = 104857600,
       allowed_mime_types = ARRAY[
         'image/jpeg',
         'image/png',
         'image/webp',
         'video/mp4',
         'video/quicktime',
         'application/pdf'
       ]
 WHERE id = 'social-card-files';
