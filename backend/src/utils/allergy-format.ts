/**
 * Patient-facing allergy line for the prescription PDF.
 *
 * Three states, because "nothing on file" and "asked, nothing known" are
 * different clinical claims and the Rx must not blur them:
 *   recorded allergens        → the list
 *   empty + asserted nil      → "No known allergies"
 *   empty + never asserted    → null (section omitted)
 *
 * "No known allergies", not NKDA: the chart holds food and environmental
 * allergens too, so the drug-only wording would overstate what was asserted.
 *
 * `note` is clinician shorthand and is never printed.
 */

export interface AllergyForOutput {
  allergen: string;
  severity?: string | null;
  reaction?: string | null;
}

export interface AllergyOutputOptions {
  /** Doctor asserted the patient has no known allergies (migration 222). */
  noKnownAllergies?: boolean;
}

const NONE_KNOWN = 'No known allergies';

function formatOne(row: AllergyForOutput): string | null {
  const allergen = row.allergen?.trim() ?? '';
  if (!allergen) return null;
  const bits: string[] = [];
  const severity = row.severity?.trim() ?? '';
  if (severity && severity !== 'unknown') bits.push(severity);
  const reaction = row.reaction?.trim() ?? '';
  if (reaction) bits.push(reaction);
  return bits.length > 0 ? `${allergen} (${bits.join(' — ')})` : allergen;
}

/** Null when never asked, so SectionBlock omits the Allergies line. */
export function formatAllergiesForOutput(
  allergies: AllergyForOutput[] | null | undefined,
  options: AllergyOutputOptions = {},
): string | null {
  const parts = (allergies ?? []).map(formatOne).filter((v): v is string => Boolean(v));
  // A recorded allergen outranks the flag, so a stale assertion can never
  // print a false negative over a real allergy.
  if (parts.length > 0) return parts.join(' · ');
  return options.noKnownAllergies ? NONE_KNOWN : null;
}
