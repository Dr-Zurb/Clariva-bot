/**
 * Drug Master frontend types (EHR Sub-batch B1 / T2.7 + T2.8).
 *
 * Mirrors the backend `DrugMasterRow` shape. Lookup data only — no PHI.
 */

export interface DrugMasterRow {
  id: string;
  generic_name: string;
  brand_names: string[];
  strength: string | null;
  form: string | null;
  route_default: string | null;
  created_at: string;
  updated_at: string;
}
