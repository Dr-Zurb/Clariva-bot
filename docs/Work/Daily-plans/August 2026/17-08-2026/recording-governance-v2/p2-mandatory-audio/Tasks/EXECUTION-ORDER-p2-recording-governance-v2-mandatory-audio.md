# EXECUTION ORDER — p2 recording-governance-v2 mandatory audio

> Sibling document of [`plan-p2-recording-governance-v2-mandatory-audio-batch.md`](../plan-p2-recording-governance-v2-mandatory-audio-batch.md). The plan covers what and why; this doc covers who-runs-what-when and which model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

> 🚧 **Production promotion is blocked on REC-D2** (counsel sign-off on the DPDP necessity basis, owner-approved disclosure copy, owner-approved policy version string). Every wave below may merge to `main`. **None may reach production until Wave 5 §6 is complete.** See the batch plan's blocker section.

---

## Wave plan

```
Wave 1 (Migration — ~1.5h, single lane sequential):
  Lane α  ──── rec-07 (S, Opus)                                  [DB only]

Wave 2 (Retire the ask — ~5h, 2 parallel lanes):
  Lane α  ──── rec-08 (M, Sonnet)                                [frontend only]
  Lane β  ──── rec-09 (L, Opus)                                  [backend only]

Wave 3 (Remove the gates — ~5h, single lane sequential):
  Lane α  ──── (waits on rec-08 + rec-09) ──> rec-10 (L, Sonnet)

Wave 4 (Attestation — ~5h, single lane sequential):
  Lane α  ──── (waits on rec-07 + rec-10) ──> rec-11 (L, Sonnet)

Wave 5 (Close — ~2h agent + owner turnaround):
  Lane α  ──── rec-12 (S, Composer / Founder)
```

