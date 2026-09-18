# Recording archival activation runbook

**Owner of the flip:** founder (Dr Abhishek Sahil).  
**Abort authority:** the same person. Anyone on-call may set the flag back to `false`; they must page the owner.  
**Do not flip until every precondition in §4 is recorded as met.** This document is the ritual. It is not permission.

Related: rec-31 (Twilio-reaching delete), rec-32 (patient erasure uses the same flag), rec-33 (this ritual), `backend/migrations/058_regulatory_retention_policy_seed.sql`.

---

## 1. What the flag gates

Env var: `ARCHIVAL_HARD_DELETE_ENABLED`  
Default in `backend/src/config/env.ts`: **`'false'`**. Do not change that default in code.

When the value is anything other than the string `true`, it is treated as off.

| Surface | Flag off (`false`) | Flag on (`true`) |
|---|---|---|
| Nightly hide phase (`runHidePhase`) | **Always real.** Not gated. | Always real. |
| Nightly hard-delete phase (`runHardDeletePhase`) | Dry-run: scan + log, **zero** provider/storage deletes | Deletes eligible media |
| Patient account-deletion finalize (rec-32) | Access severed; **no** media destroy | Eligible media destroyed after grace |

The hide phase is reversible: a support UPDATE can set `recording_artifact_index.patient_self_serve_visible = true` (and clear `patient_self_serve_hidden_at` if you want the row to look unused). Doctor-side access is unaffected by hide.

Hard delete is **not reversible**. There is no undo, no soft-delete tier, and no backup path specified in migrations 055 / 056 / 057. Composition media deleted at Twilio cannot be recovered. Setting the flag back to `false` **does not restore anything already deleted.** That is the most important sentence in this file.

Twilio Composition DELETE removes the composed file only. Source Recordings may remain and stay billable (`_source_recordings=intact` on the audit string). That is a known follow-up, not a reason to flip early.

---

## 2. Do not confuse preview with cron

| Call | Mutates hide? | Mutates delete? | Use for |
|---|---|---|---|
| `GET /api/v1/admin/archival-preview?days=N` | No | No | **Every review.** This is the dry-run. |
| `POST /cron/recording-archival` with flag `false` | **Yes** (hide is always real) | No (delete dry-run only) | Nightly schedule only |
| `POST /cron/recording-archival` with flag `true` | Yes | **Yes** | After flip only |

**Reviews use the preview endpoint.** Do not fire the cron “to see what would happen.” Hide would already run.

Auth for both: `Authorization: Bearer $CRON_SECRET` or `X-Cron-Secret: $CRON_SECRET`. This secret must not go in a browser. `days` is capped at **60**. Default horizon is `ARCHIVAL_DRY_RUN_REPORT_DAYS` (7).

Suggested schedule for the cron itself (infra, not this repo): **02:45 IST**, after payouts (~02:00) and account-deletion finalize (~02:30).

---

## 3. First-time and weekly review (read-only)

Replace `API_BASE` with the production API origin (no trailing slash). Paste **counts and IDs only** into tickets. No patient names, phones, or dates of birth.

### 3.1 Index populated?

```sql
SELECT
  count(*) AS live_rows,
  count(*) FILTER (WHERE hard_deleted_at IS NOT NULL) AS already_stamped
FROM recording_artifact_index;
```

p1 backfill of historical rooms (2026-08-18) produced **0 compositions** (`DIV` 0/14). Live rows appear only from consults after the composition hook. If `live_rows = 0`, there is nothing to delete; still run the preview so the empty response is recorded. Do not flip on an empty index “because it is safe” — the hide phase will start acting the moment rows exist, and the flip should wait until the index reflects real traffic.

### 3.2 Preview at a chosen horizon

Horizon for review #1: **`days=0`** (as-of now) and **`days=7`** (as-of next week). Record both.

```bash
# As-of now
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "$API_BASE/api/v1/admin/archival-preview?days=0" \
  | jq '{
      asOf: .data.asOf,
      hide: (.data.hidePhase.candidates | length),
      delete: (.data.deletePhase.candidates | length),
      split: (.data.deletePhase.candidates | group_by(.storageHost) | map({host: .[0].storageHost, n: length})),
      delete_sample: [.data.deletePhase.candidates[] | {sessionId, artifactKind, storageHost, ageDays, retentionCutoffAt, policy}]
    }'
```

