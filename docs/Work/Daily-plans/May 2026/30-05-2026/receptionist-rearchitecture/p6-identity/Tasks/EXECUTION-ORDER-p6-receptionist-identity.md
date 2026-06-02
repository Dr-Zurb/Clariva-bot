# Execution order — Phase 6: per-doctor identity & consent (Instagram-first)

> Wave/lane matrix for **Phase 6** of [receptionist-rearchitecture](../plan-p6-receptionist-identity-batch.md). Phases 0–5 are done. Phase 6 fixes the structural loose end Phase 5 could only work around: today **one Instagram account maps to one global `patients` row across all clinics**, so consent is shared and rcp-24 had to firewall *history* at read-time. Phase 6 makes **identity itself per-doctor** — each clinic gets its own patient + consent record for the same follower. **Instagram-first by direction** (WhatsApp/cross-channel is explicitly deferred — see the future section). Same strangler discipline as Phases 2–5: a behavior-preserving seam (rcp-25), forward-only fix + reader sweep + lifecycle scoping (rcp-26..28), then a sensitive data-converging closer (rcp-29).

---

## Where Phase 5 left us (current state — verified in code)

| Concern | Today | Phase 6 target |
|---|---|---|
| **Patient identity** | global `patients (platform, platform_external_id)` UNIQUE, **no `doctor_id`** (`004` :30; `007`) | per-doctor rows: nullable `patients.doctor_id` + partial unique `(doctor_id, platform, platform_external_id)` |
| **Resolution** | `findOrCreatePlaceholderPatient(_doctorId,…)` ignores doctor, resolves global (`patient-service.ts:1111`) | `resolvePatientForChannelSender` — **conversation-first**, per-doctor create |
| **Conversations** | already per-doctor: `UNIQUE(doctor_id, platform, platform_conversation_id)` (`001`) ✅ | unchanged — this is why per-doctor rows are cheap |
| **Consent** | on the shared `patients` row; read only via `conversation.patient_id` (`consent-service.ts`, `booking-entry-ready-path.ts:36`) | per-doctor **for free** (row is now per-doctor); zero consumer change |
| **Revocation** | `handleRevocation` global; leaves `platform_external_id` intact (`consent-service.ts:138`) | scoped to the per-doctor row; clean re-grant |
| **Deletion scrub** | nulls `platform_external_id` **globally** (`account-deletion-pii-scrub.ts:104`) | scoped to the deleting doctor's row |
| **Notifications** | recipient via `appointment.patient_id` (per-doctor ✅) → doctor-scoped conversation → `appointment.conversation_id` | unchanged tiers; only the global PSID lookup retired |
| **Merge** | `mergePatients` doctor-scoped moves; **no tests** (`patient-service.ts:940`) | per-doctor merge + the missing test |

> **The gap is exclusively the `patients`/consent/identity layer.** Conversations already carry the per-doctor `(doctor, platform, sender) → patient_id` mapping — Phase 6 leans on that instead of building a new identity graph.

---

## Decision: per-doctor `patients` rows, resolved conversation-first — **not** a junction table

After mapping the live shape, the cost-aware call is **one `patients` row per (doctor, sender)**, with a nullable `patients.doctor_id` + partial unique index, resolved via the existing per-doctor conversation:

