/**
 * Complaint master types (subjective-tab · subj-06).
 * Mirrors `complaint_master` lookup table — non-PHI.
 */

export type ComplaintMasterCategory = 'pain' | 'fever' | 'cough' | 'default';

export interface ComplaintMasterRow {
  id: string;
  name: string;
  synonyms: string[];
  category: ComplaintMasterCategory;
  created_at: string;
  updated_at: string;
}

export type ComplaintSearchResult = ComplaintMasterRow;

// ---------------------------------------------------------------------------
// AI free-text complaint parse (subj-14) — gated, server-side, suggestion-only.
// Shapes mirror the frontend deterministic parser so AI output is a drop-in
// alternate extractor: per-complaint `{ name, patch, associated }`.
// ---------------------------------------------------------------------------

/** Field render types the client schema can describe (mirrors ComplaintAttributeFieldType). */
export const COMPLAINT_PARSE_FIELD_TYPES = [
  'text',
  'severity',
  'chips',
  'duration',
  'painscale',
  'temperature',
] as const;
export type ComplaintParseFieldType = (typeof COMPLAINT_PARSE_FIELD_TYPES)[number];

/**
 * Field keys the parser may fill — mirrors the frontend `ParsedComplaintPatch`
 * keys (OLDCARTS + laterality/timing/color/frequency/location/aggravating/relieving).
 * The server only keeps patch keys present in the request `fieldSpec`, so this
 * list is the documented ceiling, not the enforcement (the spec is).
 */
export const COMPLAINT_PARSE_FIELD_KEYS = [
  'duration',
  'severity',
  'onset',
  'character',
  'radiation',
  'laterality',
  'timing',
  'color',
  'frequency',
  'location',
  'aggravating',
  'relieving',
] as const;
export type ComplaintParseFieldKey = (typeof COMPLAINT_PARSE_FIELD_KEYS)[number];

/** Which model tier to use (mirrors config `ComplaintParseModelTier`). */
export type ComplaintParseTier = 'default' | 'escalation';

/**
 * One field the resolved client schema can display. The client sends the spec
 * (keys + chip enums) so the server constrains the model and validates output
 * without duplicating the schema.
 */
export interface ComplaintParseFieldSpec {
  key: string;
  label: string;
  type: ComplaintParseFieldType;
  /** Allowed values for `type: 'chips'` (server drops anything off this list). */
  chips?: string[];
}

export interface ParseComplaintRequest {
  /** Doctor's free-typed complaint line (PHI — redacted before the prompt). */
  text: string;
  /** Optional resolved complaint category, for prompt context. */
  category?: string;
  /** Resolved schema field spec — the server constrains output to these. */
  fieldSpec: ComplaintParseFieldSpec[];
  /** Model tier; `default` (mini) auto-gate, `escalation` (flagship) on refine. */
  tier?: ComplaintParseTier;
}

/** One parsed complaint — same shape as the deterministic parser's per-complaint output. */
export interface AiParsedComplaint {
  name: string;
  /** Schema-bounded field values (chips canonicalised; off-vocab dropped). */
  patch: Record<string, string | number>;
  associated: string[];
}

export interface ParseComplaintResult {
  complaints: AiParsedComplaint[];
}
