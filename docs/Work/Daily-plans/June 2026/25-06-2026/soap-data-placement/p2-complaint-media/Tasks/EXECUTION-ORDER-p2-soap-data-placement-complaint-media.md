# SOAP data placement — Phase 2: per-complaint symptom media — execution order

> Sibling of [`plan-p2-soap-data-placement-complaint-media-batch.md`](../plan-p2-soap-data-placement-complaint-media-batch.md). Plan = what + why; this = who-runs-what-when + model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

> **Shape:** `sdp-02` is the substrate — the `subjective` category + `subjective/{complaintId}/` path segment + Zod + controller wiring + the RLS-not-widened verify. It must land first; the UI needs the segment before it can request a subjective upload URL. `sdp-03` extracts the shared uploader once and mounts the per-complaint strip. `sdp-04` closes the orphan/read-only/a11y/round-trip gate. Linear chain.

---

## Wave plan (3 waves)

```
Wave 1 (substrate — ~2–3h):
  sdp-02 (subjective category + subjective/{complaintId}/ segment
          + Zod + controller wiring + RLS-not-widened verify)
        │
        ▼
Wave 2 (~3–4h):
  sdp-03 (extract shared uploader + subjective-media.ts helpers
          + per-complaint photo strip in ComplaintCard, filtered by complaintId)
        │
        ▼
Wave 3 (~2–3h):
  sdp-04 ("Other photos" orphan fallback + read-only mode
          + a11y + media round-trip + verification gate)
```

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| W1.0 | **sdp-02** | S–M | **Opus** | `prescription-attachment-service.ts` (`AttachmentCategory`, `createUploadUrl` path build, ownership check); `validation.ts` (`ATTACHMENT_CATEGORY_VALUES`, `createUploadUrlBodySchema`); `prescription-controller.ts` (`createUploadUrlHandler` — passes `category`); `026_prescriptions.sql` (the prescription-scoped storage policy to verify covers the deeper path) | Add `'subjective'` to `AttachmentCategory` + the Zod enum; add optional sanitized `complaintId`; `createUploadUrl` builds `subjective/{complaintId}/{uuid}-{file}`; controller passes `category`+`complaintId`. **No migration / column / bucket / policy.** Verify (don't widen) RLS. Opus per storage/PHI/RLS. |
| W2.0 | sdp-03 | M | Sonnet | sdp-02's segment; `ObjectiveMediaStrip.tsx` (upload/thumbnail/remove to extract); `objective-media.ts` (helpers to mirror); `lib/api.ts` `getPrescriptionUploadUrl` (`category`/`complaintId` body); `ComplaintCard.tsx` (mount point) + `PrescriptionComplaint.id` | Extract the shared uploader (strip/hook) so Objective + per-complaint reuse it; new `subjective-media.ts` (`isSubjectiveAttachment`/`filterForComplaint`); mount a compact "Photos" affordance per complaint card, filtered by `complaintId`. UI over the shipped uploader. |
| W3.0 | sdp-04 | S–M | Sonnet | sdp-03's strip; the attachment store on the form shell; existing media tests to mirror | "Other photos" non-destructive orphan fallback (complaintId matches no complaint); read-only mode (thumbnails, no add/remove); a11y sweep; media round-trip on reload; `tsc`/lint/test gate (FE + BE). |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| sdp-02 | S–M | **Opus** | Storage + PHI media + the attachment RLS path. Reuse-not-widen (no migration/column/policy) keeps it bounded, but the safety surface is Opus-grade — same posture as objective-tab `obj-22`. |
| sdp-03 | M | Sonnet | UI over the shipped uploader; extract-and-mount; no schema/safety risk. |
| sdp-04 | S–M | Sonnet | Orphan UX + read-only + a11y + frontend tests; low blast radius. The RLS-not-widened proof lives in sdp-02. |

**Caps check:** ≤1 Opus per wave ✓. **Phase Opus count = 1** (sdp-02).

---

## Acceptance gate

See the [batch plan's cross-cutting gate](../plan-p2-soap-data-placement-complaint-media-batch.md#cross-cutting-acceptance-gate-whole-phase).

---

## References

- Batch plan: [`plan-p2-soap-data-placement-complaint-media-batch.md`](../plan-p2-soap-data-placement-complaint-media-batch.md).
- Tasks: [`task-sdp-02-…`](./task-sdp-02-subjective-attachment-segment.md) · [`task-sdp-03-…`](./task-sdp-03-per-complaint-photo-strip.md) · [`task-sdp-04-…`](./task-sdp-04-orphan-readonly-a11y-close-gate.md).
- Pattern precedent: objective-tab `obj-22` [`task-obj-22-…`](../../../18-06-2026/objective-tab/p5-poc-results-media/Tasks/task-obj-22-objective-media-attachments.md).
- Process: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-06-25. **Status:** ✅ `Complete` (2026-06-25) — implemented in a separate session.
