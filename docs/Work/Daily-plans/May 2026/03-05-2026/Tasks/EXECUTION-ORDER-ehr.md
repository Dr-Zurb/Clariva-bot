# EHR — Execution order (authoritative)

**Status:** Drafted — awaiting commit-start. Sub-batches A / B1 / B2 / C / D all in `Drafted` state. T6 deferred per Decision E3.  
**Last doc sync:** 2026-05-04  
**Owner:** TBD  
**Scope:** 26 EHR tasks across Sub-batches A–D (T1 + T2 + T3 + T4 + T5 from the EHR roadmap)  
**Total estimate:** ~14 dev-days (~3 calendar weeks solo · ~9 calendar days with 2 devs running B1 ‖ B2)  
**Dev DB — migrations applied:** `087` (`patient_chart_context`) → `094` (`drug_interactions_seed`) on **2026-05-04** (Supabase dev).  
**Parent batch plan:** [plan-ehr-implementation-batch.md](../plan-ehr-implementation-batch.md)  
**Sibling docs:** the per-sub-batch task files at the parent folder ([A](../tasks-subbatch-A-foundation.md) · [B1](../tasks-subbatch-B1-speed.md) · [B2](../tasks-subbatch-B2-output.md) · [C](../tasks-subbatch-C-safety.md) · [D](../tasks-subbatch-D-trends.md))

---

## TL;DR — read before you touch any task

1. **DO NOT execute by ID** (T1.1 → T1.2 → … → T2.7). The IDs describe *grouping inside the source product plan*, not sequence. The "Step" column below is the actual order.
2. **No pre-flight gate.** Unlike the video batch, EHR has no cross-batch hard gate. Sub-batch A is itself the foundation — once it ships, B1 / B2 / C / D unblock.
3. Within each sub-batch, the order below respects: **hard intra-batch deps → cheap items first → schema/migration work paired with its consumers**.
4. If a task you're about to start says `**Hard deps:** ... (HARD)` and the prerequisite isn't `Status: Shipped (YYYY-MM-DD)`, **stop and ship the prerequisite first.**
5. After each task ships, update its row in the sub-batch file (`Status: Shipped (YYYY-MM-DD)`) AND tick the row in [plan-ehr-implementation-batch.md](../plan-ehr-implementation-batch.md). Three-way sync with the source product plan tier file is required at sub-batch close.

> **No per-task `.md` files for this batch (intentional).** The sub-batch files are the per-task spec source — each numbered "Task" inside them carries effort, steps, done-when, and PR slicing. The "Task" column links to the relevant sub-batch file with a task-section anchor.

---

## Pre-flight — none

EHR has no cross-batch hard gate. The "foundation" is Sub-batch A itself: until T1's chart-context tables, service, and component family ship, nothing else can mount.

If you want a single check before starting Sub-batch A:

```
- [ ] Sub-batch A's pre-batch checklist (top of tasks-subbatch-A-foundation.md) confirmed
- [ ] Decisions 1-5 from the master batch (§ Before Sub-batch A starts) accepted
- [ ] Two test doctor users (doctor_a, doctor_b) with a shared test patient exist
- [ ] Next migration number picked (run: ls backend/migrations | tail -5)
```

If those are green, A is unblocked. There is no `voice-0A`-style precondition.

---

## Sub-batch A — Foundation (~3 days, 6 tasks)

Patient chart context spine. **Hard prerequisite for B1, B2, C, D.** **One migration** (3 additive tables: `patient_allergies` + `patient_chronic_conditions` + `patient_vitals`).

