/**
 * subj-22 — custom-subsections output helpers (PDF/SMS mirror).
 *
 * Verifies the sanitiser empty-omits cleanly and the text serializer mirrors
 * the frontend `serializeCustomSubsections` order/indentation so the SMS the
 * patient receives matches the cockpit preview.
 */

import {
  sanitizeCustomSubsectionsForOutput,
  serializeCustomSubsections,
} from '../../../src/utils/custom-subsections';
import type { CustomSubsection } from '../../../src/types/prescription';

describe('sanitizeCustomSubsectionsForOutput (subj-22)', () => {
  it('returns [] for null / non-array input', () => {
    expect(sanitizeCustomSubsectionsForOutput(null)).toEqual([]);
    expect(sanitizeCustomSubsectionsForOutput(undefined)).toEqual([]);
    // @ts-expect-error — defensive against malformed JSONB.
    expect(sanitizeCustomSubsectionsForOutput('nope')).toEqual([]);
  });

  it('drops children without a title and sections with no surviving content', () => {
    const sections: CustomSubsection[] = [
      {
        id: 's1',
        title: 'Travel',
        body: null,
        children: [
          { id: 'c1', title: 'Region', body: 'Kerala' },
          { id: 'c2', title: '   ', body: 'orphan' },
        ],
      },
      { id: 's2', title: '  ', body: '  ', children: [] },
    ];
    expect(sanitizeCustomSubsectionsForOutput(sections)).toEqual([
      { title: 'Travel', body: null, children: [{ title: 'Region', body: 'Kerala' }] },
    ]);
  });

  it('keeps a section that only has children (no title/body)', () => {
    const sections: CustomSubsection[] = [
      { id: 's1', title: '', body: null, children: [{ id: 'c1', title: 'Only child', body: 'b' }] },
    ];
    expect(sanitizeCustomSubsectionsForOutput(sections)).toEqual([
      { title: '', body: null, children: [{ title: 'Only child', body: 'b' }] },
    ]);
  });
});

describe('serializeCustomSubsections (subj-22)', () => {
  it('returns empty string when nothing survives', () => {
    expect(serializeCustomSubsections([])).toBe('');
    expect(
      serializeCustomSubsections([{ id: 's', title: '', body: '', children: [] }]),
    ).toBe('');
  });

  it('serialises section + body + indented children, sections blank-line separated', () => {
    const sections: CustomSubsection[] = [
      {
        id: 's1',
        title: 'Travel history',
        body: 'Visited Kerala',
        children: [{ id: 'c1', title: 'Prophylaxis', body: 'Doxycycline' }],
      },
      {
        id: 's2',
        title: 'Diet',
        body: 'Vegetarian',
        children: [],
      },
    ];
    expect(serializeCustomSubsections(sections)).toBe(
      [
        'Travel history',
        'Visited Kerala',
        '',
        '  Prophylaxis',
        '  Doxycycline',
        '',
        'Diet',
        'Vegetarian',
      ].join('\n'),
    );
  });

  it('omits empty child bodies without stray whitespace', () => {
    const sections: CustomSubsection[] = [
      { id: 's1', title: 'Notes', body: null, children: [{ id: 'c1', title: 'Item', body: null }] },
    ];
    expect(serializeCustomSubsections(sections)).toBe(['Notes', '', '  Item'].join('\n'));
  });
});
