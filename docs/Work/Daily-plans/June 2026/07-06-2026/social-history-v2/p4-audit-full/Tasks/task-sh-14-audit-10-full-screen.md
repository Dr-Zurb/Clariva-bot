# task-sh-14 — Full AUDIT-10 screen

**Status:** ✅ Done  
**Batch:** social-history-v2 / p4-audit-full

## Summary

Added the WHO full AUDIT (10 questions, 0–40) as a third expandable alcohol screen chip alongside CAGE and AUDIT-C.

## Data model

- Q1–Q3 shared on `alcohol.auditC` (same as AUDIT-C chip)
- Q4–Q10 on new `alcohol.auditFull` JSONB object
- Severity bands via `SOCIAL_HISTORY_THRESHOLDS`: low (0–7), hazardous (≥8), harmful (≥16), possible dependence (≥20)

## UI

- Chip: **AUDIT-10 screen** — collapsed by default; auto-expands on carry-forward when Q4+ answers exist
- Panel: all 10 questions with stacked full-width option rows (same pattern as AUDIT-C)
- Score line + clinical hint for hazardous and above

## Serialize / parse

Text token: `AUDIT-10 12/40 hazardous (2,2,1,1,1,0,2,1,0,2)` — emitted only when all 10 questions answered; otherwise AUDIT-C token used for Q1–Q3 only.

## Files

- `frontend/lib/cockpit/social-history-indices.ts`
- `frontend/lib/cockpit/social-history-thresholds.ts`
- `frontend/lib/cockpit/social-history-alcohol-drinks.ts`
- `frontend/lib/cockpit/social-history.ts`
- `frontend/components/cockpit/rx/subjective/SocialHistoryField.tsx`
- `backend/src/types/prescription.ts`
- `backend/src/utils/validation.ts`