| Step | Task | Effort | Hard deps | Soft deps | Unblocks |
|---|---|---|---|---|---|
| A.1 | [T1.1 — Schema migration](../tasks-subbatch-A-foundation.md#task-1--schema-migration-t11) | S (~4h) | — | — | A.2 (backend reads tables) |
| A.2 | [T1.2 — Backend service + REST routes](../tasks-subbatch-A-foundation.md#task-2--backend-service--rest-routes-t12) | S (~4h) | A.1 | — | A.3 (component reads via API) |
| A.3 | [T1.3 — `<PatientChartPanel>` component family](../tasks-subbatch-A-foundation.md#task-3--patientchartpanel-component-family-t13) | L (~1 day) | A.2 | — | A.4, A.5, A.6 |
| A.4 | [T1.4 — Mount in appointment-detail page](../tasks-subbatch-A-foundation.md#task-4--mount-in-appointment-detail-page-t14) | XS (~2h) | A.3 | — | — |
| A.5 | [T1.5 — Mount in in-call quick-actions panel](../tasks-subbatch-A-foundation.md#task-5--mount-in-in-call-quick-actions-panel-t15) | M (~4h) | A.3 | video / voice in-call host (verify space for new tab) | — |
| A.6 | [T1.6 — Previous-Rx history section + backend `listRecentPrescriptionsByPatient`](../tasks-subbatch-A-foundation.md#task-6--previous-rx-history-section-t16) | M (~4h) | A.3 | — | B1.8 (T2.14 copy-from-last-visit reuses backend code path) |

**Sub-batch A migration window:** A.1 ships standalone in PR #1 (clean rollback if anything goes wrong before A.2). All 4 CRUD policies per table mirror migration 026 §4 shape (`auth.uid() = doctor_id`).

**Sub-batch A acceptance** (close gate):

- [ ] All 6 sub-batch tasks marked `Status: Shipped (YYYY-MM-DD)`.
- [ ] Cross-doctor RLS verified — `doctor_b` cannot see `doctor_a`'s rows for the shared test patient.
- [ ] Three-mount-surface parity — chart panel renders in `appointment-detail` (full), `in-call quick-actions` (compact), and post-call (read-only — `mode='readonly'` hides Add CTAs).
- [ ] Soft-delete works (`UPDATE ... SET archived_at = now()` removes from default queries; row still in DB).
- [ ] Empty states friendly for new patients.
- [ ] Existing prescription flow unchanged (smoke: create + save + send Rx).
- [ ] Mobile breakpoints OK at 375 / 768 / 1024 / 1440.
- [ ] Backend + frontend type-check + lint clean.

---

## Sub-batches B1 + B2 — run in PARALLEL after A

Two parallel tracks. Different files. Same `<PrescriptionForm>` only at the top.

- **B1 = doctor-side love** (drug autocomplete + structured pickers + templates + auto-save). Retention lever.
- **B2 = patient-side trust** (branded PDF + signed-link patient page + send-pipeline upgrade). Word-of-mouth lever.

Two devs can split the day A merges. Solo: ship B1 first (highest doctor-leverage per dev-day), then B2.

### Sub-batch B1 — Speed (T2; ~4 days, 8 tasks)

**Three migrations:** `drug_master` + structured columns on `prescription_medicines` + `doctor_rx_templates`. Frontend-heavy.

> **Important sequencing note vs source plan §T2:**  
> The source plan lists items in T2.7 → T2.14 numerical order, but T2.13 (auto-save) is the highest-leverage standalone item. The order below ships T2.13 second (after T2.7) so doctors get the autosave win immediately.

| Step | Task | Effort | Hard deps | Soft deps | Unblocks |
|---|---|---|---|---|---|
| B1.1 | [T2.7 — `drug_master` schema + seed + search endpoint](../tasks-subbatch-B1-speed.md#task-1--drug_master-schema--seed--search-endpoint-t27) ✅ impl 2026-05-03 · db 088+089 applied 2026-05-04 | M (~4h) | A close | — | B1.3 (autocomplete reads it), C.1 (allergy match canonical), C.3 (DDI canonical) |
| B1.2 | [T2.13 — Auto-save hook + remove "Save draft" button](../tasks-subbatch-B1-speed.md#task-2--auto-save-hook--remove-save-draft-button-t213) ✅ impl 2026-05-03 (frontend-only; ready to smoke-test live) | S (~4h) | A close | — | every future B1 PR (no autosave races) |
| B1.3 | [T2.8 — `<DrugAutocomplete>` component](../tasks-subbatch-B1-speed.md#task-3--drugautocomplete-component-t28) ✅ impl 2026-05-03 · db 088+089 applied 2026-05-04 | M (~6h) | B1.1 | — | B1.4 (consumes `drug_master_id`) |
| B1.4 | [T2.9 — Structured columns migration](../tasks-subbatch-B1-speed.md#task-4--structured-columns-migration-t29) ✅ impl 2026-05-03 · db 090 applied 2026-05-04 | XS (~2h) | B1.1 (FK to drug_master) | — | B1.5 (pickers persist into them) |
| B1.5 | [T2.10 — Structured pickers UI](../tasks-subbatch-B1-speed.md#task-5--structured-pickers-ui-t210) ✅ impl 2026-05-03 · db 090 applied 2026-05-04 | M (~4h) | B1.4 | — | B2.1 (PDF reads structured cols), C.1 (canonical match) |
| B1.6 | [T2.11 — `doctor_rx_templates` schema + service](../tasks-subbatch-B1-speed.md#task-6--doctor_rx_templates-schema--service-t211) ✅ impl 2026-05-03 · db 091 applied 2026-05-04 | M (~4h) | A close | — | B1.7 (UI reads service) |
| B1.7 | [T2.12 — `<TemplatePicker>` UI](../tasks-subbatch-B1-speed.md#task-7--templatepicker-ui--integrate-with-form-t212) ✅ impl 2026-05-03 · db 091 applied 2026-05-04 | L (~6h) | B1.6 | B1.5 (structured cols snapshot cleaner) | — |
| B1.8 | [T2.14 — "Copy from last visit" CTA](../tasks-subbatch-B1-speed.md#task-8--copy-from-last-visit-cta-t214) ✅ impl 2026-05-03 | S (~4h) | A.6 (reuses backend code path); B1.5 soft (structured cols copy cleaner) | — | — |

**Sub-batch B1 acceptance** (close gate):

- [ ] All 8 tasks marked `Status: Shipped (YYYY-MM-DD)`.
- [ ] "Save draft" button is gone everywhere (`rg "Save draft" frontend/` returns no UI matches).
- [ ] Drug autocomplete returns within 250ms p95 for queries ≥2 chars.
- [ ] Templates picker sorts by `last_used_at DESC NULLS LAST`.
- [ ] Copy-from-last-visit CTA only appears on follow-ups (verified on a fresh episode-less appointment — CTA absent).
- [ ] Legacy free-text Rx (created before B1) still display correctly.
- [ ] Migration rollback practiced on scratch DB for all 3 migrations.
- [ ] Unit tests added for `useAutoSave` (debounce + retry + initial-mount-no-fire) and `searchDrugs` ordering.

### Sub-batch B2 — Output (T3; ~3 days, 5 tasks)

**No DB tables.** One Storage bucket (`prescription-pdfs`). New env var `RX_SHARE_TOKEN_SECRET`. New npm dep `@react-pdf/renderer`.

> **Important sequencing note:**  
> T3.18 (preview as patient) ships SECOND (right after T3.15 PDF gen) so doctors get to see the patient view before the delivery upgrade lands. The source plan lists items in T3.15 → T3.19 numerical order; the order below moves T3.18 forward.

| Step | Task | Effort | Hard deps | Soft deps | Unblocks |
|---|---|---|---|---|---|
| B2.1 | [T3.15 — PDF generation service + bucket migration](../tasks-subbatch-B2-output.md#task-1--pdf-generation-service--bucket-migration-t315) ✅ impl 2026-05-04 · db/storage 092 applied 2026-05-04 | L (~1 day) | A close; verify `doctor_settings` columns | B1.5 soft (structured medicine cols render cleaner in PDF; legacy free-text still works) | B2.2, B2.3, B2.4, B2.5 |
| B2.2 | [T3.18 — "Patient view" preview before send](../tasks-subbatch-B2-output.md#task-2--patient-view-preview-before-send-t318) ✅ impl 2026-05-04 | M (~4h) | B2.1 (extracts shared `<PatientRxView>`) | — | B2.3 (public route reuses `<PatientRxView>`) |
| B2.3 | [T3.16 — Patient-facing route + token service](../tasks-subbatch-B2-output.md#task-3--patient-facing-route--token-service-t316) ✅ impl 2026-05-04 (needs `RX_SHARE_TOKEN_SECRET` provisioned to smoke-test) | M (~6h) | B2.1 + B2.2 | `RX_SHARE_TOKEN_SECRET` provisioned in dev/staging/prod | B2.4 (send pipeline mints tokens) |
| B2.4 | [T3.17 — Send-pipeline upgrade](../tasks-subbatch-B2-output.md#task-4--send-pipeline-upgrade-t317) ✅ impl 2026-05-04 (PDF attached to email + IG file message; share-link appended; `Promise.allSettled` for independent channel failures) | M (~4h) | B2.1 + B2.3 | verify IG-DM media-attachment path | B2.5 (resend reuses the upgraded path) |
| B2.5 | [T3.19 — Resend + Regenerate PDF + Copy share link](../tasks-subbatch-B2-output.md#task-5--resend--regenerate-pdf--copy-share-link-t319) ✅ impl 2026-05-04 (`POST /:id/regenerate-pdf` + `POST /:id/share-link` endpoints + past-Rx kebab) | XS (~2h) | B2.1 + B2.3 + B2.4 | — | — |

**Sub-batch B2 acceptance** (close gate):

- [ ] All 5 tasks marked `Status: Shipped (YYYY-MM-DD)`.
- [ ] PDF renders correctly with sample data including multi-page (8+ medicines).
- [ ] Doctor without `doctor_settings.logo_url` gets text-only header (no broken image).
- [ ] Patient page loads without auth at `clariva.health/r/<id>?t=<token>`.
- [ ] Expired or invalid tokens show friendly "Link expired" with a CTA.
- [ ] HMAC binds token to `prescription_id` (`/r/<other-id>?t=<my-token>` rejects).
- [ ] PDF cache hits on resend within 5 min (no regen on rapid resend).
- [ ] Email send + IG-DM send fail INDEPENDENTLY (one channel failure doesn't kill the other).
- [ ] Unit tests for `mintRxToken` / `verifyRxToken` (round-trip + expiry + tamper).
- [ ] PHI hygiene: no diagnosis text or drug names in logs.

---

## Sub-batch C — Safety (~2 days, 4 tasks; needs A + B1)

**One migration:** `drug_interactions` + ~200-pair seed. **Decision T4-D1 LOCKED:** every warning is soft. No "Send" button is ever disabled.

> **Important sequencing note vs source plan §T4:**  
> T4.18 (allergy banner) is independent of T4.19 (DDI schema) — it ships first to deliver value early. Source plan groups them together; the order below starts with T4.18 because it has the lowest dep cost.

| Step | Task | Effort | Hard deps | Soft deps | Unblocks |
|---|---|---|---|---|---|
| C.1 | [T4.18 — Allergy clash matcher + banner](../tasks-subbatch-C-safety.md#task-1--allergy-clash-banner--matcher-t418--ships-first) ✅ impl 2026-05-04 · db 087 applied 2026-05-04 | M (~5h) | A.1 (`patient_allergies`); B1.5 soft (structured cols → exact-id match path) | — | C.4 (pre-send aggregator reads acks) |
| C.2 | [T4.19 — `drug_interactions` schema + seed + check endpoint](../tasks-subbatch-C-safety.md#task-2--drug_interactions-schema--seed--check-endpoint-t419) ✅ db 093+094 applied 2026-05-04 | S (~4h) | B1.1 (FK to drug_master) | — | C.3 (chips read endpoint) |
| C.3 | [T4.20 — DDI warning chips + acknowledgement](../tasks-subbatch-C-safety.md#task-3--ddi-warning-chips--acknowledgement-t420) ✅ impl 2026-05-04 | M (~4h) | C.2 + B1.3 (autocomplete sets `drug_master_id` for canonical lookup) | — | C.4 (aggregator reads chips' acks) |
| C.4 | [T4.21 — Pre-send soft guards modal](../tasks-subbatch-C-safety.md#task-4--pre-send-soft-guards-modal-t421--impl-2026-05-04) ✅ impl 2026-05-04 | S (~4h) | C.1 + C.3 | — | — |

**Sub-batch C migration window:** C.2 ships its own one-off migration (`drug_interactions` + seed). Standalone PR; no enum / type changes elsewhere.

**Documented V1 gap:** allergen-class matching ("Penicillin allergy" → "Amoxicillin" prescribed) is a known false negative because the matcher is bidirectional substring. Brand × generic matches work via `drug_master_id` + brand-name lookup; class-level matches need an allergen-class table (T4-v2). The honest fix is `patient_allergies.allergen_class TEXT NULL` referencing a small WHO drug-class table — out of scope for V1, tracked as `[ ] Penicillin-class allergy → amoxicillin/etc match` follow-up in C.1's task file.

**Sub-batch C acceptance** (close gate):

- [ ] All 4 tasks marked `Status: Shipped (YYYY-MM-DD)`.
- [ ] All `matchAllergens` unit tests pass (brand match, generic match, normalization, multiple matches per medicine, V1 false-negative cases documented as expected-no-match).
- [ ] Allergy banner appears on `Crocin × Paracetamol allergy` (when added via T2.8 autocomplete — `drug_master_id` lookup gives brand match).
- [ ] DDI chips appear on `Warfarin + Aspirin` pair within ~500ms p95 (300ms debounce per task spec §C.3 step 4 + p95 network round-trip; cache-hit re-renders instant).
- [ ] "Send anyway" is ALWAYS enabled — verify there is NO UI state in which a warning disables send.
- [ ] Pre-send modal aggregates all warning kinds; "Edit Rx" focuses the relevant section.
- [ ] PHI hygiene: telemetry contains no allergen text, drug names, diagnosis text — only warning kinds + outcome counts.
- [ ] Migration rollback practiced.

---

## Sub-batch D — Vitals & trends (~2 days, 4 tasks; needs A)

**One column add** (`prescriptions.episode_id` → `care_episodes`) **+ one SQL view** (`patient_problem_list_v`). Independent of B1 / B2 / C; can run in parallel with C if a 2nd dev is free.

| Step | Task | Effort | Hard deps | Soft deps | Unblocks |
|---|---|---|---|---|---|
| D.1 | [T5.22 — `<VitalsCapture>` widget + sparklines + section upgrade](../tasks-subbatch-D-trends.md#task-1--vitalscapture-widget--vitalsparkline-t522) ✅ impl 2026-05-05 (frontend-only; ready to smoke-test live) | M (~6h) | A.1 (`patient_vitals` table) + A.3 (chart-panel section placeholder) | — | D.2 (trend modal extends sparkline approach) |
| D.2 | [T5.23 — `<VitalTrendModal>`](../tasks-subbatch-D-trends.md#task-2--vitaltrendmodal-t523) ✅ impl 2026-05-05 (frontend-only; BP two-line chart; time-window pills; data-point info bar; readings list) | S (~4h) | D.1 | — | — |
| D.3 | [T5.24 — `prescriptions.episode_id` additive FK + backfill](../tasks-subbatch-D-trends.md#task-3--prescriptionsepisode_id-additive-fk--backfill-t524) | XS (~2h) | — | A close | D.4 (problem-list active-episode row reads cleaner with link in place) |
| D.4 | [T5.25 — `patient_problem_list_v` view + `<ProblemListSection>`](../tasks-subbatch-D-trends.md#task-4--problem-list-view--section-t525) ✅ impl 2026-05-05 (migration 096 + service + route + ProblemListSection mounted) | M (~4h) | A.3 (`<PatientChartPanel>` host) | D.3 | — |

**Sub-batch D migration window:** D.3 ships its column-add + backfill in one migration file (PR #3 of D). D.4 ships its view in a separate migration (PR #4). Order matters — backfill before view (the view reads `prescriptions` directly, not `prescriptions.episode_id` per se, so technically the view is order-independent, but ship D.3 first for clean reasoning).

**Critical post-deploy invariant for D.3:**

```sql
SELECT COUNT(*) FROM prescriptions
WHERE episode_id IS NULL
  AND appointment_id IN (SELECT id FROM appointments WHERE episode_id IS NOT NULL);
-- Expected: 0
```

If this returns >0, the backfill missed rows. Investigate before declaring D.3 shipped.

**Sub-batch D acceptance** (close gate):

- [ ] All 4 tasks marked `Status: Shipped (YYYY-MM-DD)`.
- [ ] Vitals capture works mid-call (in-call surface) without losing the call tile.
- [ ] Sparklines appear at ≥2 readings; absent at 0–1.
- [ ] BMI auto-computes correctly (e.g. 70kg + 170cm → 24.2).
- [ ] In-call vitals carry current `appointment_id`; chart-panel-entered vitals leave it NULL.
- [ ] Trend modal: BP renders both systolic + diastolic as two lines.
- [ ] Episode FK backfill invariant returns 0 (see SQL above).
- [ ] Problem list returns mixed sources for seeded patient (chronic + active episode + recurring diagnosis).
- [ ] Recurring-diagnosis grouping is case-insensitive (`Acne` and `acne` group together).
- [ ] Cross-doctor RLS via base-table inheritance verified on the view.

---

## Migration windows (combine where possible)

To minimize migration files (each one needs forward + reverse + verification):

| Migration | Owner | Recommended window |
|---|---|---|
| `0XX_patient_chart_context.sql` (3 tables + indexes + RLS) | A.1 | Standalone PR. First migration of the batch. Clean rollback before A.2. |
| `0XX_drug_master.sql` + `0XX_drug_master_seed.sql` | B1.1 | Two files, one PR. `pg_trgm` extension created idempotently; seed can be split into a script if too large. |
| `0XX_prescription_medicines_structured.sql` | B1.4 | Standalone PR. 4 nullable additive cols + CHECK enums; no risk of breaking legacy reads. |
| `0XX_doctor_rx_templates.sql` | B1.6 | Standalone PR. Independent of any other B1 work. |
| `0XX_prescription_pdfs_bucket.sql` (Storage bucket only) | B2.1 | Bundled in B2.1's PR. No DB table. |
| `0XX_drug_interactions.sql` + `0XX_drug_interactions_seed.sql` | C.2 | Two files, one PR. Mirrors `drug_master`'s pattern. |
| `0XX_prescriptions_episode_link.sql` (1 col + index + backfill) | D.3 | Standalone PR. Backfill is in the same migration. |
| `0XX_patient_problem_list_view.sql` | D.4 | Standalone PR. View only; no table. |

**8 migration files, 6 logical migrations.** All RLS uses `auth.uid() = doctor_id` (mirrors migration 026 §4). **`safe_uuid_sub()` is NOT required** because no patient JWT reads any of these tables in V1 — patients reach prescriptions only via T3.16's HMAC-token public route, not via Supabase JWT (Decision E4).

**No Plan 06 system-message enum changes anywhere in this batch.** EHR doesn't emit any new `consultation_messages.system_event` values. The existing `'rx_sent'` event from Plan F01 already covers what doctors need.

---

## Cross-batch coordination map

EHR is largely self-contained (clinical artifact, not conversation channel). The handful of touch points:

| EHR task | Sibling batch | What's shared | If sibling not shipped |
|---|---|---|---|
| A.5 (mount in in-call panel) | video-consult / voice-consult / text-consult — `InCallActionPanel.tsx` (or equivalent host) | Tab strip / panel layout | Verify the host has UI room for a "Patient chart" tab BEFORE A.5 starts. If the in-call panel host is tightly packed, file a small refactor follow-up — don't block A.5 on it. |
| B2.1 (PDF generation) | none | — | Standalone. |
| B2.3 (patient page route `/r/[id]`) | none | — | New top-level route; doesn't collide with `/c/text/[sessionId]` etc. |
| B2.4 (send pipeline) | text-consult Plan 04 (`buildPrescriptionReadyDm`) — already shipped | DM-copy builder | Already shipped. Verify the helper accepts the new `shareUrl` param; extend if not. |
| C.1 (allergy clash) | text-consult batch (Apr 28) | none | text-consult batch is on a different surface (`<TextConsultRoom>`); no overlap. |
| D.4 (problem list view) | none | — | Reads from existing `care_episodes` (migration 036). No coordination needed. |

**The text-consult / voice-consult / video-consult batches from April are entirely independent.** They're shipping polish to the conversation layer; this batch is shipping the clinical artifact. The two only meet at `<InCallActionPanel>` where both are mounted (already handles modality switching cleanly per the video batch's Sub-batch A).

**No Plan 10 dependency.** T6 (AI assist) is the only EHR tier that would need Plan 10 / `consultation_transcripts`, and T6 is **deferred** per Decision E3. T1–T5 do not need any AI infrastructure.

---

## Decisions to settle before each sub-batch boundary

These are flagged in the master batch plan ([§ Cross-cutting decisions needed before commit-start](../plan-ehr-implementation-batch.md#cross-cutting-decisions-needed-before-commit-start)). They must be answered BEFORE the sub-batch starts, not during it.

### Before Sub-batch A (5 decisions)

§1 chart panel collapsibility on desktop · §2 vitals snapshot model (history vs latest-only) · §3 in-call panel arrangement (tabbed vs stacked) · §4 chart-panel vs in-call vitals `appointment_id` propagation · §5 soft-delete UX label ("Archive" vs "Delete")

### Before Sub-batch B1 (7 decisions)

§6 drug DB seed source (~500 hand-curated vs RxNorm import) · §7 auto-save debounce window (1.5s LOCKED) · §8 templates clinic-wide sharing (per-doctor LOCKED) · §9 structured frequency enum set (8 values: OD/BID/TID/QID/QHS/PRN/STAT/CUSTOM) · §10 frequency `CUSTOM` UX (reveal free-text input below dropdown) · §11 save-as-template snapshot fields (CC/HOPI/dx/inv/follow-up/edu/notes + medicines_json) · §12 templates picker default sort (`last_used_at DESC NULLS LAST` then name)

### Before Sub-batch B2 (6 decisions)

§13 PDF runtime (`@react-pdf/renderer` LOCKED) · §14 patient share link format (`clariva.health/r/<short-id>?t=<token>`) · §15 token TTL (24h on initial mint; refreshable from email/IG link) · §16 letterhead fallback strategy (text-only header on missing logo) · §17 send-pipeline channel-failure semantics (each channel fails independently) · §18 PDF cache TTL (5 min server-side)

### Before Sub-batch C (5 decisions)

§19 allergy substring match strictness (bidirectional `includes` on canonical generic + brand + free-text allergen, normalized lowercase) · §20 DDI severity scale (4 values: minor / moderate / major / contraindicated) · §21 DDI seed source (~200 pairs hand-curated from BNF + Beers) · §22 acknowledgement persistence scope (per-Rx in-memory only in V1) · §23 telemetry payload shape (no PHI; warning kinds + outcome counts only)

### Before Sub-batch D (6 decisions)

§24 sparkline rendering threshold (≥2 readings) · §25 trend modal time window default (last 90 days, OR all readings if fewer) · §26 BMI persist vs compute-on-read (persist) · §27 reference range source (V1 fixed: BP 90-120/60-80, HR 60-100, Temp 36.5-37.5, SpO₂ 95-100, BMI 18.5-25) · §28 recurring diagnosis grouping (`LOWER(TRIM(provisional_diagnosis))`, ≥2 in last 6 months) · §29 episode FK backfill (one-shot SQL during migration deploy + post-deploy invariant check)

---

## Per-task workflow (the loop)

For every single task, regardless of sub-batch:

1. **Open the relevant sub-batch file** (e.g. `tasks-subbatch-A-foundation.md`) and find the task's section by step number (Task 1, Task 2, …). Read `Effort`, `Source plan reference`, `Steps`, `Done when`, `Suggested PR`.
2. **Check deps.** Look up the row in this exec-order doc. If any `Hard deps` says A.X / B1.Y / B2.Z / etc., confirm that prerequisite is `Status: Shipped` in its sub-batch file. If not, STOP and ship the prerequisite first.
3. **Set status.** Edit the sub-batch file's task heading: append `— In progress (YYYY-MM-DD)` after the title. (Optional: also `task-master add-task` if you want Taskmaster tracking — but not required for this batch.)
4. **Implement.** Follow the numbered steps in the sub-batch task. Touch only files referenced in the steps; if you find yourself touching files outside that list, the task scope was wrong — pause and either expand the sub-batch task description or split it.
5. **Verify acceptance.** Run all checkboxes under "Done when" + the master batch decisions for that sub-batch. Don't ship if a `mode='readonly'` decision is required and not verified (E6 invariant).
6. **Cross-batch sanity.** If the task touches an in-call surface (A.5) or the prescription form (most B1 / C tasks), run a 30-sec smoke on the other consult modalities (text / voice / video) to confirm no regression.
7. **Status close.** Edit the sub-batch task heading: replace the "In progress" tag with `— Shipped (YYYY-MM-DD)` after PR merges and staging smoke.
8. **Three-way doc sync.** 
   - (a) Tick the row in [plan-ehr-implementation-batch.md](../plan-ehr-implementation-batch.md) tier table.
   - (b) Tag `[SHIPPED YYYY-MM-DD]` on the matching item in the source product plan ([plan-t1](../../../Product%20plans/ehr/plan-t1-ehr-foundation.md) / [t2](../../../Product%20plans/ehr/plan-t2-ehr-speed.md) / [t3](../../../Product%20plans/ehr/plan-t3-ehr-output.md) / [t4](../../../Product%20plans/ehr/plan-t4-ehr-safety.md) / [t5](../../../Product%20plans/ehr/plan-t5-ehr-vitals-trends.md)).
   - (c) Update the row's `Step` status emoji-free annotation in this exec-order doc (e.g. "A.1 [Shipped 2026-05-04]") so a single glance at this file shows batch progress.

---

## When you get stuck

| Symptom | Where to look |
|---|---|
| Hard dep hasn't shipped | Read the prerequisite task's sub-batch section; ship it; come back. |
| Sub-batch file vs master batch order disagree | Trust the sub-batch file's task ordering; the master batch was drafted earlier and may have drift on within-tier order. This exec-order doc reflects the corrected order. |
| RLS denies legitimate insert on a chart-context table | Confirm `auth.uid() = doctor_id` policy applied (mirror migration 026 §4). RLS uses standard `auth.uid()` — `safe_uuid_sub()` is NOT used in this batch (no patient-JWT path). |
| Drug autocomplete returns 0 results for valid query | Check `pg_trgm` extension is enabled (`SELECT * FROM pg_extension WHERE extname = 'pg_trgm'`). Check seed loaded (`SELECT COUNT(*) FROM drug_master`). Check the search SQL ordering (prefix priority before trigram). |
| PDF generation throws on a real prescription | Likely a missing `doctor_settings` field → text-only header should kick in (Decision §16). If it crashes hard, the fallback isn't wired — see B2.1 step 7. |
| Patient page renders for one prescription with another's token | Verify HMAC binds token to `prescription_id` (not just timestamp). Token format is base64url(HMAC-SHA256(prescriptionId + ':' + expiresAt)). Cross-prescription tokens MUST fail verification. |
| Allergy banner doesn't fire for an obvious match | Two likely causes: (a) doctor typed free text instead of using T2.8 autocomplete (no `drug_master_id` for brand-match path); (b) the V1 allergen-class gap (Penicillin → Amoxicillin) — see C.1 documented gap. |
| Episode FK backfill missed rows | Run the post-deploy invariant SQL (D.3 section above). If >0, investigate which appointments have `episode_id` but their child Rx don't. Likely a recent fresh insert during the deploy window — re-run backfill. |
| Problem list view returns nothing for a patient with chronic conditions | Check the user is `doctor_id` matching the chronic condition row. View inherits RLS from base tables. If running as service-role, verify the WHERE clause is `patient_id = $1` (not `doctor_id = $1` AND `patient_id = $2` — that's the application service code). |
| Decision needed mid-task | Check the [Decisions section](#decisions-to-settle-before-each-sub-batch-boundary) — if the decision wasn't pre-settled, escalate to product review before continuing. **Do not invent a decision and ship it** — it'll bite at the close-gate. |

---

## Quick reference — 26 tasks at a glance

The single column you'll consult most: **what's next?**

```text
SUB-BATCH A — foundation (6, ~3 days)            HARD PREREQ FOR EVERYTHING ELSE
  A.1  T1.1   ~4h      patient_chart_context migration (3 tables + RLS)
  A.2  T1.2   ~4h      patient-chart-service + 3 routes
  A.3  T1.3   ~1d      <PatientChartPanel> + 4 sections
  A.4  T1.4   ~2h      mount in appointment-detail (12-col grid)
  A.5  T1.5   ~4h      mount in in-call quick-actions (tabbed)
  A.6  T1.6   ~4h      previous-Rx history section + backend recent-list

SUB-BATCH B1 — speed (8, ~4 days)                runs PARALLEL with B2 after A
  B1.1 T2.7   ~4h      drug_master schema + ~500 seed + search endpoint
  B1.2 T2.13  ~4h      auto-save hook + REMOVE Save draft button (highest leverage)
  B1.3 T2.8   ~6h      <DrugAutocomplete> component
  B1.4 T2.9   ~2h      structured cols migration (4 nullable + CHECK enums)
  B1.5 T2.10  ~4h      structured frequency/duration/route pickers
  B1.6 T2.11  ~4h      doctor_rx_templates schema + service
  B1.7 T2.12  ~6h      <TemplatePicker> UI + Save-as-template
  B1.8 T2.14  ~4h      "Copy from last visit" CTA

SUB-BATCH B2 — output (5, ~3 days)               runs PARALLEL with B1 after A
  B2.1 T3.15  ~1d      PDF generation service + bucket + React-PDF templates
  B2.2 T3.18  ~4h      "Patient view" preview modal (ships 2nd; doctor sees output early)
  B2.3 T3.16  ~6h      patient-facing route /r/[id]?t=hmac + token service
  B2.4 T3.17  ~4h      send-pipeline upgrade (PDF + share link in IG-DM + email)
  B2.5 T3.19  ~2h      Resend / Regenerate PDF / Copy share link kebab

SUB-BATCH C — safety (4, ~2 days)                NEEDS A + B1
  C.1  T4.18  ~5h      matchAllergens + <AllergyClashBanner> (ships 1st; independent of C.2)
  C.2  T4.19  ~4h      drug_interactions schema + ~200 seed + check endpoint
  C.3  T4.20  ~4h      <InteractionChips> + per-Rx ack hook
  C.4  T4.21  ~4h      <PrescriptionPreSendCheck> modal (NEVER blocks; aggregates all)

SUB-BATCH D — vitals & trends (4, ~2 days)       NEEDS A; runs PARALLEL with C if 2nd dev
  D.1  T5.22  ~6h      <VitalsCapture> + <VitalSparkline> + section upgrade
  D.2  T5.23  ~4h  ✅  <VitalTrendModal> with reference-range bands
  D.3  T5.24  ~2h      prescriptions.episode_id additive FK + backfill
  D.4  T5.25  ~4h  ✅  patient_problem_list_v view + <ProblemListSection>

T6 (AI assist, 5 items) — DEFERRED per Decision E3
  Parked on V1 GA + AI budget + PHI/compliance review.
  When unparked, see plan-t6-ehr-ai-assist.md for the 5 items + 6 open decisions.
```

---

## References

- [Parent batch plan](../plan-ehr-implementation-batch.md)
- [Folder README](../README.md) (read-order + sub-batch sequencing diagram)
- Per-sub-batch task files: [A](../tasks-subbatch-A-foundation.md) · [B1](../tasks-subbatch-B1-speed.md) · [B2](../tasks-subbatch-B2-output.md) · [C](../tasks-subbatch-C-safety.md) · [D](../tasks-subbatch-D-trends.md)
- Source product plans: [EHR roadmap](../../../Product%20plans/ehr/plan-00-ehr-roadmap.md) · [F01 status](../../../Product%20plans/ehr/plan-f01-prescription-foundation-status.md) · [T1](../../../Product%20plans/ehr/plan-t1-ehr-foundation.md) · [T2](../../../Product%20plans/ehr/plan-t2-ehr-speed.md) · [T3](../../../Product%20plans/ehr/plan-t3-ehr-output.md) · [T4](../../../Product%20plans/ehr/plan-t4-ehr-safety.md) · [T5](../../../Product%20plans/ehr/plan-t5-ehr-vitals-trends.md) · [T6 deferred](../../../Product%20plans/ehr/plan-t6-ehr-ai-assist.md)
- Foundation Plan F01 (prescription V1) — `frontend/components/consultation/PrescriptionForm.tsx` + migrations 026 / 027 + send pipeline (already shipped per Plan F01 status)
- Sibling exec-order docs (independent batches): [EXECUTION-ORDER-video.md](../../../April%202026/28-04-2026/Tasks/EXECUTION-ORDER-video.md) · [README-voice.md](../../../April%202026/28-04-2026/Tasks/README-voice.md)

---

**Last Updated:** 2026-05-04  
**Doc owner:** owner of the EHR batch (TBD)  
**Update protocol:** when a task's status changes, update the row's status here AND in the sub-batch file AND in the source product plan tier file (three-way sync, no exceptions). Tag the row in this doc with `[Shipped YYYY-MM-DD]` so a single-glance scan shows batch progress.
