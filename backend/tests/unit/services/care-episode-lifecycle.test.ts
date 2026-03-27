/**
 * SFU-04: care episode completion planner + snapshot builder
 */

import { describe, it, expect } from '@jest/globals';
import type { CareEpisodeRow } from '../../../src/types/care-episode';
import {
  buildEpisodePriceSnapshotJson,
  planCareEpisodeOnCompletedVisit,
} from '../../../src/services/care-episode-service';
import type { ServiceCatalogV1 } from '../../../src/utils/service-catalog-schema';

function episode(partial: Partial<CareEpisodeRow> = {}): CareEpisodeRow {
  return {
    id: 'ep-1',
    doctor_id: 'd1',
    patient_id: 'p1',
    catalog_service_key: 'skin',
    status: 'active',
    started_at: '',
    eligibility_ends_at: null,
    followups_used: 0,
    max_followups: 3,
    price_snapshot_json: {},
    index_appointment_id: 'a-index',
    created_at: '',
    updated_at: '',
    ...partial,
  };
}

describe('planCareEpisodeOnCompletedVisit', () => {
  it('increments when appointment.episode_id is set', () => {
    const plan = planCareEpisodeOnCompletedVisit({
      appointmentId: 'a2',
      appointmentEpisodeId: 'ep-x',
      activeEpisode: null,
    });
    expect(plan).toEqual({ kind: 'increment', episodeId: 'ep-x' });
  });

  it('create_index when no active episode and no episode_id', () => {
    const plan = planCareEpisodeOnCompletedVisit({
      appointmentId: 'a-new',
      appointmentEpisodeId: null,
      activeEpisode: null,
    });
    expect(plan).toEqual({ kind: 'create_index' });
  });

  it('noop when active episode index appointment is this visit', () => {
    const plan = planCareEpisodeOnCompletedVisit({
      appointmentId: 'a-index',
      appointmentEpisodeId: null,
      activeEpisode: episode({ index_appointment_id: 'a-index' }),
    });
    expect(plan).toEqual({ kind: 'noop' });
  });

  it('increment active episode when appointment has no episode_id but episode exists for another index', () => {
    const plan = planCareEpisodeOnCompletedVisit({
      appointmentId: 'a-follow',
      appointmentEpisodeId: null,
      activeEpisode: episode({ id: 'ep-99', index_appointment_id: 'a-index' }),
    });
    expect(plan).toEqual({ kind: 'increment', episodeId: 'ep-99' });
  });
});

describe('buildEpisodePriceSnapshotJson', () => {
  it('embeds modalities + followup_policy clone', () => {
    const cat: ServiceCatalogV1 = {
      version: 1,
      services: [
        {
          service_key: 'skin',
          label: 'Skin',
          modalities: {
            video: { enabled: true, price_minor: 5000 },
            text: { enabled: false, price_minor: 0 },
          },
          followup_policy: {
            enabled: true,
            max_followups: 2,
            eligibility_window_days: 30,
            discount_type: 'percent',
            discount_value: 10,
          },
        },
      ],
    };
    const snap = buildEpisodePriceSnapshotJson(cat.services[0]!);
    expect(snap.version).toBe(1);
    expect((snap.modalities as Record<string, unknown>).video).toEqual({ price_minor: 5000 });
    expect(snap.followup_policy).toEqual(cat.services[0]!.followup_policy);
  });
});
