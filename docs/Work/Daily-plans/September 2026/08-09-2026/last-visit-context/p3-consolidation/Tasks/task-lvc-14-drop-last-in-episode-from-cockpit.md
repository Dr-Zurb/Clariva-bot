# Task lvc-14: Drop last-in-episode from the cockpit open path

**Program / Phase:** last-visit-context · Phase 3
**Status:** Drafted
**Change Type:** Update existing

Two leftover `last-in-episode` readers:

1. Vitals ghosts (`lastVisitVitalsQueryOptions`) — episode-scoped, silent-empty when `episode_id` is unset (the failure LVC-DL-2 exists to avoid).
2. PrescriptionForm “Copy from last visit” — header confirm that the strips + Repeat already replace.

Vitals stay per-field ghosts (LVC-DL-11). Source them from the canonical last-visit payload **if** that payload already has the vital columns; if it does not, grow the existing summary (no new endpoint, no migration). Retire the copy CTA.

Do not fold last-visit medicines into the combo list. Side sheet may keep `listPrescriptionsByPatient` — that is browse-all, not last-visit.
