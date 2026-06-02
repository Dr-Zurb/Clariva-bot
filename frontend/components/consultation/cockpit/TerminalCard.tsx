/**
 * Center-pane card for the `terminal` cockpit state.
 *
 * Shown when the appointment is `cancelled` or `no_show`. The Rx pane
 * is hidden by the parent (`ConsultationCockpit`) via the
 * `canEditPrescriptionDraft` / `canSendPrescription` gates from
 * `cockpit-state.ts`.
 *
 * The reschedule CTA lives in the header kebab (cockpit-4) — this card
 * intentionally has no action buttons so there is a single, discoverable
 * re-schedule affordance in the UI.
 */
export default function TerminalCard() {
  return (
    <div
      role="status"
      className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-border bg-card p-8 text-center"
    >
      <p className="max-w-xs text-sm text-muted-foreground">
        This appointment was cancelled / no-show. Use the kebab in the header
        to reschedule.
      </p>
    </div>
  );
}
