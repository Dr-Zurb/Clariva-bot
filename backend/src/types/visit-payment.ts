export const VISIT_PAYMENT_COLLECT_METHODS = ['cash', 'upi', 'card', 'no_charge'] as const;
export const VISIT_PAYMENT_RETURN_METHODS = ['cash', 'upi', 'card'] as const;
export const VISIT_PAYMENT_METHODS = [...VISIT_PAYMENT_COLLECT_METHODS, 'reversal'] as const;
export type VisitPaymentCollectMethod = (typeof VISIT_PAYMENT_COLLECT_METHODS)[number];
export type VisitPaymentReturnMethod = (typeof VISIT_PAYMENT_RETURN_METHODS)[number];
export type VisitPaymentMethod = (typeof VISIT_PAYMENT_METHODS)[number];

export const VISIT_PAYMENT_STATUSES = ['paid', 'no_charge', 'due', 'returned'] as const;
export type VisitPaymentStatus = (typeof VISIT_PAYMENT_STATUSES)[number];

export interface VisitPaymentRow {
  id: string;
  doctor_id: string;
  appointment_id: string;
  patient_id: string | null;
  amount_minor: number;
  currency: string;
  method: VisitPaymentMethod;
  collected_by: string;
  collected_at: string;
  note: string | null;
  created_at: string;
  reverses_payment_id: string | null;
  return_method: VisitPaymentReturnMethod | null;
}

export interface VisitPaymentSummary {
  appointmentId: string;
  status: VisitPaymentStatus;
  collectedMinor: number;
  methods: VisitPaymentCollectMethod[];
}

export interface DeskHisabTotals {
  cashMinor: number;
  upiMinor: number;
  cardMinor: number;
  collectedMinor: number;
}

export interface DeskHisabCollector {
  collectedBy: string;
  cashMinor: number;
  upiMinor: number;
  cardMinor: number;
}

export interface DeskHisabSnapshot {
  date: string;
  timezone: string;
  suggestedAmountMinor: number | null;
  currency: string;
  totals: DeskHisabTotals;
  noChargeCount: number;
  dueCount: number;
  visits: VisitPaymentSummary[];
  collectors: DeskHisabCollector[];
}
