/**
 * PHI-free telemetry for patients v2 list (pr-07, pr-08).
 */

export type PatientsV2BulkAction = "export_csv" | "tag";

export function trackPatientsV2BulkAction(
  action: PatientsV2BulkAction,
  count: number,
): void {
  try {
    if (typeof console !== "undefined" && console.debug) {
      console.debug("[telemetry]", "patients_v2.bulk_action", { action, count });
    }
  } catch {
    /* telemetry must never break the UI */
  }
}

let duplicatesPopoverTelemetrySent = false;

/** Fires at most once per browser session (pr-08). */
export function trackPatientsV2TabOpened(tabId: string, patientId: string): void {
  try {
    if (typeof console !== "undefined" && console.debug) {
      console.debug("[telemetry]", "patients_v2.tab_opened", { tab_id: tabId, patient_id: patientId });
    }
  } catch {
    /* telemetry must never break the UI */
  }
}

export function trackPatientsV2DuplicatesPopoverOpened(): void {
  if (duplicatesPopoverTelemetrySent) return;
  duplicatesPopoverTelemetrySent = true;
  try {
    if (typeof console !== "undefined" && console.debug) {
      console.debug("[telemetry]", "patients_v2.duplicates_popover_opened");
    }
  } catch {
    /* telemetry must never break the UI */
  }
}

export function trackPatientsV2ListViewed(): void {
  try {
    if (typeof console !== "undefined" && console.debug) {
      console.debug("[telemetry]", "patients_v2.list_viewed");
    }
  } catch {
    /* telemetry must never break the UI */
  }
}

export function trackPatientsV2DetailViewed(patientId: string): void {
  try {
    if (typeof console !== "undefined" && console.debug) {
      console.debug("[telemetry]", "patients_v2.detail_viewed", { patient_id: patientId });
    }
  } catch {
    /* telemetry must never break the UI */
  }
}

export function trackPatientsV2SavedViewApplied(viewId: string): void {
  try {
    if (typeof console !== "undefined" && console.debug) {
      console.debug("[telemetry]", "patients_v2.saved_view_applied", { view_id: viewId });
    }
  } catch {
    /* telemetry must never break the UI */
  }
}

export function trackPatientsV2SplitStartButtonUsed(modality: string): void {
  try {
    if (typeof console !== "undefined" && console.debug) {
      console.debug("[telemetry]", "patients_v2.split_start_button_used", { modality });
    }
  } catch {
    /* telemetry must never break the UI */
  }
}
