-- ============================================================================
-- Prescription Attachments Storage Bucket (Prescription V1)
-- ============================================================================
-- Migration: 027_prescription_attachments_bucket.sql
-- Date: 2026-03-28
-- Description:
--   Create private storage bucket for prescription attachments (handwritten Rx,
--   lab reports). Photos may contain PHI. Access via signed URLs only.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES (
  'prescription-attachments',
  'prescription-attachments',
  false
)
ON CONFLICT (id) DO NOTHING;

-- Optional: Set bucket limits if your Supabase version supports these columns:
-- ALTER via Dashboard or: UPDATE storage.buckets SET file_size_limit=10485760, allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp','application/pdf'] WHERE id='prescription-attachments';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Bucket is private. Use createSignedUploadUrl (upload) and createSignedUrl (download)
-- via service role. Path pattern: {doctor_id}/{prescription_id}/{uuid}-{filename}
-- ============================================================================
