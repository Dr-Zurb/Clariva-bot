# clinic-branding-v1 — custom letterhead + branded prescriptions

> **Status:** Shipped 2026-08-24 (eng). Apply migrations 211 + 212 on the target project before dogfood.
> **One-line intent:** Let a doctor put their own logo and practice identity on the prescription PDF and patient web view, finishing the letterhead gap left open by T3-D4.

## Decision lock

| ID | Decision |
|---|---|
| **BRD-D1** | Branding is data + three fixed presets (`classic`, `centred`, `preprinted`). No layout builder. |
| **BRD-D2** | Registration number from `doctor_verification` only when `status='verified'`. Never a typed letterhead field. |
| **BRD-D3** | Signature is the typed name plus an "electronically generated" line. No signature image. |
| **BRD-D4** | Freeze on send. `forceRegeneratePrescriptionPdf` refuses when `sent_to_patient_at` is set. Resend remints the stored PDF; it does not re-render. |
| **BRD-D5** | Logo reaches `@react-pdf/renderer` `<Image>` as a Buffer, never a URL. |
| **BRD-D6** | No `sharp`. Magic-byte sniff + 512 KB cap. PNG/JPEG only. |
| **BRD-D7** | All letterhead reads go through `resolveLetterhead(doctorId)`. |
| **BRD-D8** | No AI in the render path. Photo-prefill is deferred (BRD-09). |

## Scope guard

- Do not change clinical PDF content mapping (`prescription-pdf-composer.ts`).
- Do not log logo paths, registration numbers, or names.
- Logo writes go through the branding register endpoint — not generic settings PATCH.

## Migrations

- `211_doctor_settings_branding.sql`
- `212_clinic_branding_bucket.sql`

## Acceptance

- Unsent Rx picks up current branding; sent Rx keeps the stored PDF.
- Unverified doctors omit the registration number.
- `preprinted` omits header/footer and reserves configured mm.
- `/r/[id]` letterhead matches the PDF chrome (logo + qualifications + verified reg no).
- No branding identifiers in logs.
