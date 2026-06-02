# Execution order — Phase 5: returning-patient memory

> Wave/lane matrix for **Phase 5** of [receptionist-rearchitecture](../plan-p5-receptionist-returning-memory-batch.md). Phases 0–4 are done. Phase 5 makes the bot recognize a **returning patient** within PHI rules (DL-12): a warm, truthful **"welcome back"** and **skip re-collecting** what's already on file — booked off the identity/patient layer the earlier phases were designed to slot into. Unlike Phases 0–4 (behavior-preserving refactors), **Phase 5 changes behavior** — so the gate model changes too (see below). Same strangler discipline: a dormant seam first (rcp-20), then one consumer per PR, then a privacy/flag-flip closer (rcp-24).

---

## Where Phase 4 left us (current state — verified in code)

| Concern | Today | Phase 5 target |
|---|---|---|
| **Identity** | `patients` row keyed by `(platform, platform_external_id)` (IG PSID); consent on `patients.consent_status` (`database.ts:354`) | unchanged — Phase 5 *reads* it; no new tables |
| **Returning detection** | none explicit; only `hasPatientReady` (name+phone+consent) on the `book_responded` branch (`booking-entry.ts:431`–`:536`) | a PHI-safe, doctor-scoped `ReturningPatientProfile` on `DmTurnContext` |
| **Greeting** | always cold; AI welcome via `idle-fee-triage.ts:559`–`:590` (`greetingFastPath` is hard-`false`) | "welcome back" for consented returnees (rcp-21) |
| **First book turn** | `justStartingCollection` always re-asks everything (`booking-entry.ts:347`–`:410` → `getInitialCollectionStep()`) | skip demographics for known+consented (rcp-22) |
| **Prior-visit source** | `listAppointmentsForPatient(patientId, doctorId)` — **already doctor-scoped** (`appointment-service.ts:762`) | the safe read for attended count / last service / recency |
| **Visit reason** | always per-appointment; collected fresh | still collected fresh; optional follow-up *offer* (rcp-23) |
| **Cross-conversation memory** | one eternal conversation row per (doctor, sender); `metadata` is per-conversation; Redis pre-consent is 1 h TTL | recall comes from `patients`/`appointments` on read, not metadata |

> **Structural hazard to respect:** `patients.platform_external_id` is **global** (no `doctor_id` filter in `findPatientByPlatformExternalId`). The patient row + consent are shared across clinics for one IG account; **visit history must stay doctor-scoped** via the appointment query. This is the single thing rcp-24 exists to pin.

---

## Decision: read-layer + recognition + UX on the existing identity — **not** a new memory store

Phase 5 is deliberately **not** a new "patient memory" table or an identity-graph rewrite. After looking at the live shape:

- The durable facts already exist — consent on the `patients` row, attended visits in `appointments` (doctor-scoped query in hand). What's missing is a **recognition read** + the **UX** that uses it.
- A new persisted memory store would trip the efficiency guide's "new migration = hard rule" and add a PHI surface to defend — for marginal benefit over reading `patients`/`appointments` on demand.
- So: a dormant **profile seam** (rcp-20), three thin **consumers** (rcp-21 greeting, rcp-22 skip, rcp-23 follow-up), and a **privacy/flag closer** (rcp-24). All behind `RETURNING_PATIENT_MEMORY_ENABLED` (default off), flipped only after the isolation + consent gates pass.

---

## The PHI & privacy safety mechanism (read this before any task)

Four invariants make a behavior-changing, PHI-adjacent phase safe:

1. **The profile is PHI-free.** `ReturningPatientProfile` carries enums/booleans/opaque keys/timestamps only — `isReturning`, `hasGrantedConsent`, `knownFieldKeys` (names), `lastServiceKey` (opaque), `recencyBucket`. **No** name/phone/email/free-text reason. Names are read from the `patients` row at **compose-time** for outbound copy only (channel delivery), never into metadata, the model context, logs, or audit (DL-6; `validateNoPHI` `audit-logger.ts:35`).
2. **Visit history is doctor-scoped.** Only ever via `listAppointmentsForPatient(patientId, doctorId)`. The shared global patient row may carry consent, but it must never carry one clinic's visits into another. rcp-24's isolation test is the firewall.
3. **Consent gates recall, every turn.** Welcome-back / skip / follow-up fire only when `consent_status === 'granted'`, re-read per turn (revoke mid-thread ⇒ memory off next turn). Deterministic facts (DL-4) come from composers/DB; the model only re-tones a structured, redacted hint.
4. **The flag is the off-switch.** Everything ships dark; flag-off is byte-identical to pre-Phase-5. The closer flips it after the gates pass; flipping back is the instant, total revert.

---

## Gate model (this phase changes behavior — so the gate is two-sided)

Phases 0–4 were pinned by "golden + characterization **byte-identical**." Phase 5 *intends* to change replies, so:

- **Non-returning / flag-off path:** existing `dm-routing-golden` + `webhook-worker-characterization` stay **byte-identical** (regression floor).
- **Returning path:** **new** golden fixtures (`tests/fixtures/dm-transcripts/returning-*.json`) pin the new behavior.
- **Mandatory privacy gates (rcp-24):** cross-tenant **isolation** + consent-**revocation** suppression tests — non-negotiable, like rcp-16's "non-DM coverage is mandatory" and rcp-19's load test.

---

## Model policy (cost-aware — per the [efficiency guide](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md))

**No per-task Opus close-gates.** Execute on **Auto**; **Composer** for the rcp-20 scaffold/types; escalate a *single message* to Opus only if a task stalls. The fixtures + isolation/consent tests are the gate. The one **optional** Opus diff-skim is **rcp-24** (privacy/cross-tenant surface) — or just rely on the isolation + revocation tests.

