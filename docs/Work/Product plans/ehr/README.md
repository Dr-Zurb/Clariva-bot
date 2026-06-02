# EHR — product plans (one-stop folder)

## Everything EHR / prescription-related, sequenced from foundation up to AI assist

This folder is the **single source of truth** for the EHR product roadmap. It contains:

1. **Foundation status page** (`plan-f01`) — what's already shipped underneath the baseline `<PrescriptionForm>` code and what's outstanding.
2. **Tier roadmap** (`plan-00`) — the master index for everything that comes _after_ the foundation.
3. **Tier plans** (`plan-t1` through `plan-t6`) — six independently shippable slices.

---

## Read-order

```
plan-f01 (foundation status) ──→ plan-00 (tier roadmap) ──→ plan-t1 → ... → plan-t6
```

If you only have 60 seconds: skim `plan-00`. The "Tier overview" table is a map of every item across all six tiers.

If you have 5 minutes: skim `plan-00` + `plan-f01`. You'll know what's shipped, what's outstanding, and what's planned.

If you're picking items to commit: open the relevant `plan-tX` file. Each tier plan is self-contained with effort, files-to-touch, and acceptance criteria per item.

---

## File index

### Foundation (status snapshot; canonical history lives in `Daily-plans/March 2026/2026-03-23/Plans/PRESCRIPTION_EHR_PLAN.md` and the e-task series under 2026-03-27 / 2026-03-28)

| File | Plan | Status | Outstanding work |
|------|------|--------|------------------|
| [plan-f01-prescription-foundation-status.md](./plan-f01-prescription-foundation-status.md) | Prescription V1 (e-tasks 1–7, March 2026) | ✅ Fully shipped | None at the V1 line; the entire T1–T6 tier roadmap is everything above that line. |

### Roadmap

| File | Purpose |
|------|---------|
| [plan-00-ehr-roadmap.md](./plan-00-ehr-roadmap.md) | Master index. Audits the baseline, frames the 6 tiers, locks cross-cutting principles, sequences. |

### Tiers

| File | Items | Effort | Schema work | AI dep? | Selection |
|------|-------|--------|-------------|---------|-----------|
| [plan-t1-ehr-foundation.md](./plan-t1-ehr-foundation.md) | 6 | ~3 days | 1 migration: 3 additive tables (`patient_allergies`, `patient_chronic_conditions`, `patient_vitals`) | No | `Drafted` |
| [plan-t2-ehr-speed.md](./plan-t2-ehr-speed.md) | 7 | ~4 days | 2 migrations: `drug_master` + seed, `doctor_rx_templates` | No | `Drafted` |
| [plan-t3-ehr-output.md](./plan-t3-ehr-output.md) | 5 | ~3 days | None (Storage bucket only) | No | `Drafted` |
| [plan-t4-ehr-safety.md](./plan-t4-ehr-safety.md) | 4 | ~2 days | 1 migration: `drug_interactions` + seed | No | `Drafted` |
| [plan-t5-ehr-vitals-trends.md](./plan-t5-ehr-vitals-trends.md) | 4 | ~2 days | 1 column add (`prescriptions.episode_id`) + 1 SQL view | No | `Drafted` |
| [plan-t6-ehr-ai-assist.md](./plan-t6-ehr-ai-assist.md) | 5 | ~3 days | None | **Yes** | ⏸ Deferred (parked on V1 GA + AI budget approval) |

**Totals across tiers:** 31 items, ~17 dev-days, 5 small additive migrations + 1 column add + 1 view.

**Selection:** No batch selection has been made yet. T1–T5 are `Drafted` and unblocked once you decide to commit; T6 is parked.

---

## What "above our baseline prescription code" means

The current production code (`frontend/components/consultation/PrescriptionForm.tsx` + `MedicineRow.tsx` + the prescription controller / service stack + migrations 026 / 027) implements everything the V1 prescription plan from March specified, with the omissions captured in `plan-f01` (allergies, vitals, structured drug DB, templates, branded PDF, etc.).

**The tier plans T1–T6 are the entire planned work above that line.** There is no other EHR planning hidden in `Daily-plans/`, `inbox.md`, or `deferred/`. If something doesn't appear in this folder, it isn't on the EHR roadmap.

---

## Symmetric consult roadmaps

The peer folders [`../text-consult/`](../text-consult/), [`../voice-consult/`](../voice-consult/), and [`../video-consult/`](../video-consult/) own the three consult-channel modalities. The EHR roadmap is **modality-agnostic** — every tier item ships once and surfaces from all three consult flows (in-call panel, post-call summary, and from the appointment-detail page outside any call).

| Modality concern | Owned by |
|---|---|
| The conversation channel (chat / audio / video) | `text-consult/`, `voice-consult/`, `video-consult/` |
| The clinical artifact (Rx, vitals, allergies, dx, follow-up) | This folder (`ehr/`) |

---

## Conventions

- **Status legend** (used by every file): `Drafted` / `Committed` / `Shipped` / `Deferred` / `Killed`.
- **Item IDs** are tier-prefixed and sequential: T1.1 / T1.2 ... T6.31. They never renumber.
- **Selection markers**: when items are picked for an implementation batch, they're tagged `[SELECTED YYYY-MM-DD]` inline in their tier plan, and a consolidated batch plan lands in `Daily-plans/<month>/<date>/`. (None today.)
- **Foundation status page** (`plan-f01`) links to the canonical originals under `Daily-plans/`. Don't fork the originals — update them in-place if the V1 prescription line resumes.
- **Decision IDs** prefix `E` for EHR (Decision E1 / E2 / …) to keep them distinct from `text-consult/` Decisions 1–5 and `voice-consult/` decisions.

---

**Created:** 2026-05-03.  
**Owner:** TBD (each tier picks its own owner at commit time).
