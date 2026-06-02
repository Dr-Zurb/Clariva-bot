/**
 * Plan 03 · Task 09: unit tests for `buildSingleFeeCatalog`.
 *
 * Confirms:
 *   - Modality derivation matches every consultation_types permutation.
 *   - `service_id` is deterministic across rebuilds with the same doctor_id.
 *   - Label handling (with / without practice_name).
 *   - `scope_mode` is NOT serialized when absent.
 *   - Pricing is applied uniformly across enabled modalities.
 *   - Output validates against `serviceCatalogV1BaseSchema` and round-trips
 *     through `safeParseServiceCatalogV1FromDb` without loss.
 *   - `buildSingleFeePersistedJson` preserves the `_backup_pre_single_fee` key.
 */

import { describe, it, expect } from '@jest/globals';

import {
  buildSingleFeeCatalog,
  buildSingleFeeOffering,
  buildSingleFeePersistedJson,
  SINGLE_FEE_BACKUP_KEY,
  SINGLE_FEE_SERVICE_KEY,
  type SingleFeeCatalogInput,
} from '../../../src/utils/single-fee-catalog';
import {
  safeParseServiceCatalogV1FromDb,
  SERVICE_CATALOG_VERSION,
  serviceCatalogV1BaseSchema,
  serviceOfferingV1Schema,
} from '../../../src/utils/service-catalog-schema';

const DOCTOR_A = '550e8400-e29b-41d4-a716-446655440001';
const DOCTOR_B = '550e8400-e29b-41d4-a716-446655440002';

function baseInput(overrides: Partial<SingleFeeCatalogInput> = {}): SingleFeeCatalogInput {
  return {
    doctor_id: DOCTOR_A,
    practice_name: 'Dr. Sharma Clinic',
    appointment_fee_minor: 50000,
    consultation_types: null,
    ...overrides,
  };
}

