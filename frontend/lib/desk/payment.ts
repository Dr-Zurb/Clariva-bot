export type DeskPaymentMethod = "cash" | "upi" | "card" | "no_charge";
export type DeskReturnMethod = "cash" | "upi" | "card";
export type DeskPaymentStatus = "paid" | "no_charge" | "due" | "returned";

export type DeskVisitPaymentSummary = {
  appointmentId: string;
  status: DeskPaymentStatus;
  collectedMinor: number;
  methods: DeskPaymentMethod[];
};

export type DeskHisabSnapshot = {
  date: string;
  timezone: string;
  suggestedAmountMinor: number | null;
  currency: string;
  totals: {
    cashMinor: number;
    upiMinor: number;
    cardMinor: number;
    collectedMinor: number;
  };
  noChargeCount: number;
  dueCount: number;
  visits: DeskVisitPaymentSummary[];
};

export function deskPaymentLabel(
  status: DeskPaymentStatus | undefined
): string {
  if (status === "paid") return "Paid";
  if (status === "no_charge") return "No charge";
  if (status === "returned") return "Returned";
  return "—";
}

export function deskPaymentMethodLabel(method: DeskPaymentMethod): string {
  if (method === "cash") return "Cash";
  if (method === "upi") return "UPI";
  if (method === "card") return "Card";
  return "No charge";
}

export function deskPaidMethodLabels(
  methods: DeskPaymentMethod[] | undefined
): string | null {
  const paid: DeskReturnMethod[] = [];
  for (const method of methods ?? []) {
    if (method !== "cash" && method !== "upi" && method !== "card") continue;
    if (paid.includes(method)) continue;
    paid.push(method);
  }
  if (paid.length === 0) return null;
  return paid.map(deskPaymentMethodLabel).join(" · ");
}

export function deskLastPaidMethod(
  methods: DeskPaymentMethod[] | undefined
): DeskReturnMethod | null {
  const paid = (methods ?? []).filter(
    (method): method is DeskReturnMethod =>
      method === "cash" || method === "upi" || method === "card"
  );
  return paid[paid.length - 1] ?? null;
}

export function visitPaymentById(
  visits: DeskVisitPaymentSummary[] | undefined,
  appointmentId: string
): DeskVisitPaymentSummary | undefined {
  return visits?.find((row) => row.appointmentId === appointmentId);
}

export function rupeesToMinor(rupees: number): number {
  return Math.round(rupees * 100);
}

export function minorToRupeesInput(minor: number | null | undefined): string {
  if (minor == null || minor < 0) return "";
  return String(Math.round(minor / 100));
}