Repeat with `days=7`.

Expected response shape (unwrap `success` / `data`):

```json
{
  "asOf": "ISO-8601",
  "hidePhase": { "candidates": [ { "artifactId, sessionId, artifactKind, storageUri, ageDays, policy" } ] },
  "deletePhase": { "candidates": [ { "artifactId, sessionId, artifactKind, storageUri, storageHost, bytes, ageDays, retentionCutoffAt, policy" } ] }
}
```

`storageHost` is one of `twilio_composition` | `supabase_storage` | `unclassifiable` (rec-31).

### 3.3 Record these numbers (no PHI)

| Field | days=0 | days=7 |
|---|---|---|
| Review date / reviewer | | |
| hide candidates | | |
| delete candidates | | |
| `twilio_composition` | | |
| `supabase_storage` | | |
| `unclassifiable` | | |

**`unclassifiable` > 0 is a flip blocker.** Those rows fail loud and are not deleted; fix the `storage_uri` (index-population bug) before flipping.

### 3.4 Sanity against seeded policy

Recording started April 2026. A **3-year** `IN/*` baseline must produce **zero** general-medicine delete candidates today (2026). A non-zero general delete count means a policy value or a session `actual_ended_at` is wrong — **stop**. That is the early-destruction case.

Hide candidates can be non-zero once consults are older than 90 days. That is expected and reversible.

### 3.5 Confirm the preview mutated nothing

After the curl:

```sql
-- No new archival_history rows in the last 10 minutes (preview never inserts)
SELECT count(*) FROM archival_history
WHERE deleted_at > now() - interval '10 minutes';

-- No new hard_deleted_at stamps in the last 10 minutes
SELECT count(*) FROM recording_artifact_index
WHERE hard_deleted_at > now() - interval '10 minutes';
```

Both must be `0` if you only hit preview. Preview does not call Twilio.

### 3.6 Second review

Schedule the next review **7 days later**, same `days=0` and `days=7` curls, same table. Flip requires **two consecutive reviews** whose delete counts and provider split match within rounding (new consults may add hide candidates; delete counts for a 3-year policy should stay 0 until 2029).

---

## 4. Preconditions (all four, written down)

Do not flip until each line has a date and a name.

