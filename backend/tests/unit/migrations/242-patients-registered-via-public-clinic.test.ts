import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from '@jest/globals';

const sql = readFileSync(
  join(__dirname, '../../../migrations/242_patients_registered_via_public_clinic.sql'),
  'utf8'
);

describe('242_patients_registered_via_public_clinic.sql', () => {
  it('adds public_clinic and keeps the earlier labels', () => {
    expect(sql).toContain("'public_clinic'");
    expect(sql).toContain("'booking_for_other'");
    expect(sql).toContain("'front_desk'");
    expect(sql).toContain("'doctor'");
    expect(sql).not.toContain('CREATE POLICY');
    expect(sql).not.toContain('ENABLE ROW LEVEL SECURITY');
  });
});
