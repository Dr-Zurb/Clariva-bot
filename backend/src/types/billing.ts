export type BillableModality = 'video' | 'voice' | 'text' | 'in_person';

export type BillableSource =
  | 'verified_overlap'
  | 'doctor_wrapup'
  | 'wrapup_sweep'
  | 'async_reply';

export type BillableStatus = 'billable' | 'free_followup' | 'void';

export interface RecordBillableConsultInput {
  appointmentId: string;
  doctorId: string;
  modality: BillableModality;
  source: BillableSource;
  occurredAt: Date | string;
}

export interface RecordBillableConsultResult {
  recorded: boolean;
  duplicate: boolean;
  status: BillableStatus | null;
  voidReason: string | null;
}

export interface VoidBillableConsultResult {
  voided: boolean;
  reason: 'voided' | 'already_invoiced' | 'not_found' | 'already_void';
}