| Wave | Task | Title | Size | Model | Depends on |
|---|---|---|---|---|---|
| 5 | [rcp-20](./task-rcp-20-returning-patient-profile-seam.md) | Returning-patient profile read seam (dormant scaffold) | M | **Composer/Auto** | Phase 4 |
| 5 | [rcp-21](./task-rcp-21-welcome-back-greeting.md) | "Welcome back" greeting + structured returning hint | M | **Auto** | rcp-20 |
| 5 | [rcp-22](./task-rcp-22-skip-recollection-known-patient.md) | Skip re-collection for a known, consented returning patient | L | **Auto** | rcp-20 |
| 5 | [rcp-23](./task-rcp-23-returning-aware-triage-prefill.md) | Returning-aware triage — follow-up service pre-fill (richer; deferrable) | M–L | **Auto** | rcp-20 |
| 5 | [rcp-24](./task-rcp-24-returning-memory-privacy-closer.md) | Privacy/identity-scoping hardening + audit + flag flip (closer) | M | **Auto** (optional 1 Opus diff-skim) | rcp-21, rcp-22, rcp-23 |

**Order:** rcp-20 first (everything consumes the profile). rcp-21/22/23 are independent of each other (disjoint surfaces: greeting / booking entry / service-match) — do them in any order; **rcp-21 first** is recommended as the smallest, safest proof. rcp-24 is last. If the phase needs trimming, **rcp-23 is the deferrable slice** — rcp-20/21/22/24 deliver the headline wins.

---

## Returning-memory playbook (shared recipe — every consumer task follows this)

1. **Read the profile off the context** (`ctx.returningProfile`); never re-query identity inside a stage. Gate on `RETURNING_PATIENT_MEMORY_ENABLED` **and** `isReturning` **and** `hasGrantedConsent`.
2. **Deterministic facts, model re-tones only (DL-4).** Any factual claim ("welcome back, <name>", "follow-up for <service>?") is assembled by a composer / catalog lookup from DB. The model receives a **structured, redacted hint** (mirror `collectedDataSummary` / `idleDialogueHint`, `run-conversation-turn.ts:171`–`:175`) and only adjusts tone — it never states visit facts itself.
3. **PHI stays out of metadata/logs/audit.** `collectedFields` and hints are **names/keys/enums only**; real name/phone surface only in outbound copy. No new PHI key in `conversations.metadata`.
4. **Reuse, don't fork.** Use the existing centralized paths (`hasPatientReady` ready-path, `applyFinalCatalogServiceSelection`, the staff-review gate) so confidence/consent/SLA semantics stay identical.
5. **Pin both sides.** Add a returning-path golden fixture **and** prove the non-returning / flag-off path is byte-identical. Add an audit assertion where the task emits an event.
6. **Gate:** `dm-routing-golden` + `webhook-worker-characterization` (non-returning byte-identical) + new returning fixtures + any non-DM/targeted test the task touches; `npx tsc --noEmit` clean.

> **PHI note (DL-6):** Phase 5 must **not widen** the existing metadata PHI footprint (`booking.reasonForVisit`, `booking.extraNotes`, `clarification.*`). No `patientName` / `lastVisitSummary` / chief-complaint keys in metadata, logs, or audit — long-term recall reads from `patients`/`appointments` with consent, on demand.

---

## Definition of done for Phase 5

- A consented returning patient is greeted with a truthful **welcome back** (rcp-21) and **never re-types** name/phone/age/gender to book (rcp-22); optionally offered a **follow-up** shortcut for their last service (rcp-23).
- Recognition is **doctor-scoped** and **consent-gated**; revoked/pending consent ⇒ treated as new; cross-tenant isolation + revocation tests green (rcp-24).
- `ReturningPatientProfile` is PHI-free; no new PHI key entered `conversations.metadata`/logs/audit (grep-clean); audit events are enum/opaque only.
- `RETURNING_PATIENT_MEMORY_ENABLED` flipped after the gates pass; flag-off is byte-identical to pre-Phase-5; non-returning golden + characterization unchanged across the phase.

---

## Staged rollout (rcp-24 — post-gate)

| Stage | `RETURNING_PATIENT_MEMORY_ENABLED` | Notes |
|---|---|---|
| **Dev** | `true` | Flip after isolation + consent + audit tests green (this closer). |
| **Canary** | `true` on one doctor / staging IG app | Watch audit for `returning_patient_recognized` / `collection_skipped`; spot-check welcome-back + skip. |
| **Production** | `true` | Full rollout once canary is clean. |
| **Instant revert** | `false` | Total off-switch — zero DB reads, byte-identical to pre-Phase-5. No migration rollback needed. |

**Privacy firewall (do not skip):** visit history only via `listAppointmentsForPatient(patientId, doctorId)`. Shared global patient row carries consent, not cross-clinic visits.

---

## Phase 6+ (future — not built here)

- **Returning memory across channels.** Once WhatsApp goes live (Phase 3 stub → live), unify recognition so a patient known on Instagram is recognized on WhatsApp — needs a per-doctor identity link, not the global `platform_external_id`.
- **Per-doctor identity scoping.** Resolve the global-`platform_external_id` gap structurally (a `(doctor_id, channel, sender)` ↔ patient link) so consent itself can be per-clinic. rcp-24 only firewalls *history*; this would firewall *identity*.
- **Proactive recall / reactivation.** "It's been a while since your last visit — book a follow-up?" nudges, within consent + messaging-window rules.