**Total wall-clock with parallelism:** ~18.5h (~3 dev-days, matching the batch plan's L sizing).
**Total agent-time (sequential equivalent):** ~21.5h.

The critical path is Wave 2 Lane β → Wave 3 → Wave 4, and it is genuinely sequential: rec-10 cannot delete `constants/recording-consent.ts` until rec-09 has removed `dm-copy.ts`'s import of it, and rec-11 edits the post-rec-10 versions of `consultation-controller.ts` and `utils/validation.ts`.

**Wave 1 is independent of Wave 2** — rec-07 touches only `backend/migrations/`, one new type and one new test, and its sole consumer is rec-11 in Wave 4. If you want the wall-clock back, run it as a third lane alongside Wave 2 rather than ahead of it. It is sequenced first here because it is the Opus task with the least context to hold, and getting the table locked early removes the only schema unknown from the phase.

---

## 🔗 Release coupling — Wave 2 and Wave 3 ship together

**Do not promote Wave 2 to production without Wave 3.**

`snapshot-storage-service.ts:642` denies a patient snapshot unless `consent.decision === true`. Once rec-08 and rec-09 stop writing consent, every new appointment carries `decision = null`, so **every patient snapshot attempt returns `ForbiddenError`** — pointing at a consent banner that rec-10 has not deleted yet. The window opens the moment Wave 2 merges and closes when Wave 3 lands.

This is a widening of an existing gap rather than a new bug (reschedules and non-DM bookings already sit at `null` and already fail), but it goes from an edge case to universal for new bookings. rec-10 carries the full detail under *Ordering hazard*.

Practical consequence: treat Waves 2 and 3 as one release unit. If they must be split, Wave 2 goes behind a flag or waits.

---

## Lane-by-lane details

### Wave 1 — Migration (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | rec-07 | S | **Opus** | `MIGRATIONS_AND_CHANGE.md`, `183_doctor_verification.sql`, `053_appointments_recording_consent.sql`, the live migrations head, charter REC-D4 + §Migration budget | **Re-derive the migration number** from the live folder; budget is 196, head at planning was `195_appointment_start_notify_stamp.sql`. RLS enabled, **zero policies**. An `auth.uid()` policy is a hard stop. |

### Wave 2 — Retire the ask (2 parallel lanes)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | rec-08 | M | Sonnet | `app/book/page.tsx`, both consent components, `frontend/lib/api.ts` L1466–1508, charter REC-D1/REC-D2 | **Frontend only.** Must not open any `backend/` file. Leave `getRecordingConsentForSession` for rec-10. |
| 0 | rec-09 | L | **Opus** | `types/conversation.ts` L140–212, `conversation-state-io.ts` L155–303, `booking-funnel.ts` L375–403 + L469–512, `handle-turn.ts` L77, batch plan REC2-D6/D7 | **Backend only.** Land the fold-forward alias **before** removing the step. Remove **both** injector call sites. |

**Lane gate:** the two lanes are file-disjoint by construction — rec-08 is `frontend/` only, rec-09 is `backend/` only, and each task's Scope Guard forbids crossing. Neither consumes the other's output, and both are ~3–5h. Safe to run in separate worktrees. If you would rather stay single-threaded, run rec-09 first: it is the longer task and the one on the critical path.

### Wave 3 — Remove the gates (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | rec-10 | L | Sonnet | `recording-consent-service.ts` (whole, before deleting), the four gate sites, both controllers, both route files, `validation.ts` L490–525 | Hard deps on **both** Wave 2 tasks. Widest task in the phase: 4 deletions, 13 edits, 2 public endpoints removed. Run typecheck after each gate, not at the end. |

### Wave 4 — Attestation (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | rec-11 | L | Sonnet | rec-07 **as merged** (table + type + derived number), `doctor-verification-service.ts`, `consultation-controller.ts` L120–200, `ConsultationLauncher.tsx` L240–275 + L750–800, charter §Attestation | Six clauses **verbatim**. Version string is **owner-supplied** — do not invent one. Gate is server-side in `startConsultationHandler`; the checklist is skippable by design. |

### Wave 5 — Close (single lane, agent + founder)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | rec-12 | S | Composer / **Founder** | Batch plan gate + blocker section, charter §Success metrics #2 + §Reversals, all five siblings' Notes, April Plan 02 (whole) | Zero-line source diff expected. Owns the **REC-D2 production gate** and metric #2. Will not close while any gate item is unticked. |

---

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| rec-07 | S | **Opus** | New migration — hard-rules list in `.cursor/rules/00-agent-contract.mdc`. Mandatory, not a judgement call. Auto must not write it. |
| rec-08 | M | Sonnet | Bounded frontend removal plus one static copy block. No new primitive. |
| rec-09 | L | **Opus** | Removes a **persisted** conversation-state namespace and a member of a closed step union that live rows hold. Get the fold-forward wrong and real patients are stranded mid-booking — a data-correctness failure that neither typecheck nor lint catches. |
| rec-10 | L | Sonnet | Large but mechanical. Every call site enumerated and verified; REC2-D8 already settles the one open question. Volume, not reasoning. |
| rec-11 | L | Sonnet | Service + endpoint + UI over a table rec-07 already locked, following the `doctor-verification` precedent. Contracts are fixed upstream. |
| rec-12 | S | Composer / **Founder** | Verification, sweeps and doc sync are mechanical; sign-off, copy approval and the metric read are not delegable. |

**Two Opus tasks — at the ≤2 cap.** rec-07 is mandatory (migration). rec-09 earns the second on persisted-state risk. If a third task starts to feel like it wants Opus, that is a signal to re-scope it, not to raise the cap.

---

## Acceptance gates per wave

**Wave 1**

- [ ] Exactly one new file in `backend/migrations/`, its number re-derived from the live head.
- [ ] Table is append-only per `(doctor_id, policy_version)`; keyed on `auth.users(id)` with `ON DELETE CASCADE`.
- [ ] RLS enabled with **zero policies**; no `auth.uid()` or `auth.jwt()` expression anywhere in the file.
- [ ] No IP, user-agent or free-text column (REC2-D3).
- [ ] `053` and `049` byte-identical. Backend typecheck + lint + tests green.
- [ ] The derived migration number is written into rec-07's Notes.

**Wave 2**

- [ ] Wave 1 gates still green.
- [ ] `rg "RecordingConsentCheckbox|RecordingConsentRePitchModal" frontend/` → zero; both files off disk.
- [ ] `/book` shows a non-interactive disclosure; reschedule mode unchanged; payment redirect and queue flow unchanged.
- [ ] A conversation persisted at `step: 'recording_consent'` hydrates to `awaiting_slot_selection`, **not** `responded` — proven by a test over the legacy fixture.
- [ ] `applyRecordingConsentDetourIfNeeded` and **both** call sites are gone; the stage branch, both predicates' clauses and the state namespace are gone.
- [ ] The DM booking confirmation carries the disclosure as one English-only `enByPolicy` family.
- [ ] Draft copy markers naming REC-D2 are present on both surfaces. **No migration in either lane.**

**Wave 3**

- [ ] Wave 2 gates still green.
- [ ] Transcription enqueues and a **patient** stores a snapshot for `decision = false` **and** `decision = null`.
- [ ] Both HTTP endpoints 404; the Zod schema, `recording-consent-service.ts` and `constants/recording-consent.ts` are gone.
- [ ] `SessionStartBanner.tsx` off disk; `rg "SessionStartBanner" frontend/` → zero, doc-comments included.
- [ ] `not-recorded` survives only on artifact grounds, never consent grounds.
- [ ] All four retained consent columns still exist. No migration.

**Wave 4**

- [ ] Wave 3 gates still green.
- [ ] A doctor with no attestation row for the active version cannot start a consult — blocked **server-side**, not only in the UI. An older-version row does not satisfy it.
- [ ] The six clauses render verbatim from the charter, pinned by a test.
- [ ] Double-accept leaves exactly one row with its original `accepted_at`.
- [ ] A patient is never blocked by a doctor's missing attestation.
- [ ] Zero new migrations; no RLS policy; no `auth.uid()` expression.

**Wave 5**

- [ ] All Wave 4 gates still green.
- [ ] Both workspaces green; exactly one migration across the whole phase; no dropped column; PHI sweep clean.
- [ ] Charter metric #2 measured **with its pre-phase baseline stated alongside** and written into the program README's Runs section.
- [ ] Video consent verified unchanged (REC2-D9).
- [ ] April Plan 02 carries superseded markers with its history intact.
- [ ] **REC-D2: counsel sign-off recorded, owner-approved copy live, owner-approved version string in place, no draft marker anywhere.** Production promotion only after this line.

---

## Cost estimate

| Wave | Tasks | Sonnet chats | Opus chats | Other | Wall-clock |
|---|---|---|---|---|---|
| 1 | rec-07 | 0 | 1 | — | ~1.5h |
| 2 | rec-08, rec-09 | 1 | 1 | — | ~5h (parallel) |
| 3 | rec-10 | 1 | 0 | — | ~5h |
| 4 | rec-11 | 1 | 0 | — | ~5h |
| 5 | rec-12 | 0 | 0 | 1 Composer + founder | ~2h + owner turnaround |

**Totals:** 3 Sonnet chats, 2 Opus chats, 1 Composer chat. ~18.5h wall-clock.

**Fresh chat per task.** Pre-load the task file + [charter](../../plan-recording-governance-v2-charter.md) decision lock + [batch plan](../plan-p2-recording-governance-v2-mandatory-audio-batch.md) REC2-D1…D9 and blocker section + the source files listed in that task's *Model & execution guidance*.

---

## Hard stops — any wave

Stop and surface rather than proceeding:

- **A second migration.** REC2-D1 gives the phase exactly one, and rec-07 has it.
- **Any RLS policy, or any `auth.uid()` / `auth.jwt()` expression.** REC2-D4.
- **Any column drop** — `appointments.recording_consent_*` (053) and `consultation_sessions.recording_consent_at_book` (049) all stay (REC-D3 / REC2-D5).
- **An agent-authored DPDP basis, disclosure wording, or policy version string.** REC-D2 — the one decision in this phase an agent must not resolve.
- **A change to Twilio recording rules, room create, or `twilio-recording-rules.ts`.** The always-on audio path is already correct; this phase removes the false promise, not the recording.
- **Any change to video consent** — `VideoConsentModal.tsx`, `VideoRecordingIndicator.tsx`, `recording-escalation-service.ts`. Video consent **survives** (REC2-D9); only audio consent is retired.
- **A backfill script or one-off worker** to rewrite live conversation rows. REC2-D6's fold-forward is a read-time alias.
- **A file edit outside a task's enumerated Scope Guard.** Each enumeration is the cross-layer surfacing `.cursor/rules/00-agent-contract.mdc` requires, pre-approved at planning time. Outside it is a stop, not an expansion.
- **Removing an authorization check while removing a consent check** — the snapshot and banner paths interleave the two.
- **Promoting to production with an unticked REC-D2 item.** The only irreversible action in the phase.

---

## References

- [Batch plan](../plan-p2-recording-governance-v2-mandatory-audio-batch.md) · [Charter](../../plan-recording-governance-v2-charter.md) · [Program README](../../README.md)
- [p1 exec order](../../p1-artifact-registry/Tasks/EXECUTION-ORDER-p1-recording-governance-v2-artifact-registry.md)
- [EXECUTION-ORDER-GUIDELINES.md](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) — wave/lane notation, model caps
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) — governs every task in this removal-heavy phase
- [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md) — the gate rec-12 runs
- `.cursor/rules/00-agent-contract.mdc` — migrations, RLS, cross-layer stop-and-surface
