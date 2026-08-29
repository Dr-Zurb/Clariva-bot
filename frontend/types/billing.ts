export interface DoctorLedgerLine {
  id: string;
  appointmentId: string;
  occurredAt: string;
  modality: string;
  source: string;
  status: string;
  voidReason: string | null;
  notBilledLabel: string | null;
}

export interface DoctorInvoiceSummary {
  id: string;
  invoiceNumber: string;
  billingPeriod: string;
  billableCount: number;
  totalMinor: number;
  status: string;
  issuedAt: string | null;
}

export interface DoctorBillingSnapshot {
  billingPeriod: string;
  subscription: {
    planKind: string;
    status: string;
    baseWaivedUntil: string | null;
    levelsLockedUntil: string | null;
    baseWaivedThisPeriod: boolean;
  };
  billableCount: number;
  notBilledCount: number;
  consultsUntilCap: number;
  capReached: boolean;
  capReachedCopy: string | null;
  bill: {
    baseMinor: number;
    meteredMinor: number;
    subtotalMinor: number;
    cappedMinor: number;
    gstMinor: number;
    totalMinor: number;
    inclusiveRupees: {
      base: number;
      perConsult: number;
      cap: number;
      total: number;
    };
  };
  consults: DoctorLedgerLine[];
  invoices: DoctorInvoiceSummary[];
}
