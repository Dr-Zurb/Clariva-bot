export const LAB_NOT_DONE_REASONS = [
  { code: "sample_not_collected", label: "Sample not collected" },
  { code: "patient_refused", label: "Patient refused" },
  { code: "sample_rejected", label: "Sample rejected" },
  { code: "machine_down", label: "Machine down" },
  { code: "done_outside", label: "Done outside" },
  { code: "other", label: "Other" },
] as const;

export type LabNotDoneReasonCode = (typeof LAB_NOT_DONE_REASONS)[number]["code"];
export type DeskLabOrderStatus = "pending" | "uploaded" | "not_done";

export type DeskLabOrderFulfillment = {
  status: DeskLabOrderStatus;
  reasonCode: string | null;
  reasonNote: string | null;
  documentId: string | null;
};

export type DeskLabLoopProgress = {
  total: number;
  closed: number;
  complete: boolean;
};

export function deskLabLoopProgress(
  orders: ReadonlyArray<{ status?: string | null }>
): DeskLabLoopProgress {
  const total = orders.length;
  const closed = orders.filter(
    (order) => order.status === "uploaded" || order.status === "not_done"
  ).length;
  return { total, closed, complete: total > 0 && closed === total };
}

export function formatDeskLabOrderLabels(
  orders: ReadonlyArray<{ label: string; status?: string | null }>
): string {
  if (orders.length === 0) return "";
  return orders
    .map((order) => {
      if (order.status === "uploaded") return `${order.label} ✓`;
      if (order.status === "not_done") return `${order.label} ✕`;
      return order.label;
    })
    .join(" · ");
}

export function formatDeskLabLoopBadge(
  orders: ReadonlyArray<{ status?: string | null }>,
  daysPending: number,
  formatDaysPending: (days: number) => string
): string {
  const progress = deskLabLoopProgress(orders);
  if (progress.complete) return "Done";
  if (progress.closed > 0) return `${progress.closed}/${progress.total}`;
  return formatDaysPending(daysPending);
}

export function labNotDoneReasonLabel(code: string | null | undefined): string {
  const match = LAB_NOT_DONE_REASONS.find((reason) => reason.code === code);
  return match?.label ?? "Not done";
}
