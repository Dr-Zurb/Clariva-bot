# SOAP data placement — Phase 2: per-complaint symptom media — 25 Jun 2026 batch plan

> **Phase 2 of the SOAP data-placement program.** Media today is **Objective-only**: the shipped `ObjectiveMediaStrip` attaches wound/rash/ECG/report-scan files via `prescription_attachments` tagged with an `objective/` storage-path segment. But a photo the patient *reports* (a rash, a wound, a swelling) documents a **subjective complaint** — and there is nowhere to pin it next to that complaint. Phase 2 adds **per-complaint symptom photos in the Subjective tab**, attaching through the **same shipped storage** with a `subjective/{complaintId}/` path segment so each photo is pinned to its complaint's stable `id`. **No new bucket, column, RLS policy, or migration** — the prescription-scoped policy (migration 026) already covers the deeper path; this mirrors the `objective/` pattern (P5-D4 / SDP-D3) exactly.
>
> **Source plan:** [`Product plans/ehr/soap-data-placement/plan-soap-data-placement.md`](../../../../../Product%20plans/ehr/soap-data-placement/plan-soap-data-placement.md) — Phase P2; decision **SDP-D3** (Option B, per-complaint); inherits `SDP-D1..D5`.
>
> **Prefix note:** tasks are `sdp-02..04` (program numbering continues from P1's `sdp-01`).
>
> **Builds on:** the shipped objective-media path — `prescription_attachments` storage + the `objective/` segment ([`prescription-attachment-service.ts`](../../../../../../../backend/src/services/prescription-attachment-service.ts) `createUploadUrl` / `AttachmentCategory`), the upload/thumbnail UI ([`ObjectiveMediaStrip.tsx`](../../../../../../../frontend/components/cockpit/rx/objective/ObjectiveMediaStrip.tsx)), the tag/filter helpers ([`objective-media.ts`](../../../../../../../frontend/lib/cockpit/objective-media.ts)), and the structured complaints with a stable per-card `id` ([`ComplaintCard.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/ComplaintCard.tsx), `PrescriptionComplaint.id`). **Reuse, do not fork.**
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). `sdp-02` (the `subjective` attachment category + `subjective/{complaintId}/` path segment + Zod + controller wiring) is **Opus** — it touches **storage + PHI media + the attachment RLS path** (verify-not-widen). `sdp-03` (the per-complaint photo strip — extract the shared uploader, mount in `ComplaintCard`, filter by `complaintId`) is **Sonnet** (UI over the shipped uploader). `sdp-04` (orphan/unpinned handling + read-only mode + a11y + verification close-gate) is **Sonnet**.
>
> **⚠️ Escalation note (agent contract):** `sdp-02` trips the "PHI media / RLS" hard rule → **run on Opus.** It adds **no** migration, column, or policy (reuses the shipped bucket + prescription-scoped policy), but the safety surface is Opus-grade. Keep ≤1 Opus task in this phase.
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p2-soap-data-placement-complaint-media.md`](./Tasks/EXECUTION-ORDER-p2-soap-data-placement-complaint-media.md).

---

## What Phase 2 does (one sentence)

> **Extend the shipped attachment path with a `subjective` category that pins a photo to a complaint via a `subjective/{complaintId}/` storage segment, render a compact per-complaint photo strip in the Subjective complaint card (reusing the objective uploader/thumbnail UI), and handle the unpinned/orphan case + read-only mode + a11y — with no new bucket/column/RLS/migration.**

---

## Scope

| Surface | Change | Mechanism | Task |
|---|---|---|---|
| Attachment category | `AttachmentCategory` `'objective'` → `'objective' \| 'subjective'`; `createUploadUrl` builds `subjective/{complaintId}/{uuid}-{file}` | service param + path segment | `sdp-02` |
| Upload-URL validation | `createUploadUrlBodySchema`: add `'subjective'` to the category enum + an optional `complaintId` (sanitized opaque segment) | Zod | `sdp-02` |
| Controller wiring | pass `category` + `complaintId` from `req.body` into `createUploadUrl` | controller orchestration only | `sdp-02` |
| RLS | **verify, do not widen** — the prescription-scoped policy covers the deeper path | review + note | `sdp-02` |
| Shared uploader | extract `ObjectiveMediaStrip`'s upload/thumbnail/remove logic into a reusable strip/hook | refactor (no behaviour change) | `sdp-03` |
| Subjective media lib | new `subjective-media.ts` (category const + `isSubjectiveAttachment` + `filterForComplaint(attachments, complaintId)`) mirroring `objective-media.ts` | pure helpers | `sdp-03` |
| Per-complaint strip | mount a compact "Photos" affordance in `ComplaintCard`, filtered by `complaintId` | UI | `sdp-03` |
| Orphan / unpinned | photo whose `complaintId` no longer matches a complaint surfaces in an "Other photos" fallback (non-destructive — never auto-deletes) | UI + filter | `sdp-04` |

**Out of scope:** removing/altering the Objective media strip; any schema/migration/new bucket/new policy; symptom-photo OCR/AI; the P3 results timeline.

---

## Decision lock (Phase 2 — freezes on promotion)

- **P2-D1 — complaint id lives in the storage path (`subjective/{complaintId}/`), not a new column.** Mirrors P5-D4's `objective/` segment; filtered client-side. Resolves SDP-D3's "how is the pin stored?" → **path segment, no FK/column.**
- **P2-D2 — `complaintId` is a sanitized opaque segment; the service does NOT verify it exists in the prescription's `complaints` JSONB.** Ownership is already enforced by the doctor-scoped prescription check; coupling the uploader to the complaints array buys nothing. Sanitize to `[a-zA-Z0-9-]` and treat as a folder name.
- **P2-D3 — orphan policy is non-destructive.** Deleting a complaint card (form state) never deletes its attachments. On reload, a photo whose `complaintId` matches no current complaint renders under an **"Other photos"** fallback in the Subjective area — the doctor can re-view or remove it explicitly. No cascade delete in a reducer.
- **P2-D4 — reuse the shipped uploader; one media model.** The per-complaint strip and `ObjectiveMediaStrip` share the same upload/thumbnail/remove logic over `prescription_attachments`; only the path segment + filter differ. No second uploader, no second bucket.
- **P2-D5 — additive only; read-only honored (SDP-D5).** `disabled` mode shows thumbnails with no add/remove; PHI-safe logs (never log file paths / signed URLs / complaint text).

---

## What this phase does NOT do (deferred)

| Item | Why / lands |
|---|---|
| New storage bucket / RLS policy / migration | P2-D1/D4 reuse the shipped `prescription_attachments` bucket + prescription-scoped policy. |
| Cascade-delete photos when a complaint is removed | P2-D3 — non-destructive; orphans surface in an "Other photos" fallback. |
| OCR / AI description of symptom photos | Compliance gate (SDP-D5 / subj-14 §4). |
| Per-complaint media on Objective findings | Objective media stays the section-level strip; this phase is Subjective-only. |

---

## Cross-cutting acceptance gate (whole phase)

Phase 2 is green only when **all** hold:

- [ ] A `subjective`-category upload writes to `subjective/{complaintId}/{uuid}-{file}`; the category enum + optional `complaintId` validate (Zod drops unknown keys; bad complaintId is sanitized/rejected cleanly); the legacy + `objective` paths are byte-identical. **No migration / column / bucket / policy added.** _(sdp-02)_
- [ ] The attachment RLS path is **verified unchanged** — the deeper `subjective/{complaintId}/` segment is covered by the existing prescription-scoped policy; no widening. _(sdp-02)_
- [ ] A per-complaint photo strip renders in `ComplaintCard`, filtered to that complaint's `id`; upload/thumbnail/remove reuse the shipped objective uploader logic (no forked second uploader). _(sdp-03)_
- [ ] Photos round-trip on reload (pinned to the right complaint); an orphan (complaintId matches no complaint) surfaces under "Other photos" and is never auto-deleted. _(sdp-04)_
- [ ] `disabled` (read-only) mode shows thumbnails with no add/remove; the strip + every control is keyboard + screen-reader operable; no PHI in logs. _(sdp-04)_
- [ ] `cd frontend && npx tsc --noEmit && npm run lint && npm test` clean for the slice; `cd backend && npm test` green (pre-existing unrelated failures routed, not introduced). _(sdp-04)_

---

## Phase plan position

| Phase | Scope | Status |
|---|---|---|
| P1 | Results consolidation (sdp-01) | ✅ Complete (2026-06-25) |
| **P2** | **Per-complaint symptom media (sdp-02..04)** | ✅ Complete (2026-06-25) |
| P3 | Investigations & results timeline (sdp-05..07) | 🚧 Committed |

---

## Tasks

| Task | Title | Size | Model |
|---|---|---|---|
| `sdp-02` | `subjective` attachment category + `subjective/{complaintId}/` path segment + Zod + controller wiring + RLS-not-widened verify | S–M | **Opus** (storage + PHI media + RLS) |
| `sdp-03` | Per-complaint photo strip: extract the shared uploader, `subjective-media.ts` helpers, mount in `ComplaintCard` filtered by `complaintId` | M | Sonnet |
| `sdp-04` | Orphan/unpinned "Other photos" fallback + read-only mode + a11y + verification close-gate | S–M | Sonnet |

---

## Cost estimate

| Wave | Tasks | Auto/Sonnet | Opus | Wall-clock |
|---|---|---|---|---|
| Wave 1 | sdp-02 (backend segment + Zod + controller + RLS verify) | 0 | 1 (storage/PHI/RLS) | ~2–3h |
| Wave 2 | sdp-03 (shared uploader + per-complaint strip) | 1 | 0 | ~3–4h |
| Wave 3 | sdp-04 (orphan + read-only + a11y + gate) | 1 | 0 | ~2–3h |
| **Total** | **3** | **2** | **1** | **~7–10h agent-time** |

**Caps check:** ≤1 Opus per wave ✓. **Phase Opus count = 1** (sdp-02) — within the ≤2/phase guideline.

---

## Sequencing notes

- **sdp-02 first (substrate).** The category + path segment + validation must land before the UI can request a `subjective/{complaintId}/` upload URL. Opus per the storage/PHI/RLS hard rule; bounded (reuse-not-widen, no migration).
- **sdp-03 next (UI).** Extract the shipped uploader once, then mount a compact per-complaint strip in `ComplaintCard`. Pure consumer of sdp-02's segment + the shipped attachment store.
- **sdp-04 last (edges + gate).** Orphan/unpinned fallback (non-destructive, P2-D3), read-only mode, a11y sweep, media round-trip, verification gate.

---

## References

- **Source:** [`Product plans/ehr/soap-data-placement/plan-soap-data-placement.md`](../../../../../Product%20plans/ehr/soap-data-placement/plan-soap-data-placement.md) — P2, `SDP-D3`.
- **Prior phase:** [`../p1-results-consolidation/`](../p1-results-consolidation/).
- **Pattern precedent:** Objective-tab P5 media (`obj-22`) — [`../../18-06-2026/objective-tab/p5-poc-results-media/`](../../../18-06-2026/objective-tab/p5-poc-results-media/).
- **Process:** [`PHASED-PLANS-GUIDE.md`](../../../../../process/PHASED-PLANS-GUIDE.md) · [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`CODE_CHANGE_RULES.md`](../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-06-25. **Status:** ✅ `Complete` (2026-06-25) — Phase 2 of the SOAP data-placement program; per-complaint symptom media shipped (implemented in a separate session). `subjective-media.ts` + the `['objective', 'subjective']` attachment category are live.
