# Execution order — p3 photos

> Sibling document of [`plan-p3-clinic-link-photos-batch.md`](../plan-p3-clinic-link-photos-batch.md). The plan covers what and why. This doc covers who-runs-what-when.
>
> **Do not start this order until `clk-14` is green.** It is. This phase adds no migration and no SMS.

The user decides model switches. One careful task in the batch: `clk-15`.

```
Wave 1 (Store the file — ~6h, single lane):
  Lane α  ──── clk-15 (L)

Wave 2 (Read/delete and the doctor group — ~6h wall, 2 parallel lanes):
  Lane α  ──── clk-16 (M)                          [public read + delete]
  Lane β  ──── clk-18 (S)                          [doctor strip]

Wave 3 (Prep control — ~4h, single lane):
  Lane α  ──── clk-17 (M)

Wave 4 (Gate — ~3h):
  Lane α  ──── clk-19 (M)
```

**Wall-clock:** ~19h (Wave 2 runs the public read and the doctor group together).
**Agent-time:** ~21h.

**Bottleneck:** Wave 1. The unauthenticated file write chooses the path, the source, and the cap. Later tasks only call it or display its rows.

### Wave 1 — Store the file

| Step | Task | Size | Pre-load | Notes |
|---|---|---|---|---|
| 0 | clk-15 | L | `visit-documents-service.ts`, `history-form-token.ts`, CLK-DL-11 | Do not call `loadWritableAppointment`. Do not write a `…/desk/…` path. |

### Wave 2 — Read, delete, and the doctor group

| Step | Task | Size | Pre-load | Notes |
|---|---|---|---|---|
| 0α | clk-16 | M | clk-15 route, `CONTRACTS.md` | Public list is the patient’s own rows. Delete dies after check-in. |
| 0β | clk-18 | S | `DeskVisitDocumentsStrip.tsx` | Split the heading. Hide Extract when `source` is `patient`. |

Lane test: the doctor strip does not import the public history controller. The public read does not select `…/desk/…` rows.

### Wave 3 — Prep control

| Step | Task | Size | Pre-load | Notes |
|---|---|---|---|---|
| 0 | clk-17 | M | `frontend/app/book/prep/page.tsx` | Downscale images in the browser. One file per request. Strip is type `other`. |

### Wave 4 — Gate

| Step | Task | Size | Pre-load | Notes |
|---|---|---|---|---|
| 0 | clk-19 | M | Phase 3 gate in the batch plan | Dummy image only. No new behavior. |

## Per-task picks

| Task | Size | Why this one is heavier |
|---|---|---|
| clk-15 | L | Unauthenticated bytes into the private bucket. Wrong path or wrong source leaks into the desk’s files. |
| clk-16 | M | A leaked link must not list the desk’s scans. |
| clk-17 | M | Camera, file input, and downscale. No new clinical copy. |
| clk-18 | S | A heading and a hidden button. |
| clk-19 | M | Gate. The file-write review already happened on clk-15. |

## Acceptance gates

### Wave 1

- [ ] One patient file lands at `{doctor_id}/patient/{appointment_id}/…` with `source = patient` and `ordered_by = outside`.
- [ ] The desk create function is not called. Check-in is not required.

### Wave 2

- [ ] Public GET returns only that patient’s files and omits `file_path`.
- [ ] Delete works before check-in and returns 409 after `patient_checked_in_at` is set.
- [ ] The doctor strip shows “From the patient” and does not offer Extract on those rows.

### Wave 3

- [ ] The prep page can add a photo and remove it before check-in.
- [ ] An image is downscaled in the browser. The server still rejects a body over 10 MB.

### Wave 4

- [ ] Every batch gate box is checked, or a blocking task is named.
- [ ] The walk used a dummy image. The visit was cancelled afterward.
