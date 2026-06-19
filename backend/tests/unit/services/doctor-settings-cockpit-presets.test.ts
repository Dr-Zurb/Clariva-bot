/**
 * Doctor Settings — Cockpit Layout Preset Unit Tests (CC-09)
 *
 * Covers:
 *   getCockpitPresetsForUser  — no-row returns [], saved array returns array
 *   putCockpitPresetsForUser  — validation (>5, duplicate ids, bad slots, bad name)
 *   deleteCockpitPresetForUser — 404 on unknown id, filtered array on success
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as database from '../../../src/config/database';
import * as auditLogger from '../../../src/utils/audit-logger';
import {
  getCockpitPresetsForUser,
  putCockpitPresetsForUser,
  deleteCockpitPresetForUser,
  legacyFlatToTree,
} from '../../../src/services/doctor-settings-service';
import { ValidationError, NotFoundError } from '../../../src/utils/errors';
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

/** A valid tree-only preset fixture (112 / clpm-01). */
function makeTreePreset(overrides: Partial<CockpitLayoutPreset> = {}): CockpitLayoutPreset {
  const layout_tree: LayoutNode = {
    kind: 'split',
    direction: 'horizontal',
    sizes: [30, 70],
    children: [
      { kind: 'pane', paneId: 'chart' },
      {
        kind: 'split',
        direction: 'vertical',
        sizes: [60, 40],
        children: [
          { kind: 'pane', paneId: 'body' },
          { kind: 'pane', paneId: 'rx', collapsed: false },
        ],
      },
    ],
  };
  return {
    id: 'preset-tree-123',
    name: 'Tree Layout',
    created_at: '2026-05-24T12:00:00Z',
    sourceTemplateId: 'telemed-video',
    layout_tree,
    ...overrides,
  };
}

/** A valid preset fixture. */
function makePreset(overrides: Partial<CockpitLayoutPreset> = {}): CockpitLayoutPreset {
  return {
    id: 'preset-abc-123',
    name: 'My Layout',
    created_at: '2026-05-10T12:00:00Z',
    layout: {
      slots: ['chart', 'body', 'rx'],
      widths: [26, 48, 26],
      collapsed: { chart: false, rx: false },
    },
    ...overrides,
  };
}

/** Build a minimal Supabase mock for a SELECT → maybeSingle chain. */
function mockSelectChain(response: { data: unknown; error: unknown }) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(response as never),
    single: jest.fn().mockResolvedValue(response as never),
  };
  const from = jest.fn().mockReturnValue(chain);
  return { from, chain };
}

/** Build a Supabase mock for upsert → select → single chain. */
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
  return { from, chain, upsertChain };
}

beforeEach(() => {
  jest.clearAllMocks();
  (auditLogger.logDataModification as jest.Mock).mockResolvedValue(undefined as never);
});

