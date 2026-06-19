/**
 * Cockpit layout preset tree validation (clpm-02 / 112).
 *
 * Zod-backed tree shape + putCockpitPresetsForUser roundtrip.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as database from '../../../src/config/database';
import * as auditLogger from '../../../src/utils/audit-logger';
import {
  putCockpitPresetsForUser,
  getCockpitPresetsForUser,
} from '../../../src/services/doctor-settings-service';
import { parseCockpitLayoutPresets } from '../../../src/api/routes/cockpit-layout-presets';
import { ValidationError } from '../../../src/utils/errors';
import type { CockpitLayoutPreset, LayoutNode } from '../../../src/types/doctor-settings';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/utils/audit-logger', () => ({
  logDataModification: jest.fn().mockResolvedValue(undefined as never),
  logDataAccess: jest.fn().mockResolvedValue(undefined as never),
  logAuditEvent: jest.fn().mockResolvedValue(undefined as never),
}));

const mockedDb = database as jest.Mocked<typeof database>;
const userId = '550e8400-e29b-41d4-a716-446655440001';

const TREE_PRESET: LayoutNode = {
  kind: 'split',
  direction: 'horizontal',
  sizes: [30, 70],
  children: [
    { kind: 'pane', paneId: 'snapshot' },
    {
      kind: 'split',
      direction: 'vertical',
      sizes: [60, 40],
      children: [
        { kind: 'pane', paneId: 'body' },
        { kind: 'pane', paneId: 'rx' },
      ],
    },
  ],
};

function makeTreePreset(overrides: Partial<CockpitLayoutPreset> = {}): CockpitLayoutPreset {
  return {
    id: 'preset-tree-roundtrip',
    name: 'Tree Roundtrip',
    created_at: '2026-05-24T12:00:00Z',
    sourceTemplateId: 'telemed-video',
    layout_tree: TREE_PRESET,
    ...overrides,
  };
}

function mockUpsertChain(response: { data: unknown; error: unknown }) {
  const upsertChain = {
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(response as never),
  };
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null } as never),
    upsert: jest.fn().mockReturnValue(upsertChain),
  };
  const from = jest.fn().mockReturnValue(chain);
  return { from, upsertChain };
}

beforeEach(() => {
  jest.clearAllMocks();
  (auditLogger.logDataModification as jest.Mock).mockResolvedValue(undefined as never);
});

describe('parseCockpitLayoutPresets (Zod)', () => {
  it('accepts a valid tree-only preset', () => {
    const parsed = parseCockpitLayoutPresets([makeTreePreset()]);
    expect(parsed[0]?.layout_tree).toEqual(TREE_PRESET);
  });

  it('rejects a preset with neither layout nor layout_tree', () => {
    const preset = makeTreePreset();
    delete preset.layout_tree;
    expect(() => parseCockpitLayoutPresets([preset])).toThrow(
      /must include layout, layout_tree, or pane_tree_v3/,
    );
  });

  it('rejects 6 presets (DL-8 max cap)', () => {
    const six = Array.from({ length: 6 }, (_, i) =>
      makeTreePreset({ id: `preset-${i}`, name: `Layout ${i}` }),
    );
    expect(() => parseCockpitLayoutPresets(six)).toThrow(/Maximum 5 cockpit layout presets allowed/);
  });

  it('preserves sourceTemplateId when set', () => {
    const parsed = parseCockpitLayoutPresets([
      makeTreePreset({ sourceTemplateId: 'telemed-text' }),
    ]);
    expect(parsed[0]?.sourceTemplateId).toBe('telemed-text');
  });

  it('accepts a v3 pane_tree_v3 preset (full fidelity)', () => {
    const paneTreeV3 = {
      id: '__root__',
      sizePct: 100,
      hidden: false,
      direction: 'horizontal' as const,
      children: [
        {
          id: 'snapshot',
          sizePct: 50,
          hidden: false,
          paneIds: ['snapshot'],
          activeTabId: 'snapshot',
        },
        {
          id: 'assessment',
          sizePct: 50,
          hidden: false,
          paneIds: ['assessment', 'plan'],
          activeTabId: 'assessment',
        },
      ],
    };
    const parsed = parseCockpitLayoutPresets([
      {
        id: 'preset-v3',
        name: 'My Consult',
        created_at: '2026-06-03T00:00:00.000Z',
        pane_tree_v3: paneTreeV3,
      },
    ]);
    expect(parsed[0]?.pane_tree_v3).toEqual(paneTreeV3);
  });
});

describe('putCockpitPresetsForUser — tree roundtrip', () => {
  it('save a tree preset → roundtrip preserves shape', async () => {
    const preset = makeTreePreset();
    const { from, upsertChain } = mockUpsertChain({
      data: { cockpit_layout_presets: [preset] },
      error: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const saved = await putCockpitPresetsForUser(userId, [preset]);
    expect(saved).toEqual([preset]);
    expect(saved[0]?.layout_tree).toEqual(TREE_PRESET);
    expect(saved[0]?.sourceTemplateId).toBe('telemed-video');
    expect(upsertChain.select).toHaveBeenCalledWith('cockpit_layout_presets');
  });

  it('rejects save with neither layout nor layout_tree', async () => {
    const preset = makeTreePreset();
    delete preset.layout_tree;
    await expect(putCockpitPresetsForUser(userId, [preset])).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(putCockpitPresetsForUser(userId, [preset])).rejects.toThrow(
      /must include layout, layout_tree, or pane_tree_v3/,
    );
  });

  it('rejects 6th preset (DL-8 max cap)', async () => {
    const six = Array.from({ length: 6 }, (_, i) =>
      makeTreePreset({ id: `preset-${i}`, name: `Layout ${i}` }),
    );
    await expect(putCockpitPresetsForUser(userId, six)).rejects.toThrow(
      'Maximum 5 cockpit layout presets allowed',
    );
  });

  it('get after put returns the same tree shape', async () => {
    const preset = makeTreePreset();
    const selectMock = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { cockpit_layout_presets: [preset] },
        error: null,
      } as never),
    };
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn().mockReturnValue(selectMock),
    } as never);

    const loaded = await getCockpitPresetsForUser(userId);
    expect(loaded[0]?.layout_tree).toEqual(TREE_PRESET);
    expect(loaded[0]?.sourceTemplateId).toBe('telemed-video');
  });
});