1. **Counsel confirmed `058` values** — see §7 of this file and rec-33's recorded outcome. Status as of 2026-08-22: **outstanding** (owner: founder).
2. **Two consecutive dry-run reviews** recorded in §3.3. Status as of 2026-08-22: **outstanding** (review #1 not yet run on production).
3. **rec-31 and rec-32 shipped** — provider delete exists; erasure consumes it. Coding shipped 2026-08-20 / 2026-08-22. Founder smokes on p1/p3/p4 still open; they do not block the *existence* of the path, but do not flip if the index is still empty of live compositions.
4. **`recording_artifact_index` populated** — p1 writer + hook in place; historical backfill was 0 rows. Live population is a founder smoke (rec-06). Confirm §3.1 `live_rows` before flip.

---

## 5. How to flip (only after §4)

On the production host (Render env, or equivalent):

1. Set `ARCHIVAL_HARD_DELETE_ENABLED=true` (string).
2. Redeploy / restart so `env.ts` re-reads it.
3. Confirm the next `POST /cron/recording-archival` response has `deletePhase.dryRun: false`.
4. Watch §6 for 48 hours.

This also turns on rec-32 media destroy for any account-deletion finalize that runs after the restart. If you are not ready for patient-initiated media delete, **do not flip**.

### Rollback

Set `ARCHIVAL_HARD_DELETE_ENABLED=false` and restart.

Rollback **stops future deletes**. It does **not** restore media, `archival_history` rows, or `hard_deleted_at` stamps. Those are gone.

---

## 6. First 48 hours after the flip

Watch logs (IDs and counts only):

| Event | What “right” looks like | What “wrong” looks like |
|---|---|---|
| `archival_dry_run` after flip | **Must not appear** for the delete phase | Delete phase still dry-running → flag not picked up |
| `archival_delete_phase_complete` | `deleted` ≈ last preview's delete-candidate count; `deletedTwilio` / `deletedSupabase` add up; `failedUnclassifiable` = 0 | `deleted` materially **above** last preview count |
| `archival_delete_phase_unclassifiable_uri` | Absent | Any occurrence → abort |
| `archival_delete_phase_row_failed` | Absent or rare + retry next tick | Persistent on the same `artifactId` |
| `archival_delete_phase_provider_recorded` | `stamped: true`, `historyWritten: true` | `stamped: false` after a successful provider call |
| `recording_erasure_provider_recorded` | Only on a finalized account deletion | Any unexpected count → abort and inspect |
| `account_deletion_finalized` | `erasure_media_delete_enabled: true` only after you intended that | Enabled with no counsel sign-off on rec-32 carve-out |

`deletion_reason` on new `archival_history` rows must match:

```
retention_expired_country=<CC>_specialty=<spec>_years=<n>[_untilAge=<n>]_provider=twilio_composition_source_recordings=intact
retention_expired_country=<CC>_specialty=<spec>_years=<n>[_untilAge=<n>]_provider=supabase_storage
patient_erasure_country=<CC>_specialty=<spec>_years=<n>[_untilAge=<n>]_provider=…
```

Anything else → abort and inspect. Do not “fix” a row; the table is append-only.

**Abort:** set the flag to `false`, restart, page the owner. Then query `archival_history` for `deleted_at` since the flip (session IDs / artifact IDs only).

Cadence after a clean 48h: weekly glance for 30 days, then the existing nightly cron is enough.

---

## 7. `058` values — founder / counsel (plain language)

These four rows are **illustrative until confirmed**. This runbook does not change them. A different number is a **new migration**, out of this phase.

All four use **90 days** for patient self-serve hide.

| Row | What it keeps | When the file may be hard-deleted | Citation (`source`, verbatim) | Hedge |
|---|---|---|---|---|
| `IN` / `*` | General India consults | 3 years after the consult ended | `Indian Medical Council Regulations 2002 §1.3.1 — general baseline (3 yr from last visit). Owner to attach exact URL.` | Owner to attach URL |
| `IN` / `pediatrics` | Pediatric consults | **Later of** 3 years after consult **or** patient age 21. If DOB is missing, **3 years only** (same as the archival worker) | `IMC Regulations 2002 + Limitation Act 1963 for minors — retain until patient reaches age 21 (majority 18 + 3 yr statute). retention_years=3 is the fallback when patient DOB is unknown at worker run-time. Owner to verify.` | Owner to verify |
| `IN` / `gynecology` | Gynecology consults | 7 years after the consult ended | `Practice norm; obstetric records commonly retained 7+ yr. Verify per state. Owner to confirm and potentially split into 'obstetrics' vs 'gynecology' if state law differs.` | **Verify per state** |
| `*` / `*` | Everyone else (no country/specialty match) | 7 years after the consult ended | `International conservative fallback. Applies when (country, specialty) not explicitly seeded. OECD-median across jurisdictions without specialty overrides.` | **OECD-median**, not a statute |

**Under-retention:** we cannot produce the record under subpoena.  
**Over-retention:** DPDP data-minimisation exposure and storage cost.  
**Too low:** clinical records are destroyed early and **cannot be recovered**.

A second legal question, **not this decision:** charter **REC-D2** (DPDP basis for the audio-recording mandate, owned by p2). Batch them in one counsel conversation if useful; record them as two answers.

**Confirmation record:** outstanding as of 2026-08-22. Owner: founder. Confirm here or in rec-33's task file with date + who confirmed. Do not treat an agent's reading of IMC / Limitation Act as confirmation.

---

## 8. Review log

| # | Date | Reviewer | Env | days=0 hide / delete / split | days=7 hide / delete / split | Unclassifiable | Mutated? | Notes |
|---|---|---|---|---|---|---|---|---|
| — | 2026-08-22 | Agent (draft) | production **not called** | — | — | — | n/a | No production credentials in the drafting session. Founder runs review #1 with §3. |
| 1 | | founder | production | | | | preview only | |
| 2 | | founder | production | | | | preview only | Flip blocked until this matches #1 |

Second review target: **2026-08-29** (7 days after the draft), or 7 days after review #1, whichever is later.
