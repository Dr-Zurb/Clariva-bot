# Plan p3 — Rx lifecycle: revise window

> **SUPERSEDED 2026-09-09.** Do not execute `rxl-11`…`18`. Replacement: [`../p3-same-day-revise/plan-p3-rx-lifecycle-same-day-revise-batch.md`](../p3-same-day-revise/plan-p3-rx-lifecycle-same-day-revise-batch.md) (`rxl-19`…`29`). Founder call: one slip per visit-day, Finish-only attest, revisions as new rows — no 15-minute in-place window and no snapshot PHI table.

## 31 Aug 2026 — Batch `rx-lifecycle` / `p3-revise-window` (`rxl-11..18`) — **XL, ~31h · Opus on store, snapshot, guard, PDF**

> **Status:** **SUPERSEDED.** Was drafted and blocked on the Phase 2 gate. Kept for history.
> **Product plan:** [`plan-rx-lifecycle.md`](../../../../../Product%20plans/plan-rx-lifecycle.md) (RXL-DL-1…12)
> **Program:** [`../README.md`](../README.md) · Prefix `rxl`
> **Exec order:** [`Tasks/EXECUTION-ORDER-p3-rx-lifecycle-revise-window.md`](./Tasks/EXECUTION-ORDER-p3-rx-lifecycle-revise-window.md)
> **Prior phases:** [`../p1-lock-integrity/`](../p1-lock-integrity/) · [`../p2-append-notes/`](../p2-append-notes/) — decision lock inherited. The attest stamp from `rxl-05` is what this phase measures from.
> **Not this sitting:** field-level value audit, amendment approval / co-sign, patient-visible revision history, retention worker changes.

---

## Why this phase

After Phase 2 the model is medico-legally sound and clinically annoying. An attested note is immutable, so the doctor who notices at 4:05 that they typed 500 mg instead of 50 mg cannot fix it — their only option is a second note that does not retract the wrong one.

This phase adds a 15-minute correction window and, in the same breath, the machinery that makes it safe: a snapshot of exactly what was issued, retention of the bytes that were handed over, and a mark on the face of any reprinted slip so a stale copy can be told from the current one.

Window and tracing ship together (RXL-DL-8). There is no interim build in which a post-attest edit is accepted but not captured.

---

## Decision lock (inherits the product plan)

RXL-DL-1…12 are locked. Do not re-litigate in a task file.

Phase 3 implements RXL-DL-7 (fixed 15-minute window, server-enforced), RXL-DL-9 (revision advances on finalize, not on save), RXL-DL-10 (issued bytes retained; freeze re-keyed to attest), RXL-DL-11 (system-rendered slip marker) and RXL-DL-12 (corrections supersede).

Two locks deserve restating because they are the ones an implementer will be tempted to soften:

- **RXL-DL-9.** The Rx autosave is debounced and fires continuously while typing. A revision counter driven by saves prints `Rev 47` after a minute's work. Revisions advance when the document is finalized — re-issued, or the window closing — never when it is saved.
- **RXL-DL-10.** Re-rendering an old revision from its stored payload is not acceptable. A later letterhead change would make it render differently from the paper that was handed over. The bytes are the record.

**Confirm before promote (recommended defaults in the product plan):**

| ID | Default | Owner |
|---|---|---|
| RXL-Q4 | Retain every revision's PDF; revisit only if volume shows otherwise | ⟨fill⟩ |
| RXL-Q6 | An in-window edit after a delivery prompts a reprint; never auto-resends | ⟨fill⟩ |

---

## Scope Guard — DO NOT TOUCH

- **T3-D2 is being reversed for attested prescriptions only.** Draft PDFs keep re-rendering and overwriting. Do not turn every draft print into a stored artifact.
- `appointments`, queue / OPD / pipeline / next-patient, `visit_payments` — untouched, as in Phase 2.
- Letterhead **design**, branding settings, page presets, background / header / footer image handling. `rxl-16` adds one line of system text beside the existing short id; it does not restyle the footer.
- `audit_logs` schema and the no-PHI policy on its metadata. Values live in revision snapshots, never in audit metadata.
- The patient share link and `/r/[id]` — no patient-visible revision history this phase.
- Retention / purge workers. More stored PDFs is a documented consequence, not a change to make here.
- `sent_to_patient_at` semantics — read it, re-key the freeze away from it, but do not change what sets it.
- Phase 1's lock gate module beyond swapping in the window condition.

