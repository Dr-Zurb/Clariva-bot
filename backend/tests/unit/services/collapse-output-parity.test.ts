/**
 * subj-31 close-gate — patient-facing output never reads collapse map.
 *
 * Collapse is doctor-level cockpit config (UI-only). PDF/SMS builders must
 * remain independent of `subjective_section_collapsed`, same structural guard
 * as subj-27's section-order parity test.
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('subj-31 close-gate · patient output invariant to collapse map', () => {
  it('output builder source files never reference subjective_section_collapsed (structural guard)', () => {
    const files = [
      resolve(__dirname, '../../../src/services/prescription-pdf-composer.ts'),
      resolve(__dirname, '../../../src/services/prescription-pdf-service.ts'),
      resolve(__dirname, '../../../src/templates/prescription-pdf/PrescriptionDocument.tsx'),
      resolve(__dirname, '../../../src/templates/prescription-pdf/types.ts'),
      resolve(__dirname, '../../../src/services/notification-service.ts'),
    ];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      expect(src).not.toMatch(/subjective_section_collapsed/);
      expect(src).not.toMatch(/subjectiveSectionCollapsed/);
    }
  });
});
