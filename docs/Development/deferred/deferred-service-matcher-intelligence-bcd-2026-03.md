# Deferred: Service matcher intelligence (phases B, C, D)

**Status:** Deferred  
**Reason:** Phase A (doctor profile in LLM prompt, catalog `description` in allowlist + Stage A substring match) is enough for now; follow-ups need product decisions and time.  
**Defer until:** You want higher autobook rate, analytics on mismatches, or safer defaults for vague complaints across many practices.

**Related implementation:** `backend/src/services/service-catalog-matcher.ts`, `enrichStateWithServiceCatalogMatch` in `instagram-dm-webhook-handler.ts` (profile: practice name + specialty).

---

## Already done (Phase A — reference only)

- Pass **practice name** and **specialty** into the **LLM** system prompt with routing rules (primary care vs narrow specialty).
- Include each row’s **`description`** in the allowlist as `doctor_note` for the model.
- **Stage A:** deterministic match when patient text contains the full **description** substring (and narrow ambiguous label hits when description picks one row).

---

## Phase B — Metrics and staff override visibility

**Not implemented.**

**Goal:** Know where the matcher fails per doctor (proposed key vs what staff finally chose).

**Ideas when you resume:**

1. Structured logs or events: `matcherProposedCatalogServiceKey`, `finalCatalogServiceKey` (after confirm/reassign), `source` (deterministic / llm / fallback), `confidence`.
2. Optional inbox or export: count of overrides from `other` to a specific row (catalog “health” hints).
3. Optional saved fixtures / CI dataset: synthetic reasons × catalog × expected key (regress prompt changes).

**Prerequisites:** Stable staff review resolution schema and correlation IDs already in logs; confirm no PHI in metric dimensions.

---

## Phase C — Autobook on LLM “medium” confidence (policy)

**Not implemented.** Today **LLM** path only **auto-finalizes** when `match_confidence === "high"`.

**Goal:** More automatic booking when the model picks a **non-`other`** row with plausible **medium** confidence, without opening staff review every time.

**Ideas when you resume:**

1. **Doctor-level toggle** (safest): e.g. “Allow medium-confidence service match without staff review” with disclaimer.
2. Rules: e.g. allow medium only if `service_key !== other` and modality is valid; optional allowlist of specialties or max catalog size.
3. Update tests and monitor override rate after rollout.

**Risk:** Wrong visit type without human check — mitigate with toggle + logging (Phase B).

---

## Phase D — Default row / structured tags for vague complaints

**Not implemented.**

**Goal:** Per-practice optional “default non-`other` row” or **tags** on catalog rows (e.g. `broad_consult`) so generic rules do not hard-code “headache → X” globally.

**Ideas when you resume:**

1. DB / `doctor_settings` or catalog JSON: optional `default_general_consult_service_id` (or `service_key`) + validation against live catalog.
2. Or extend `service_offerings_json` with optional `matcher_tags: string[]` and server-side policy: if specialty is broad and complaint is vague, prefer row tagged `broad_consult` when no stronger match.
3. UI on services catalog page to set default / tags; migration if schema changes.

**Risk:** Mis-routing if default is wrong — keep opt-in and show in staff inbox first if needed.

---

## When you pick this up

1. Decide order: usually **B** (measure) before **C** (loosen autobook) or **D** (defaults).
2. File a small PRD or task under `docs/Development/Daily-plans/` with acceptance criteria.
3. Re-read `service-catalog-matcher.ts` and staff review flow so changes stay aligned with ARM / pay-after-confirm flows.

---

**Last updated:** 2026-03-31
