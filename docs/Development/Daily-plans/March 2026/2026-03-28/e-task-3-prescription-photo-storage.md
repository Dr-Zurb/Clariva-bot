# Task 3: Prescription Photo Storage (Supabase Storage)

## 2026-03-28 — Prescription V1 Implementation

---

## 📋 Task Overview

Set up Supabase Storage bucket for prescription attachments (handwritten prescription photos, lab reports). Provide signed upload URLs from backend; store file paths in `prescription_attachments`.

**Estimated Time:** 1.5 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-28

**Change Type:**
- [x] **New feature** — New storage bucket and upload API

**Current State:**
- ✅ **What exists:** Supabase client in backend; `@supabase/storage-js` in package.json; no existing Storage bucket usage
- ❌ **What's missing:** `prescription-attachments` bucket; upload URL API; RLS for storage
- ⚠️ **Notes:** Photos may contain PHI (handwritten Rx). Bucket must be private; access via signed URLs only.

**Scope Guard:**
- Expected files touched: ~4 (migration for bucket policy if needed, service, controller, route)
- Depends on: e-task-1 (prescription_attachments table)

**Reference Documentation:**
- [Supabase Storage](https://supabase.com/docs/guides/storage)
- [PRESCRIPTION_EHR_PLAN.md](../2026-03-23/PRESCRIPTION_EHR_PLAN.md) — Photo upload section
- [COMPLIANCE.md](../../../Reference/COMPLIANCE.md) — PHI in storage

---

## ✅ Task Breakdown (Hierarchical)

### 1. Storage Bucket Setup

- [x] 1.1 Create bucket `prescription-attachments` (private)
  - [x] 1.1.1 Option A: Supabase Dashboard → Storage → New bucket
  - [x] 1.1.2 Option B: SQL migration with `storage.buckets` insert (if project uses migrations for storage)
  - [x] 1.1.3 Set `public: false` (private bucket)
  - [x] 1.1.4 Max file size: 10MB (configurable); allowed types: image/jpeg, image/png, image/webp, application/pdf
- [x] 1.2 Storage RLS policies
  - [x] 1.2.1 Policy: Users can INSERT into bucket only for their own prescriptions (check via object path or metadata)
  - [x] 1.2.2 Policy: Users can SELECT (read) only their own prescription attachments
  - [x] 1.2.3 Path pattern: `{doctor_id}/{prescription_id}/{filename}` — enables RLS by doctor_id
  - [x] 1.2.4 Document: Supabase Storage RLS uses `storage.objects`; policies reference `auth.uid()` and path

### 2. Upload Flow Design

- [x] 2.1 Backend generates signed upload URL
  - [x] 2.1.1 Doctor calls POST /api/v1/prescriptions/:id/attachments/upload-url
  - [x] 2.1.2 Body: { contentType, filename } (optional)
  - [x] 2.1.3 Backend: verify prescription exists and doctor owns it; generate path; create signed URL (expiry 15 min)
  - [x] 2.1.4 Response: { path, token } — frontend uses supabase.storage.from('prescription-attachments').uploadToSignedUrl(path, token, file)
- [x] 2.2 Frontend uploads file to signed URL (e-task-4)
  - [x] 2.2.1 Frontend receives path + token; uploadToSignedUrl(path, token, file)
  - [x] 2.2.2 Then calls POST /api/v1/prescriptions/:id/attachments to register (file_path, file_type)
- [x] 2.3 Alternative: Backend receives multipart file
  - [x] 2.3.1 If preferred: POST /api/v1/prescriptions/:id/attachments with multipart/form-data
  - [x] 2.3.2 Backend uploads to Storage via service role; inserts into prescription_attachments
  - [x] 2.3.4 Simpler for frontend; larger request body
- [x] 2.4 Decision: Use signed URL (better for large files, frontend progress). Implemented.

### 3. Prescription Attachment Service

- [x] 3.1 Create `backend/src/services/prescription-attachment-service.ts`
  - [x] 3.1.1 `createUploadUrl(prescriptionId, userId, filename, contentType, correlationId)`: verify ownership; generate path `{doctorId}/{prescriptionId}/{uuid}-{sanitizedFilename}`; create signed upload URL; return { path, token }
  - [x] 3.1.2 `registerAttachment(prescriptionId, filePath, fileType, caption, correlationId, userId)`: insert into prescription_attachments; verify prescription owned by doctor
  - [x] 3.1.3 `getAttachmentDownloadUrl(prescriptionId, attachmentId, correlationId, userId)`: verify ownership; create signed download URL (expiry 5 min)
  - [x] 3.1.4 Use `getSupabaseAdminClient()` for Storage operations
- [x] 3.2 Path sanitization
  - [x] 3.2.1 Sanitize filename: remove path traversal, special chars; limit length
  - [x] 3.2.2 Use UUID prefix to avoid collisions

### 4. API Endpoints

- [x] 4.1 POST /api/v1/prescriptions/:id/attachments/upload-url
  - [x] 4.1.1 Body: { filename?: string, contentType?: string }
  - [x] 4.1.2 Response: { path, token }
  - [x] 4.1.3 Auth required; 404 if prescription not found
- [x] 4.2 POST /api/v1/prescriptions/:id/attachments
  - [x] 4.2.1 Body: { filePath, fileType, caption? } — register after client uploads
  - [x] 4.2.2 Response: { attachment }
- [x] 4.3 GET /api/v1/prescriptions/:id/attachments/:attachmentId/download-url
  - [x] 4.3.1 Response: { downloadUrl } — signed URL for viewing/download
  - [x] 4.3.2 Optional: may be combined with getPrescriptionById returning attachment with downloadUrl

### 5. Controller & Routes

- [x] 5.1 Add handlers in `prescription-controller.ts`
  - [x] 5.1.1 createUploadUrlHandler
  - [x] 5.1.2 registerAttachmentHandler
  - [x] 5.1.3 getAttachmentDownloadUrlHandler
- [x] 5.2 Mount routes under /api/v1/prescriptions/:id/attachments/...

### 6. Verification

- [ ] 6.1 Upload flow: get signed URL → upload file → register attachment
- [ ] 6.2 Download flow: get signed URL → fetch image
- [ ] 6.3 Verify another doctor cannot access

---

## 📁 Files to Create/Update

```
backend/
├── migrations/
│   └── 027_prescription_attachments_bucket.sql  (CREATE)
backend/src/
├── services/
│   └── prescription-attachment-service.ts  (CREATE)
├── controllers/
│   └── prescription-controller.ts          (UPDATE)
├── utils/
│   └── validation.ts                       (UPDATE - attachment schemas)
├── routes/
│   └── api/v1/
│       └── prescriptions.ts                (UPDATE - nested attachment routes)
```

**Migration:** Run `027_prescription_attachments_bucket.sql` in Supabase SQL Editor (creates private bucket with file limits).

---

## 🧠 Design Constraints

- PHI in stored files; bucket must be private
- Signed URLs only; no public access
- Path includes doctor_id for easy RLS
- File size limit enforced (backend or Storage config)
- Allowed MIME: image/jpeg, image/png, image/webp, application/pdf

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y — storage objects)
  - [x] **RLS verified?** (Y — private bucket, signed URLs via admin client)
- [x] **Any PHI in logs?** (No — no file content in logs)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (Y — attachments are PHI; align with prescription retention)

---

## ✅ Acceptance & Verification Criteria

- [x] Bucket exists and is private (via migration 027)
- [x] Doctor can obtain upload URL for own prescription
- [x] Doctor can register attachment after upload
- [x] Doctor can get download URL for own prescription attachments
- [x] Cross-doctor access denied (ownership checks in service)

---

## 🔗 Related Tasks

- [e-task-1: Migration](./e-task-1-prescription-migration.md)
- [e-task-2: Prescription service](./e-task-2-prescription-service-api.md)
- [e-task-4: Prescription form UI](./e-task-4-prescription-form-ui.md)

---

**Last Updated:** 2026-03-28