- **Consent comes along for free.** Consent is read **only** through `conversation.patient_id` (never `(doctor, patient)`). Make that row per-doctor and consent is per-doctor with **zero** changes to the ~6 consent read sites. A `patient_identities` junction with a shared clinical patient would force consent **off** the row into a `(doctor_id, patient_id)` table and rewrite every read — high churn, low marginal value.
- **It matches reality.** Patients are already doctor-scoped via appointments/conversations; there is **no** cross-doctor clinical sharing today. Per-doctor rows are also the more privacy-correct model (Dr B never sees Dr A's record).
- **Conversations do the addressing.** `UNIQUE(doctor_id, platform, platform_conversation_id)` already prevents per-doctor duplicates and maps the sender to a patient — resolution is conversation-first; `doctor_id` on the row is the enforcement + direct-lookup aid.

**Target (illustrative):**

```sql
ALTER TABLE patients ADD COLUMN doctor_id UUID REFERENCES auth.users(id);
CREATE UNIQUE INDEX patients_per_doctor_channel_identity
  ON patients (doctor_id, platform, platform_external_id)
  WHERE platform IS NOT NULL;        -- excludes book-for-other / manual rows (platform NULL)
-- legacy global UNIQUE(platform, platform_external_id) dropped only in rcp-29, after the split
```

---

## The migration safety mechanism (read this before any task)

Two invariants make this safe for in-flight conversations **and** non-DM readers (notifications, account deletion, merge):

1. **Forward-only first; converge last.** rcp-25 adds the schema + a **compat resolver** (conversation-first, falling back to the legacy global lookup for unmigrated rows). rcp-26 makes only **new** contacts per-doctor. Existing shared rows keep resolving via compat until **rcp-29** clones + re-points them. Partial deploys can't corrupt a row.
2. **Readers ready before duplicates exist.** A PSID may map to multiple rows only after rcp-26/29 — so the global `.single()` readers must be doctor-scoped **first** (rcp-27). The dangerous one is `findPatientByPlatformExternalId().single()`; the notification tiers already read by `appointment.patient_id` (per-doctor) so they stay correct.

rcp-29 is the only task that rewrites persisted data (clone shared rows, re-point FKs, drop the global index, retire the fallback).

---

## Gate model

Mostly behavior-preserving (a follower's experience with a *single* doctor is unchanged), so the floor is the usual **byte-identical** `dm-routing-golden` + `webhook-worker-characterization`. The *new* guarantees are isolation/correctness, pinned by mandatory tests:

- **Cross-doctor isolation** — same IG sender under two doctors ⇒ two rows, independent consent (rcp-26), independent revoke/scrub (rcp-28).
- **Non-DM coverage (mandatory)** — notifications, merge, account-deletion run outside the golden corpus; targeted tests are required (rcp-27/28), like rcp-16's rule.
- **Backfill load test** — real-shaped shared rows through the split with FK-integrity + isolation assertions (rcp-29), like rcp-19.

---

## Model policy (cost-aware — per the [efficiency guide](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md))

**No per-task Opus close-gates.** Execute on **Auto**; **Composer** for the rcp-25 migration/scaffold; escalate a *single message* to Opus only if a task stalls. The isolation + non-DM + backfill tests are the gate. The one **optional** Opus diff-skim is **rcp-29** (it rewrites persisted PHI + is the cross-tenant surface).

| Wave | Task | Title | Size | Model | Depends on |
|---|---|---|---|---|---|
| 6 | [rcp-25](./task-rcp-25-perdoctor-identity-seam.md) | Per-doctor identity resolution seam (compat scaffold) | M | **Composer/Auto** | Phase 5 |
| 6 | [rcp-26](./task-rcp-26-perdoctor-placeholder-new-contacts.md) | Per-doctor placeholder creation (isolate new contacts) | M | **Auto** | rcp-25 |
| 6 | [rcp-27](./task-rcp-27-doctor-scoped-identity-readers.md) | Doctor-scope the global PSID readers (notifications + search) | M | **Auto** | rcp-25 |
| 6 | [rcp-28](./task-rcp-28-perdoctor-consent-lifecycle.md) | Per-doctor consent lifecycle (revocation · deletion · merge) | M | **Auto** | rcp-26 |
| 6 | [rcp-29](./task-rcp-29-identity-backfill-converge.md) | Split shared rows, backfill, drop the global index (closer) | M–L | **Auto** (optional 1 Opus diff-skim) | rcp-25..28 |

**Order:** rcp-25 first (seam + schema). rcp-26 and rcp-27 are independent (forward-fix vs reader-sweep) — either order, but **both must precede rcp-29** (the backfill creates the duplicates they handle). rcp-28 depends on rcp-26 (needs per-doctor rows to scope lifecycle). rcp-29 last.

---

## Identity-migration playbook (shared recipe)

1. **Resolve through the seam.** All sender→patient resolution goes through `resolvePatientForChannelSender` (rcp-25); never re-introduce a global `(platform, external_id)` lookup as a resolution path.
2. **Lean on conversations.** The per-doctor mapping already exists in `conversations`; use `conversation.patient_id` rather than inventing identity logic in a stage/service.
3. **Doctor-scope every write.** Consent grant/revoke, deletion scrub, and merge act on the **per-doctor** row (`conversation.patient_id`), scoped by `doctor_id` — never a global update.
4. **Bias to re-ask over re-use.** When in doubt at a boundary (backfill consent copy, revoke re-grant), default to `pending` and re-run consent — the safe failure (DL-2/DL-7).
5. **Cover the non-DM paths.** Notifications, merge, account-deletion aren't in the golden corpus — add targeted tests for each touched site.
6. **Gate:** `dm-routing-golden` + `webhook-worker-characterization` byte-identical + the isolation/non-DM/backfill tests for the task; `npx tsc --noEmit` clean.

> **PHI/consent note (DL-6/DL-7):** Phase 6 **moves and scopes** identity/consent; it must not widen PHI or copy a consent grant a patient didn't give to a second clinic. Book-for-other rows (`platform=null`, `createPatientForBooking`) are outside the PSID-sharing problem — don't touch them.

---

## Definition of done for Phase 6

- `patients` carries `doctor_id`; identity is unique per `(doctor_id, platform, platform_external_id)`; the global `(platform, external_id)` unique index is gone.
- Sender→patient resolution is conversation-first + per-doctor create (no global lookup path remains); the same IG follower under two clinics has **independent** patient + consent + revoke + deletion.
- Notifications, merge, and account-deletion are doctor-scoped and covered by targeted tests; `mergePatients` finally has tests.
- Existing rows converged via an idempotent, dry-run-verified split (rcp-29); golden + characterization byte-identical across the phase.

---

## Future (explicitly after Instagram is complete — *not* built here)

Ordered to honor **Instagram-first, WhatsApp-last**:

- **Phase 7 — Instagram depth.** (a) **Comment → engine conversation:** route the first high-intent comment-triggered DM through `runConversationTurn` (today it's a templated pipeline — see the Phase 3 execution-order doc's "Comment → engine" section). (b) **Proactive reactivation:** "it's been a while — book a follow-up?" nudges within consent + the IG 24-hour messaging window, building on Phase 5 returning-memory.
- **Phase 8 — Cross-channel.** Take the WhatsApp stub (rcp-13) live and unify returning-patient recognition across channels — now clean, because per-doctor identity (Phase 6) gives WhatsApp a correct `(doctor, channel, sender)` model to plug into instead of the old global PSID.
