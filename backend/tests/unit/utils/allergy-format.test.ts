import { formatAllergiesForOutput } from '../../../src/utils/allergy-format';

describe('formatAllergiesForOutput', () => {
  it('returns null when the list is empty and nil-known was never asserted', () => {
    expect(formatAllergiesForOutput([])).toBeNull();
    expect(formatAllergiesForOutput(null)).toBeNull();
    expect(formatAllergiesForOutput(undefined)).toBeNull();
    expect(formatAllergiesForOutput([], { noKnownAllergies: false })).toBeNull();
  });

  it('returns No known allergies when the doctor asserted nil-known', () => {
    expect(formatAllergiesForOutput([], { noKnownAllergies: true })).toBe('No known allergies');
    expect(formatAllergiesForOutput(null, { noKnownAllergies: true })).toBe('No known allergies');
  });

  it('prefers a recorded allergen over a stale nil-known assertion', () => {
    expect(
      formatAllergiesForOutput([{ allergen: 'Penicillin', severity: 'severe', reaction: null }], {
        noKnownAllergies: true,
      }),
    ).toBe('Penicillin (severe)');
  });

  it('omits the line when every row is blank unless nil-known was asserted', () => {
    expect(formatAllergiesForOutput([{ allergen: '  ' }])).toBeNull();
    expect(formatAllergiesForOutput([{ allergen: '  ' }], { noKnownAllergies: true })).toBe(
      'No known allergies',
    );
  });

  it('prints allergen alone when severity is unknown and there is no reaction', () => {
    expect(
      formatAllergiesForOutput([{ allergen: 'Penicillin', severity: 'unknown', reaction: null }]),
    ).toBe('Penicillin');
  });

  it('prints allergen (severity — reaction) and joins multiple with a middle dot', () => {
    expect(
      formatAllergiesForOutput([
        { allergen: '  Penicillin  ', severity: 'severe', reaction: 'rash' },
        { allergen: 'Sulfa', severity: 'mild', reaction: null },
      ]),
    ).toBe('Penicillin (severe — rash) · Sulfa (mild)');
  });

  it('drops blank allergen rows and does not print clinician notes', () => {
    expect(
      formatAllergiesForOutput([
        { allergen: '   ', severity: 'severe', reaction: 'ignored' },
        { allergen: 'NSAIDs', severity: 'moderate', reaction: 'wheeze' },
      ]),
    ).toBe('NSAIDs (moderate — wheeze)');
  });
});