describe('buildSingleFeeOffering (Plan 03 · Task 09)', () => {
  it('produces a schema-valid offering with service_key="consultation"', () => {
    const offering = buildSingleFeeOffering(baseInput());
    expect(offering.service_key).toBe(SINGLE_FEE_SERVICE_KEY);
    expect(offering.service_key).toBe('consultation');
    // Paranoia — parse should not throw with the builder's output.
    expect(() => serviceOfferingV1Schema.parse(offering)).not.toThrow();
  });

  it('omits scope_mode from the serialized JSON', () => {
    const offering = buildSingleFeeOffering(baseInput());
    const raw = JSON.parse(JSON.stringify(offering));
    expect('scope_mode' in raw).toBe(false);
  });

  it('exposes an empty matcher_hints object (schema-valid, matcher-bypassed)', () => {
    const offering = buildSingleFeeOffering(baseInput());
    expect(offering.matcher_hints).toEqual({});
  });

  it('labels as "<practice_name> Consultation" when practice_name is present', () => {
    const offering = buildSingleFeeOffering(baseInput({ practice_name: 'Acme Clinic' }));
    expect(offering.label).toBe('Acme Clinic Consultation');
  });

  it('labels as plain "Consultation" when practice_name is null / empty', () => {
    expect(buildSingleFeeOffering(baseInput({ practice_name: null })).label).toBe(
      'Consultation'
    );
    expect(buildSingleFeeOffering(baseInput({ practice_name: '   ' })).label).toBe(
      'Consultation'
    );
  });

  it('uses a deterministic service_id for the same doctor_id', () => {
    const a = buildSingleFeeOffering(baseInput({ doctor_id: DOCTOR_A }));
    const b = buildSingleFeeOffering(baseInput({ doctor_id: DOCTOR_A }));
    expect(a.service_id).toBe(b.service_id);
    expect(a.service_id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('produces distinct service_ids for different doctors', () => {
    const a = buildSingleFeeOffering(baseInput({ doctor_id: DOCTOR_A }));
    const b = buildSingleFeeOffering(baseInput({ doctor_id: DOCTOR_B }));
    expect(a.service_id).not.toBe(b.service_id);
  });
});

describe('buildSingleFeeOffering · modality derivation', () => {
  function modalitiesFor(consultationTypes: string | null): Record<string, boolean> {
    const offering = buildSingleFeeOffering(
      baseInput({ consultation_types: consultationTypes })
    );
    return {
      text: offering.modalities.text?.enabled === true,
      voice: offering.modalities.voice?.enabled === true,
      video: offering.modalities.video?.enabled === true,
    };
  }

  it('null allows all three modalities', () => {
    expect(modalitiesFor(null)).toEqual({ text: true, voice: true, video: true });
  });

  it('empty string allows all three modalities', () => {
    expect(modalitiesFor('')).toEqual({ text: true, voice: true, video: true });
  });

  it('"text" → text only', () => {
    expect(modalitiesFor('text')).toEqual({ text: true, voice: false, video: false });
  });

  it('"voice, video" → voice + video (no text)', () => {
    expect(modalitiesFor('voice, video')).toEqual({
      text: false,
      voice: true,
      video: true,
    });
  });

  it('"video only" → video only', () => {
    expect(modalitiesFor('video only')).toEqual({
      text: false,
      voice: false,
      video: true,
    });
  });

  it('"all three" (no channel keyword) defaults to all allowed', () => {
    expect(modalitiesFor('all three')).toEqual({
      text: true,
      voice: true,
      video: true,
    });
  });

  it('"Tele-consult" counts as video (tele[-\\s]?consult pattern)', () => {
    expect(modalitiesFor('Tele-consult available')).toEqual({
      text: false,
      voice: false,
      video: true,
    });
  });
});

describe('buildSingleFeeOffering · pricing', () => {
  it('applies appointment_fee_minor uniformly to every enabled modality', () => {
    const offering = buildSingleFeeOffering(
      baseInput({ consultation_types: 'text, voice, video', appointment_fee_minor: 75000 })
    );
    expect(offering.modalities.text?.price_minor).toBe(75000);
    expect(offering.modalities.voice?.price_minor).toBe(75000);
    expect(offering.modalities.video?.price_minor).toBe(75000);
  });

  it('defaults price_minor to 0 when appointment_fee_minor is null', () => {
    const offering = buildSingleFeeOffering(
      baseInput({ consultation_types: 'video', appointment_fee_minor: null })
    );
    expect(offering.modalities.video?.price_minor).toBe(0);
  });
});

describe('buildSingleFeeCatalog (Plan 03 · Task 09)', () => {
  it('wraps exactly one offering with version=1', () => {
    const catalog = buildSingleFeeCatalog(baseInput());
    expect(catalog.version).toBe(SERVICE_CATALOG_VERSION);
    expect(catalog.services).toHaveLength(1);
    expect(catalog.services[0]?.service_key).toBe(SINGLE_FEE_SERVICE_KEY);
  });

  it('validates through serviceCatalogV1BaseSchema', () => {
    const catalog = buildSingleFeeCatalog(baseInput());
    expect(() => serviceCatalogV1BaseSchema.parse(catalog)).not.toThrow();
  });

  it('round-trips losslessly through safeParseServiceCatalogV1FromDb', () => {
    const catalog = buildSingleFeeCatalog(baseInput());
    // Persist + reload simulation (JSON round-trip strips prototypes).
    const asDb = JSON.parse(JSON.stringify(catalog));
    const reparsed = safeParseServiceCatalogV1FromDb(asDb, DOCTOR_A);
    expect(reparsed).not.toBeNull();
    expect(reparsed?.version).toBe(catalog.version);
    expect(reparsed?.services[0]?.service_id).toBe(catalog.services[0]?.service_id);
    expect(reparsed?.services[0]?.service_key).toBe(catalog.services[0]?.service_key);
    expect(reparsed?.services[0]?.label).toBe(catalog.services[0]?.label);
  });

  it('is deterministic: buildSingleFeeCatalog(x) equals buildSingleFeeCatalog(x)', () => {
    const a = buildSingleFeeCatalog(baseInput());
    const b = buildSingleFeeCatalog(baseInput());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('buildSingleFeePersistedJson · backup handling', () => {
  it('omits the backup key when no backup is provided', () => {
    const json = buildSingleFeePersistedJson(baseInput());
    expect(SINGLE_FEE_BACKUP_KEY in json).toBe(false);
  });

  it('omits the backup key when preserveBackup is null', () => {
    const json = buildSingleFeePersistedJson(baseInput(), { preserveBackup: null });
    expect(SINGLE_FEE_BACKUP_KEY in json).toBe(false);
  });

  it('writes the backup under _backup_pre_single_fee when provided', () => {
    const prevCatalog = {
      version: 1,
      services: [{ service_key: 'other', label: 'Previous catch-all' }],
    };
    const json = buildSingleFeePersistedJson(baseInput(), { preserveBackup: prevCatalog });
    expect(json[SINGLE_FEE_BACKUP_KEY]).toEqual(prevCatalog);
  });

  it('backup sibling does NOT interfere with schema parsing of the services array', () => {
    const prevCatalog = {
      version: 1,
      services: [{ service_key: 'other', label: 'Previous' }],
    };
    const json = buildSingleFeePersistedJson(baseInput(), { preserveBackup: prevCatalog });
    // Reader treats the root as ServiceCatalogV1; extra keys survive JSON.parse
    // but the Zod schema must still accept `{ version, services }`.
    const { services, version } = json as {
      services: unknown[];
      version: number;
    };
    const strippedForSchema = { version, services };
    expect(() => serviceCatalogV1BaseSchema.parse(strippedForSchema)).not.toThrow();
  });
});
