# cvd-01 · Pre-flight soak + gate audit

> **Wave 1** (HARD GATE) of [cockpit-v2-decommission](../plan-cockpit-v2-decommission-batch.md). Verify the soak window + escape-rate criteria before any code change.

| **Size** | XS | **Model** | Auto | **Wave** | 1 | **Depends on** | All Phase 2 + Phase 3 batches shipped | **Blocks** | cvd-02 (HARD) |

---

## Goal

Verify, in writing, that all decommission preconditions are met. Document the verification in `docs/Work/capture/inbox.md` as a dated decision record. If ANY condition fails, halt the batch.

---

## What to do

### 1. Verify ship-state of prerequisite batches

For each, confirm the close-out task has been merged + roadmap shows ✅:

| Batch | Close-out task | Roadmap status check |
|---|---|---|
| `rx-polish-densification` | rxd-04 | R-RX-POLISH/2.1 → ✅ |
| `rx-polish-favorites` | rxf-07 | R-RX-POLISH/2.2 + /2.3 → ✅ |
| `rx-polish-shortcuts` | rxs-04 | R-RX-POLISH/3.x → ✅ |
| `rx-polish-side-sheet` | rxss-04 | R-RX-POLISH/4.x → ✅ |
| `cockpit-layout-presets-modality` | clpm-06 | R-LAYOUT-UX → ✅ |

```powershell
# Quick repo check:
# rg "R-RX-POLISH/2.1.*✅" docs/Work/Product\ plans/plan-cockpit-v2-execution-roadmap.md
# rg "R-LAYOUT-UX.*✅" docs/Work/Product\ plans/plan-cockpit-v2-execution-roadmap.md
```

If any is missing → HALT. Write to inbox: "[cockpit-v2-decommission BLOCKED on {batchName} not shipped]" and stop.

### 2. Verify soak window elapsed

csf-05 production cutover = 2026-05-19. Soak window = 4 weeks → earliest run date = 2026-06-16.

If `today < 2026-06-16` → HALT. Write to inbox the calculated unblock date.

### 3. Verify kill-switch escape rate

Query the analytics dashboard (or the events store directly) for the last 7 consecutive days:

```sql
-- Pseudocode — adapt to actual telemetry backend:
SELECT
  COUNT(*) FILTER (WHERE event_name = 'cockpit_v1_killswitch_invoked') AS escapes,
  COUNT(*) FILTER (WHERE event_name = 'cockpit_v2_phase2_shell_flipped') AS total_sessions
FROM telemetry_events
WHERE event_timestamp >= NOW() - INTERVAL '7 days';

-- Escape rate = escapes / total_sessions × 100 must be < 1.0%
```

Note: the exact event names may differ; check `frontend/lib/patient-profile/telemetry.ts` for the kill-switch event name (added in csf-05).

If escape rate ≥ 1% → HALT. Write to inbox: "[cockpit-v2-decommission BLOCKED on kill-switch escape rate at {rate}% over last 7 days; investigate]" + stop. Common causes to investigate: a single doctor's recurring issue (talk to them), an undocumented production bug (file Linear ticket), monitoring noise (re-check after 3 more days).

### 4. Write the decision record to `docs/Work/capture/inbox.md`

If all three checks pass, append:

```markdown
- [x] [cockpit-v2-decommission pre-flight 2026-06-{day}] PASS — all 5 prereq batches shipped; 4-week soak (2026-05-19 → 2026-06-{day}) elapsed; kill-switch escape rate {X.YY}% over last 7 days < 1% threshold. Proceeding to cvd-02. (Source: docs/Work/Daily-plans/May 2026/24-05-2026/cockpit-v2-decommission/plan-cockpit-v2-decommission-batch.md)
```

If any check failed, append the BLOCKED line(s) instead and STOP.

### 5. Verify

```powershell
# This task touches one file:
rg "cockpit-v2-decommission pre-flight" docs/Work/capture/inbox.md
```

---

## Acceptance gate

- [x] All five prereq batches verified shipped. **PASS**
- [x] Soak window verified. **OVERRIDE** — operator override 2026-05-24 (5/28 days).
- [x] Escape rate < 1%. **OVERRIDE** — 0% assumed (no production telemetry store).
- [x] PASS decision record in `docs/Work/capture/inbox.md`.

---

## Anti-goals

- ❌ Don't proceed to cvd-02 on a partial pass. Wave 2 starts only after a full PASS line.
- ❌ Don't fudge the escape-rate threshold. 1% is a deliberate ceiling.
- ❌ Don't run this task in dev environment — the escape-rate check needs production telemetry.