// ---------------------------------------------------------------------------
// getCockpitPresetsForUser
// ---------------------------------------------------------------------------
describe('getCockpitPresetsForUser', () => {
  it('returns [] when no doctor_settings row exists', async () => {
    const { from, chain } = mockSelectChain({ data: null, error: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const result = await getCockpitPresetsForUser(userId);

    expect(result).toEqual([]);
    expect(chain.eq).toHaveBeenCalledWith('doctor_id', userId);
  });

  it('returns the saved presets array when row exists', async () => {
    const presets = [makePreset()];
    const { from } = mockSelectChain({ data: { cockpit_layout_presets: presets }, error: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const result = await getCockpitPresetsForUser(userId);

    expect(result).toEqual(presets);
  });

  it('returns [] when row exists but cockpit_layout_presets is absent', async () => {
    const { from } = mockSelectChain({ data: {}, error: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const result = await getCockpitPresetsForUser(userId);
    expect(result).toEqual([]);
  });

  it('leaves legacy presets unchanged when legacyFlatToTree stub returns undefined', async () => {
    const preset = makePreset();
    const { from } = mockSelectChain({ data: { cockpit_layout_presets: [preset] }, error: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    expect(legacyFlatToTree(preset.layout!)).toBeUndefined();
    const result = await getCockpitPresetsForUser(userId);
    expect(result).toEqual([preset]);
    expect(result[0]?.layout_tree).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// putCockpitPresetsForUser — validation errors
// ---------------------------------------------------------------------------
describe('putCockpitPresetsForUser — validation', () => {
  it('rejects non-array input', async () => {
    await expect(putCockpitPresetsForUser(userId, 'not-an-array')).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects 6 presets (exceeds MAX_COCKPIT_PRESETS = 5)', async () => {
    const sixPresets = Array.from({ length: 6 }, (_, i) =>
      makePreset({ id: `preset-${i}`, name: `Layout ${i}` })
    );
    await expect(putCockpitPresetsForUser(userId, sixPresets)).rejects.toThrow(
      'Maximum 5 cockpit layout presets allowed'
    );
  });

  it('rejects duplicate ids', async () => {
    const presets = [makePreset({ id: 'dup-id' }), makePreset({ id: 'dup-id', name: 'Other' })];
    await expect(putCockpitPresetsForUser(userId, presets)).rejects.toThrow('Duplicate preset id');
  });

  it('rejects invalid slot permutation (duplicate column type)', async () => {
    const preset = makePreset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (preset.layout!.slots as any) = ['chart', 'chart', 'rx'];
    await expect(putCockpitPresetsForUser(userId, [preset])).rejects.toThrow(
      /slots must contain each of chart\/body\/rx exactly once/
    );
  });

  it('rejects a slot value that is not one of chart/body/rx', async () => {
    const preset = makePreset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (preset.layout!.slots as any) = ['chart', 'body', 'INVALID'];
    await expect(putCockpitPresetsForUser(userId, [preset])).rejects.toThrow(
      /slots must be a permutation/
    );
  });

  it('rejects a name longer than 60 characters', async () => {
    const preset = makePreset({ name: 'A'.repeat(61) });
    await expect(putCockpitPresetsForUser(userId, [preset])).rejects.toThrow(
      /name must be 1/
    );
  });

  it('rejects an empty name', async () => {
    const preset = makePreset({ name: '   ' });
    await expect(putCockpitPresetsForUser(userId, [preset])).rejects.toThrow(/name must be 1/);
  });

  it('rejects widths that do not sum to ~100 (tolerance ±5)', async () => {
    const preset = makePreset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (preset.layout!.widths as any) = [10, 10, 10]; // sum = 30
    await expect(putCockpitPresetsForUser(userId, [preset])).rejects.toThrow(/widths must sum to ~100/);
  });

  it('rejects invalid created_at (not ISO-8601)', async () => {
    const preset = makePreset({ created_at: 'not-a-date' });
    await expect(putCockpitPresetsForUser(userId, [preset])).rejects.toThrow(
      /created_at must be ISO-8601/
    );
  });

  it('rejects a preset with neither layout nor layout_tree', async () => {
    const preset = makePreset();
    delete preset.layout;
    await expect(putCockpitPresetsForUser(userId, [preset])).rejects.toThrow(
      /must include layout, layout_tree, or pane_tree_v3/
    );
  });

  it('accepts a tree-only preset (layout_tree without legacy layout)', async () => {
    const { from, upsertChain } = mockUpsertChain({
      data: { cockpit_layout_presets: [makeTreePreset()] },
      error: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const treePreset = makeTreePreset();
    const result = await putCockpitPresetsForUser(userId, [treePreset]);
    expect(result).toEqual([treePreset]);
    expect(upsertChain.select).toHaveBeenCalled();
  });

  it('rejects an invalid layout_tree (split with one child)', async () => {
    const preset = makeTreePreset({
      layout_tree: {
        kind: 'split',
        direction: 'horizontal',
        sizes: [100],
        children: [{ kind: 'pane', paneId: 'chart' }],
      },
    });
    await expect(putCockpitPresetsForUser(userId, [preset])).rejects.toThrow(
      /children must be an array with at least 2 nodes/
    );
  });

  it('rejects an empty sourceTemplateId', async () => {
    const preset = makeTreePreset({ sourceTemplateId: '   ' });
    await expect(putCockpitPresetsForUser(userId, [preset])).rejects.toThrow(
      /sourceTemplateId must be 1/
    );
  });
});

// ---------------------------------------------------------------------------
// putCockpitPresetsForUser — happy path
// ---------------------------------------------------------------------------
describe('putCockpitPresetsForUser — happy path', () => {
  it('upserts valid presets and returns the saved array', async () => {
    const presets = [makePreset()];
    const { from, upsertChain } = mockUpsertChain({
      data: { cockpit_layout_presets: presets },
      error: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const result = await putCockpitPresetsForUser(userId, presets);

    expect(result).toEqual(presets);
    expect(upsertChain.select).toHaveBeenCalledWith('cockpit_layout_presets');
  });

  it('accepts an empty array (clearing all presets)', async () => {
    const { from, upsertChain } = mockUpsertChain({
      data: { cockpit_layout_presets: [] },
      error: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const result = await putCockpitPresetsForUser(userId, []);
    expect(result).toEqual([]);
    expect(upsertChain.select).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteCockpitPresetForUser
// ---------------------------------------------------------------------------
describe('deleteCockpitPresetForUser', () => {
  it('throws NotFoundError for an unknown preset id', async () => {
    const { from } = mockSelectChain({ data: { cockpit_layout_presets: [] }, error: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    await expect(deleteCockpitPresetForUser(userId, 'does-not-exist')).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it('throws ValidationError for a malformed preset id', async () => {
    // id contains spaces — not in PRESET_ID_REGEX
    await expect(deleteCockpitPresetForUser(userId, 'bad id!')).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it('returns the filtered array when the preset is found and deleted', async () => {
    const keep = makePreset({ id: 'keep-me', name: 'Keep' });
    const remove = makePreset({ id: 'remove-me', name: 'Remove' });

    // First call → getCockpitPresetsForUser (SELECT)
    // Second call (inside putCockpitPresetsForUser) → upsert
    const selectMock = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { cockpit_layout_presets: [keep, remove] },
        error: null,
      } as never),
    };
    const upsertInner = {
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { cockpit_layout_presets: [keep] },
        error: null,
      } as never),
    };
    const fromImpl = jest.fn().mockImplementation(() => ({
      ...selectMock,
      upsert: jest.fn().mockReturnValue(upsertInner),
    }));
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from: fromImpl } as never);

    const result = await deleteCockpitPresetForUser(userId, 'remove-me');
    expect(result).toEqual([keep]);
  });
});
