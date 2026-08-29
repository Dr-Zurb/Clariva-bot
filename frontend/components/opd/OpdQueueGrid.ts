/**
 * OpdQueueGrid — shared constants for the OPD queue CSS grid.
 *
 * Consumed by:
 *   - OpdQueueDenseRow (body rows)
 *   - OpdQueueTable    (sticky header row)
 *
 * Keeping the template in one place prevents alignment drift.
 *
 * Column layout (13 cols) — order matches clinical left-to-right scan:
 *   1.  4px                 — status color bar / expand chevron
 *   2.  40px                — token number (#)
 *   3.  88px                — scheduled time (HH:mm) over relative delta
 *   4.  118px               — status dot + label
 *   5.  100px               — MRN (identifier first, before name)
 *   6.  minmax(130px, 1fr)  — patient name
 *   7.  84px                — age/sex
 *   8.  120px               — phone (click-to-copy)
 *   9.  32px                — consultation type icon (modality)
 *  10.  minmax(130px, 1fr)  — service
 *  11.  minmax(130px, 1fr)  — reason for visit
 *  12.  56px                — waited time
 *  13.  44px                — actions slot (⋯)
 *
 * Patient Name, Service, and Reason all share the same minmax(130px, 1fr)
 * track so they grow equally and appear visually balanced.
 *
 * @see docs/Work/Daily-plans/May 2026/08-05-2026/Tasks/task-oq-04-table-shell-grouping.md
 */

export const OPD_QUEUE_GRID_TEMPLATE =
  "4px 40px 88px 118px 100px minmax(130px, 1fr) 84px 120px 32px minmax(130px, 1fr) minmax(130px, 1fr) 56px 44px";

/** Header column definitions aligned with OPD_QUEUE_GRID_TEMPLATE. */
export const OPD_QUEUE_HEADER_COLS = [
  { key: "bar",       label: "",             srOnly: true  },
  { key: "token",     label: "#",            srOnly: false },
  { key: "scheduled", label: "Time",         srOnly: false },
  { key: "status",    label: "Status",       srOnly: false },
  { key: "mrn",       label: "MRN",          srOnly: false },
  { key: "patient",   label: "Patient Name", srOnly: false },
  { key: "ageSex",    label: "Age/Sex",      srOnly: false },
  { key: "phone",     label: "Phone",        srOnly: false },
  { key: "modality",  label: "Type",         srOnly: true  },
  { key: "service",   label: "Service",      srOnly: false },
  { key: "reason",    label: "Reason",       srOnly: false },
  { key: "waited",    label: "Wait",         srOnly: false },
  { key: "actions",   label: "Actions",      srOnly: true  },
] as const;

/**
 * Slot-mode grid — same scan order as queue, without Wait.
 */
export const OPD_SLOT_GRID_TEMPLATE =
  "4px 40px 88px 118px 100px minmax(130px, 1fr) 84px 120px 32px minmax(130px, 1fr) minmax(130px, 1fr) 44px";

export const OPD_SLOT_HEADER_COLS = [
  { key: "bar",       label: "",             srOnly: true  },
  { key: "token",     label: "#",            srOnly: false },
  { key: "scheduled", label: "Time",         srOnly: false },
  { key: "status",    label: "Status",       srOnly: false },
  { key: "mrn",       label: "MRN",          srOnly: false },
  { key: "patient",   label: "Patient Name", srOnly: false },
  { key: "ageSex",    label: "Age/Sex",      srOnly: false },
  { key: "phone",     label: "Phone",        srOnly: false },
  { key: "modality",  label: "Type",         srOnly: true  },
  { key: "service",   label: "Service",      srOnly: false },
  { key: "reason",    label: "Reason",       srOnly: false },
  { key: "actions",   label: "Actions",      srOnly: true  },
] as const;