---

## Tasks

| ID | Title | Size | Model |
|----|-------|------|-------|
| [`rxl-11`](./Tasks/task-rxl-11-revisions-migration.md) | Revision store + counter + supersede columns | L | **Opus** — new PHI table |
| [`rxl-12`](./Tasks/task-rxl-12-snapshot-and-revision-bump.md) | Snapshot on first post-attest edit; bump on finalize | L | **Opus** — the integrity mechanism |
| [`rxl-13`](./Tasks/task-rxl-13-window-guard.md) | Server-side 15-minute window | M | **Opus** — relaxes the Phase 2 guard |
| [`rxl-14`](./Tasks/task-rxl-14-window-ui.md) | Countdown, live expiry flip, pending-save flush | M | Sonnet |
| [`rxl-15`](./Tasks/task-rxl-15-pdf-freeze-and-retention.md) | Re-key the freeze to attest; retain bytes per revision | L | **Opus** — reverses a documented storage lock |
| [`rxl-16`](./Tasks/task-rxl-16-slip-edit-marker.md) | `Edited h:mm a · Rev N` in the PDF footer | S | Sonnet |
| [`rxl-17`](./Tasks/task-rxl-17-supersede-correction.md) | Supersede an issued note, reason required | M | Sonnet |
| [`rxl-18`](./Tasks/task-rxl-18-phase-3-gate.md) | Suites + docs + gate | M | Sonnet |

---

## Acceptance gate

- [ ] RXL-Q4 / RXL-Q6 recorded, or skipped in writing.
- [ ] Migration applies, re-applies as a no-op, reverse in-file. Snapshot table RLS deny-all / service-role, per the `223`–`225` house pattern.
- [ ] An edit at minute 14 is accepted. The same edit at minute 16 is refused **server-side**, with a client whose clock says minute 2.
- [ ] The window is measured from the attest stamp and does not roll forward on edits.
- [ ] The first post-attest edit writes exactly one snapshot of the issued state, including the issued PDF bytes. Subsequent in-window edits write no further snapshot.
- [ ] Typing continuously for two minutes inside the window produces `Rev 2`, not `Rev 47`.
- [ ] A revised prescription's reprint carries `Edited h:mm a · Rev N` in the footer. It survives a letterhead with a custom footer line, a footer banner, and `hideHaloCredit` set.
- [ ] The bytes issued at revision N remain retrievable after revision N+1 exists. No overwrite, no delete.
- [ ] A print-only prescription (null `sent_to_patient_at`) is frozen after attest, exactly as a sent one already was.
- [ ] A reprint of an unchanged attested note produces the identical stored artifact and creates no revision.
- [ ] The window closing while the chart is open flips the form read-only on its own, after flushing any pending save. No keystrokes lost at the boundary.
- [ ] A correction records what it supersedes and a required reason. History shows the superseded note as superseded, not deleted.
- [ ] No PHI in logs or audit metadata. Type-check + lint + suites green.

---

## Risk (phase)

Covered by the product-plan register. Phase-specific:

- **The expiry race is the subtle one.** The Rx autosave is debounced; a save triggered at 14:59 can arrive at 15:01. Without a flush-before-flip on the client and a skew tolerance on the server, the doctor loses their last keystrokes at exactly the moment they are trying to correct a dose.
- **`rxl-15` reverses a documented lock.** T3-D2 says "we never accumulate per-version PDFs" and three separate call sites build the storage path. Changing one and missing two produces a freeze that silently does not hold.
- **`rxl-13` deliberately weakens `rxl-06`.** It must weaken it by exactly 15 minutes and nothing else. Any ambiguity — unknown stamp, unreadable clock, missing snapshot — refuses the write.
- **Revision numbering is easy to get wrong in a way tests miss.** A suite that types once and asserts `Rev 2` passes under a per-save counter too. The test has to type repeatedly.

---

**Created:** 2026-08-31.
**Last Updated:** 2026-08-31 (drafted)
