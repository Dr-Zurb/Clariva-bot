/**
 * clinic_staff row used by the acting-doctor path.
 * Does not include display_name — that is personal data and never needed
 * on the request hot path (DL-9).
 */
export interface ClinicStaffLink {
  id: string;
  doctorId: string;
  staffUserId: string;
  role: string;
  status: 'active' | 'suspended';
  capabilities: string[];
}
