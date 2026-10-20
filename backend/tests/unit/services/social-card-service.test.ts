/**
 * Social cards — soc-03.
 * Owner scope, rejected patient fields, audit ids only.
 */

import { readFileSync } from 'fs';
import path from 'path';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ZodError } from 'zod';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));
jest.mock('../../../src/utils/audit-logger', () => ({
  logDataAccess: jest.fn().mockResolvedValue(undefined as never),
  logDataModification: jest.fn().mockResolvedValue(undefined as never),
}));

import * as database from '../../../src/config/database';
import { logDataModification } from '../../../src/utils/audit-logger';
import {
  createSocialCard,
  ensureSocialCardLink,
  findSocialCardLink,
  getSocialCardFileUrl,
  getSocialPagePath,
  listSocialCards,
  purgeBinnedSocialCard,
  recordSocialCardVisit,
  removeSocialCardFile,
  reuseSocialCard,
  updateSocialCard,
  createSocialColumn,
  renameSocialColumn,
  deleteSocialColumn,
} from '../../../src/services/social-card-service';
import { NotFoundError, ValidationError } from '../../../src/utils/errors';
import {
  createSocialCardSchema,
  updateSocialCardSchema,
} from '../../../src/controllers/social-card-controller';

const mockedDb = database as jest.Mocked<typeof database>;
const mockedAudit = logDataModification as jest.MockedFunction<typeof logDataModification>;

const correlationId = 'corr-soc-03';
const doctorId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const otherDoctorId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const row = {
  id: '11111111-1111-1111-1111-111111111111',
  doctor_id: doctorId,
  stage: 'thoughts' as const,
  title: 'Fees for a first visit',
  format: null,
  topic: null,
  words: {},
  file_path: null,
  created_at: '2026-10-11T00:00:00.000Z',
  updated_at: '2026-10-11T00:00:00.000Z',
};

function listChain(rows: unknown[]) {
  const chain = {
    select: jest.fn(),
    eq: jest.fn(),
    is: jest.fn(),
    order: jest.fn(),
    then(onFulfilled: (v: { data: unknown[]; error: null }) => unknown) {
      return Promise.resolve(onFulfilled({ data: rows, error: null }));
    },
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  return chain;
}

function writeChain(result: { data: unknown; error: null }) {
  const chain = {
    insert: jest.fn(),
    update: jest.fn(),
    select: jest.fn(),
    eq: jest.fn(),
    single: jest.fn().mockResolvedValue(result as never),
    maybeSingle: jest.fn().mockResolvedValue(result as never),
  };
  chain.insert.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  return chain;
}

describe('social cards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists only the caller doctor', async () => {
    const chain = listChain([row]);
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(() => chain),
    } as never);

    const cards = await listSocialCards(correlationId, doctorId);

    expect(cards).toEqual([
      {
        id: row.id,
        stage: 'thoughts',
        title: row.title,
        format: null,
        topic: null,
        words: {},
        hasFile: false,
        fileKind: null,
        postable: false,
        scraps: [],
        frames: [],
        links: [],
        sourceUrl: null,
        scheduledAt: null,
        publishError: null,
        instagramUrl: null,
        visitCount: 0,
        columnId: null,
        linkCode: null,
        deletedAt: null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    ]);
    expect(chain.eq).toHaveBeenCalledWith('doctor_id', doctorId);
    expect(chain.eq).not.toHaveBeenCalledWith('doctor_id', otherDoctorId);
    expect(chain.is).toHaveBeenCalledWith('deleted_at', null);
  });

  it('creates a card for the caller in a column that has no file', async () => {
    const making = { ...row, stage: 'making' as const };
    const chain = writeChain({ data: making, error: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(() => chain),
    } as never);

    const card = await createSocialCard(
      { title: 'Fees for a first visit', stage: 'making' },
      correlationId,
      doctorId
    );

    expect(card.stage).toBe('making');
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ doctor_id: doctorId, stage: 'making' })
    );
    const auditPayload = JSON.stringify(mockedAudit.mock.calls);
    expect(auditPayload).toContain(row.id);
    expect(auditPayload).not.toContain('Fees for a first visit');
  });

  it('rejects Ready without a file', async () => {
    await expect(
      createSocialCard({ title: 'Fees for a first visit', stage: 'ready' }, correlationId, doctorId)
    ).rejects.toBeInstanceOf(ValidationError);
    expect(() =>
      createSocialCardSchema.parse({ title: 'Fees for a first visit', stage: 'ready' })
    ).toThrow(ZodError);
  });

  it('saves a Post without a shot list', () => {
    const parsed = createSocialCardSchema.parse({
      title: 'Fees for a first visit',
      format: 'post',
      words: { caption: 'What a first visit costs', firstComment: 'The page is here' },
    });
    expect(parsed.words?.shots).toBeUndefined();
    expect(
      createSocialCardSchema.parse({
        title: 'Fees for a first visit',
        words: { note: 'Parents keep asking when to come in' },
      }).words?.note
    ).toBe('Parents keep asking when to come in');
    expect(
      createSocialCardSchema.parse({
        title: 'Fees for a first visit',
        words: { note: 'a'.repeat(4000) },
      }).words?.note
    ).toHaveLength(4000);
    expect(() =>
      createSocialCardSchema.parse({
        title: 'Fees for a first visit',
        words: { note: 'a'.repeat(4001) },
      })
    ).toThrow(ZodError);
  });

  it('creates Ready when the file belongs to this doctor', async () => {
    const fileName = '11111111-1111-4111-8111-111111111111.jpg';
    const filePath = `${doctorId}/${fileName}`;
    const ready = { ...row, stage: 'ready' as const, file_path: filePath };
    const chain = writeChain({ data: ready, error: null });
    const list = jest.fn().mockResolvedValue({
      data: [{ name: fileName, metadata: { size: 1200 } }],
      error: null,
    } as never);
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(() => chain),
      storage: { from: jest.fn(() => ({ list })) },
    } as never);

    const card = await createSocialCard(
      { title: 'Fees for a first visit', stage: 'ready', filePath },
      correlationId,
      doctorId
    );

    expect(card.stage).toBe('ready');
    expect(card.hasFile).toBe(true);
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'ready', file_path: filePath, doctor_id: doctorId })
    );
    expect(list).toHaveBeenCalled();
    expect(JSON.stringify(mockedAudit.mock.calls)).not.toContain(filePath);
  });

  it('rejects a PDF on Ready and removes it', async () => {
    const fileName = '11111111-1111-4111-8111-111111111111.pdf';
    const filePath = `${doctorId}/${fileName}`;
    const list = jest.fn().mockResolvedValue({
      data: [{ name: fileName, metadata: { size: 1200 } }],
      error: null,
    } as never);
    const remove = jest.fn().mockResolvedValue({ error: null } as never);
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(),
      storage: { from: jest.fn(() => ({ list, remove })) },
    } as never);

    await expect(
      createSocialCard({ title: 'A poster', stage: 'ready', filePath }, correlationId, doctorId)
    ).rejects.toBeInstanceOf(ValidationError);
    expect(remove).toHaveBeenCalledWith([filePath]);
  });

  it('rejects a photo over 8 MB', async () => {
    const fileName = '11111111-1111-4111-8111-111111111111.jpg';
    const filePath = `${doctorId}/${fileName}`;
    const list = jest.fn().mockResolvedValue({
      data: [{ name: fileName, metadata: { size: 9 * 1024 * 1024 } }],
      error: null,
    } as never);
    const remove = jest.fn().mockResolvedValue({ error: null } as never);
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(),
      storage: { from: jest.fn(() => ({ list, remove })) },
    } as never);

    await expect(
      createSocialCard({ title: 'A poster', stage: 'thoughts', filePath }, correlationId, doctorId)
    ).rejects.toThrow('Photo is over 8 MB');
    expect(remove).toHaveBeenCalledWith([filePath]);
  });

  it('rejects a GIF on Ready', async () => {
    const fileName = '11111111-1111-4111-8111-111111111111.gif';
    const filePath = `${doctorId}/${fileName}`;
    const list = jest.fn().mockResolvedValue({
      data: [{ name: fileName, metadata: { size: 1200 } }],
      error: null,
    } as never);
    const remove = jest.fn().mockResolvedValue({ error: null } as never);
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(),
      storage: { from: jest.fn(() => ({ list, remove })) },
    } as never);

    await expect(
      createSocialCard({ title: 'A clip', stage: 'ready', filePath }, correlationId, doctorId)
    ).rejects.toThrow('Ready needs a JPEG, PNG, WebP, MP4, or MOV');
  });

  it('keeps a Word file on a thought', async () => {
    const fileName = '11111111-1111-4111-8111-111111111111.docx';
    const filePath = `${doctorId}/${fileName}`;
    const thought = { ...row, file_path: filePath };
    const chain = writeChain({ data: thought, error: null });
    const list = jest.fn().mockResolvedValue({
      data: [{ name: fileName, metadata: { size: 1200 } }],
      error: null,
    } as never);
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(() => chain),
      storage: { from: jest.fn(() => ({ list })) },
    } as never);

    const card = await createSocialCard(
      { title: 'A handout', stage: 'thoughts', filePath },
      correlationId,
      doctorId
    );

    expect(card.stage).toBe('thoughts');
    expect(card.fileKind).toBe('document');
  });

  it('keeps a file on a thought', async () => {
    const fileName = '11111111-1111-4111-8111-111111111111.jpg';
    const filePath = `${doctorId}/${fileName}`;
    const thought = { ...row, file_path: filePath };
    const chain = writeChain({ data: thought, error: null });
    const list = jest.fn().mockResolvedValue({
      data: [{ name: fileName, metadata: { size: 1200 } }],
      error: null,
    } as never);
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(() => chain),
      storage: { from: jest.fn(() => ({ list })) },
    } as never);

    const card = await createSocialCard(
      { title: 'Fees for a first visit', stage: 'thoughts', filePath },
      correlationId,
      doctorId
    );

    expect(card.stage).toBe('thoughts');
    expect(card.hasFile).toBe(true);
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'thoughts', file_path: filePath, doctor_id: doctorId })
    );
    expect(JSON.stringify(mockedAudit.mock.calls)).not.toContain(filePath);
  });

  it('moves a card out of Ready when the file is removed', async () => {
    const filePath = `${doctorId}/11111111-1111-4111-8111-111111111111.jpg`;
    const ready = { ...row, stage: 'ready' as const, file_path: filePath };
    const making = { ...row, stage: 'making' as const, file_path: null };
    const chain = writeChain({ data: null, error: null });
    chain.maybeSingle
      .mockResolvedValueOnce({ data: ready, error: null } as never)
      .mockResolvedValueOnce({ data: making, error: null } as never);
    const remove = jest.fn().mockResolvedValue({ error: null } as never);
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(() => chain),
      storage: { from: jest.fn(() => ({ remove })) },
    } as never);

    const card = await removeSocialCardFile(row.id, correlationId, doctorId);

    expect(card.stage).toBe('making');
    expect(card.hasFile).toBe(false);
    expect(chain.update).toHaveBeenCalledWith({
      file_path: null,
      stage: 'making',
      scheduled_at: null,
    });
    expect(remove).toHaveBeenCalledWith([filePath]);
  });

  it('does not open another doctor file', async () => {
    const chain = writeChain({ data: null, error: null });
    const signed = jest.fn();
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(() => chain),
      storage: { from: jest.fn(() => ({ createSignedUrl: signed })) },
    } as never);

    await expect(getSocialCardFileUrl(row.id, correlationId, otherDoctorId)).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(signed).not.toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('doctor_id', otherDoctorId);
  });

  it('saves a time on a Ready card and clears it back to Ready', async () => {
    const when = '2026-10-13T13:39:00.000Z';
    const ready = { ...row, stage: 'ready' as const, file_path: `${doctorId}/file.jpg` };
    const timed = { ...ready, scheduled_at: when };
    const cleared = { ...ready, scheduled_at: null };
    const chain = writeChain({ data: null, error: null });
    chain.maybeSingle
      .mockResolvedValueOnce({ data: ready, error: null } as never)
      .mockResolvedValueOnce({ data: timed, error: null } as never)
      .mockResolvedValueOnce({ data: timed, error: null } as never)
      .mockResolvedValueOnce({ data: cleared, error: null } as never);
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(() => chain),
    } as never);

    const saved = await updateSocialCard(row.id, { scheduledAt: when }, correlationId, doctorId);
    expect(saved.stage).toBe('ready');
    expect(saved.scheduledAt).toBe(when);
    const minted = chain.update.mock.calls[0]?.[0] as { scheduled_at?: string; link_code?: string };
    expect(minted.scheduled_at).toBe(when);
    expect(minted.link_code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{10}$/);

    const back = await updateSocialCard(row.id, { scheduledAt: null }, correlationId, doctorId);
    expect(back.stage).toBe('ready');
    expect(back.scheduledAt).toBeNull();
    expect(chain.update).toHaveBeenLastCalledWith({ scheduled_at: null });
    const auditPayload = JSON.stringify(mockedAudit.mock.calls);
    expect(auditPayload).not.toContain(when);
    expect(auditPayload).not.toContain(minted.link_code);
  });

  it('keeps a card code the next day and still expires a chat code', async () => {
    const code = '23456789AB';
    const chain = writeChain({
      data: { id: row.id, doctor_id: doctorId },
      error: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(() => chain),
    } as never);

    await expect(findSocialCardLink(code, correlationId)).resolves.toEqual({
      cardId: row.id,
      doctorId,
    });
    expect(chain.eq).toHaveBeenCalledWith('link_code', code);
    await expect(findSocialCardLink('23456789', correlationId)).resolves.toBeNull();

    const chat = readFileSync(
      path.join(__dirname, '../../../src/services/visit-page-link-service.ts'),
      'utf8'
    );
    expect(chat).toContain('const LINK_TTL_MS = 60 * 60 * 1000');
    expect(chat).toContain('expires_at');
  });

  it('gives a posted card one code and hides it from another doctor', async () => {
    const chain = writeChain({ data: null, error: null });
    chain.maybeSingle
      .mockResolvedValueOnce({ data: row, error: null } as never)
      .mockResolvedValueOnce({
        data: { ...row, link_code: '23456789AB' },
        error: null,
      } as never);
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(() => chain),
    } as never);

    const card = await ensureSocialCardLink(row.id, correlationId, doctorId);
    expect(card.linkCode).toBe('23456789AB');
    const minted = chain.update.mock.calls[0]?.[0] as { link_code?: string };
    expect(minted.link_code).toMatch(
      /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{10}$/
    );
    expect(JSON.stringify(mockedAudit.mock.calls)).not.toContain(minted.link_code);

    chain.maybeSingle.mockResolvedValue({ data: null, error: null } as never);
    await expect(ensureSocialCardLink(row.id, correlationId, otherDoctorId)).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it('pastes an Instagram URL, leaves Ready, and keeps the page code', async () => {
    const url = 'https://www.instagram.com/p/DummyPost01/';
    const filePath = `${doctorId}/11111111-1111-4111-8111-111111111111.jpg`;
    const ready = {
      ...row,
      stage: 'ready' as const,
      file_path: filePath,
      scheduled_at: '2026-10-13T13:39:00.000Z',
      link_code: '23456789AB',
    };
    const posted = {
      ...ready,
      stage: 'posted' as const,
      file_path: null,
      instagram_url: url,
    };
    const chain = writeChain({ data: null, error: null });
    chain.maybeSingle
      .mockResolvedValueOnce({ data: ready, error: null } as never)
      .mockResolvedValueOnce({ data: posted, error: null } as never);
    const remove = jest.fn().mockResolvedValue({ error: null } as never);
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(() => chain),
      storage: { from: jest.fn(() => ({ remove })) },
    } as never);

    const card = await updateSocialCard(row.id, { instagramUrl: url }, correlationId, doctorId);

    expect(card.stage).toBe('posted');
    expect(card.scheduledAt).toBe('2026-10-13T13:39:00.000Z');
    expect(card.hasFile).toBe(false);
    expect(card.instagramUrl).toBe(url);
    expect(card.linkCode).toBe('23456789AB');
    expect(card.visitCount).toBe(0);
    expect(chain.update).toHaveBeenCalledWith({
      stage: 'posted',
      instagram_url: url,
      file_path: null,
    });
    expect(remove).toHaveBeenCalledWith([filePath]);
    const auditPayload = JSON.stringify(mockedAudit.mock.calls);
    expect(auditPayload).not.toContain(url);
    expect(auditPayload).not.toContain('23456789AB');
  });

  it('gives a pasted card a page code when it does not have one', async () => {
    const url = 'https://www.instagram.com/reel/DummyReel01/';
    const filePath = `${doctorId}/11111111-1111-4111-8111-111111111111.jpg`;
    const ready = { ...row, stage: 'ready' as const, file_path: filePath };
    const chain = writeChain({ data: null, error: null });
    chain.maybeSingle
      .mockResolvedValueOnce({ data: ready, error: null } as never)
      .mockResolvedValueOnce({
        data: { ...ready, stage: 'posted', file_path: null, instagram_url: url, link_code: '23456789AB' },
        error: null,
      } as never);
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(() => chain),
      storage: {
        from: jest.fn(() => ({ remove: jest.fn().mockResolvedValue({ error: null } as never) })),
      },
    } as never);

    await updateSocialCard(row.id, { instagramUrl: url }, correlationId, doctorId);
    const minted = chain.update.mock.calls[0]?.[0] as { link_code?: string };
    expect(minted.link_code).toMatch(
      /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{10}$/
    );
    expect(JSON.stringify(mockedAudit.mock.calls)).not.toContain(minted.link_code);
    expect(JSON.stringify(mockedAudit.mock.calls)).not.toContain(url);
  });

  it('rejects a link that is not an Instagram post', async () => {
    const ready = {
      ...row,
      stage: 'ready' as const,
      file_path: `${doctorId}/11111111-1111-4111-8111-111111111111.jpg`,
    };
    const chain = writeChain({ data: ready, error: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(() => chain),
    } as never);

    await expect(
      updateSocialCard(
        row.id,
        { instagramUrl: 'https://example.com/p/DummyPost01' },
        correlationId,
        doctorId
      )
    ).rejects.toBeInstanceOf(ValidationError);
    expect(chain.update).not.toHaveBeenCalled();
    expect(() =>
      updateSocialCardSchema.parse({
        instagramUrl: 'https://www.instagram.com/p/DummyPost01/',
        title: 'Fees',
      })
    ).toThrow(ZodError);
    expect(
      updateSocialCardSchema.parse({
        instagramUrl: 'https://www.instagram.com/p/DummyPost01/',
      }).instagramUrl
    ).toBe('https://www.instagram.com/p/DummyPost01/');
  });

  it('accepts a caption of 2200 characters and keeps a hidden hook', () => {
    const caption = "a".repeat(2200);
    const parsed = updateSocialCardSchema.parse({
      format: "post",
      words: { caption, hook: "Three signs" },
    });
    expect(parsed.words?.caption).toHaveLength(2200);
    expect(parsed.words?.hook).toBe("Three signs");
    expect(() =>
      updateSocialCardSchema.parse({ words: { caption: "a".repeat(2201) } })
    ).toThrow(ZodError);
    expect(() =>
      updateSocialCardSchema.parse({ words: { patientName: "no" } })
    ).toThrow(ZodError);
  });

  it('rejects a time when the card has no file', async () => {
    const chain = writeChain({ data: row, error: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(() => chain),
    } as never);

    await expect(
      updateSocialCard(
        row.id,
        { scheduledAt: '2026-10-13T13:39:00.000Z' },
        correlationId,
        doctorId
      )
    ).rejects.toBeInstanceOf(ValidationError);
    expect(chain.update).not.toHaveBeenCalled();
  });

  it('shows the public page without a card code', async () => {
    const chain = {
      select: jest.fn(),
      eq: jest.fn(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { public_slug: 'fees' }, error: null } as never),
    };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(() => chain),
    } as never);

    await expect(getSocialPagePath(doctorId, correlationId)).resolves.toBe('/d/fees');
  });

  it('does not publish to Instagram', () => {
    const service = readFileSync(
      path.join(__dirname, '../../../src/services/social-card-service.ts'),
      'utf8'
    );
    const controller = readFileSync(
      path.join(__dirname, '../../../src/controllers/social-card-controller.ts'),
      'utf8'
    );
    expect(service + controller).not.toMatch(/graph\.facebook|content_publish|graph\.instagram|api\.instagram/i);
    expect(service + controller).not.toMatch(/\bfetch\s*\(/);
  });

  it('rejects a move to Ready when the card has no file', async () => {
    const chain = writeChain({ data: row, error: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(() => chain),
    } as never);

    await expect(
      updateSocialCard(row.id, { stage: 'ready' }, correlationId, doctorId)
    ).rejects.toBeInstanceOf(ValidationError);
    expect(chain.update).not.toHaveBeenCalled();
  });

  it('does not update another doctor card', async () => {
    const chain = writeChain({ data: null, error: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(() => chain),
    } as never);

    await expect(
      updateSocialCard(row.id, { title: 'Other' }, correlationId, otherDoctorId)
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(chain.eq).toHaveBeenCalledWith('doctor_id', otherDoctorId);
  });

  it('rejects a patient field on create', () => {
    expect(() =>
      createSocialCardSchema.parse({
        title: 'Fees for a first visit',
        patientId: 'p-1',
        patientName: 'Ada',
        phone: '555',
      })
    ).toThrow(ZodError);
  });

  it('migration keeps owner RLS and has no patient column', () => {
    const sql = readFileSync(
      path.join(__dirname, '../../../migrations/246_social_cards.sql'),
      'utf8'
    );
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('doctor_id = auth.uid()');
    expect(sql).toContain('ON DELETE CASCADE');
    expect(sql).not.toMatch(/^\s*patient_id\s+/im);
    expect(sql).toContain("'patient_id'");
  });

  it('adds one visit for this doctor and ignores a missing code', async () => {
    const code = '23456789AB';
    const chain = {
      select: jest.fn(),
      update: jest.fn(),
      eq: jest.fn(),
      maybeSingle: jest
        .fn()
        .mockResolvedValueOnce({ data: { id: row.id, visit_count: 0 }, error: null } as never)
        .mockResolvedValueOnce({ data: { id: row.id, visit_count: 1 }, error: null } as never)
        .mockResolvedValueOnce({ data: null, error: null } as never),
      then(onFulfilled: (value: { error: null }) => unknown) {
        return Promise.resolve(onFulfilled({ error: null }));
      },
    };
    chain.select.mockReturnValue(chain);
    chain.update.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(() => chain),
    } as never);

    await recordSocialCardVisit(code, doctorId, correlationId);
    await recordSocialCardVisit(undefined, doctorId, correlationId);
    await recordSocialCardVisit(code, doctorId, correlationId);
    await recordSocialCardVisit(code, otherDoctorId, correlationId);

    expect(chain.select).toHaveBeenCalledWith('id, visit_count');
    expect(chain.update).toHaveBeenNthCalledWith(1, { visit_count: 1 });
    expect(chain.update).toHaveBeenNthCalledWith(2, { visit_count: 2 });
    expect(chain.update).toHaveBeenCalledTimes(2);
    expect(chain.eq).toHaveBeenCalledWith('doctor_id', doctorId);
    expect(chain.eq).toHaveBeenCalledWith('doctor_id', otherDoctorId);
    const payload = JSON.stringify({
      update: chain.update.mock.calls,
      audit: mockedAudit.mock.calls,
    });
    expect(payload).not.toContain(code);
    expect(payload).not.toMatch(/patient|phone|appointment/i);
  });

  it('copies a posted card into Thoughts without the post', async () => {
    const posted = {
      ...row,
      stage: 'posted' as const,
      format: 'post' as const,
      topic: 'Cough',
      words: { caption: 'Hello' },
      instagram_url: 'https://www.instagram.com/p/DummyPost01/',
      link_code: '23456789AB',
      visit_count: 3,
      scheduled_at: null,
      file_path: null,
    };
    const copy = {
      ...row,
      id: '22222222-2222-4222-8222-222222222222',
      stage: 'thoughts' as const,
      format: 'post' as const,
      topic: 'Cough',
      words: { caption: 'Hello' },
      visit_count: 0,
    };
    const chain = writeChain({ data: null, error: null });
    chain.maybeSingle.mockResolvedValueOnce({ data: posted, error: null } as never);
    chain.single.mockResolvedValueOnce({ data: copy, error: null } as never);
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(() => chain),
    } as never);

    const card = await reuseSocialCard(row.id, correlationId, doctorId);

    expect(card.id).not.toBe(row.id);
    expect(card.stage).toBe('thoughts');
    expect(card.instagramUrl).toBeNull();
    expect(card.visitCount).toBe(0);
    expect(card.hasFile).toBe(false);
    expect(card.scheduledAt).toBeNull();
    const inserted = chain.insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted).toMatchObject({
      stage: 'thoughts',
      title: row.title,
      format: 'post',
      topic: 'Cough',
      words: { caption: 'Hello' },
      file_path: null,
    });
    expect(inserted).not.toHaveProperty('instagram_url');
    expect(inserted).not.toHaveProperty('scheduled_at');
    expect(inserted).not.toHaveProperty('link_code');
    expect(inserted).not.toHaveProperty('visit_count');
    expect(JSON.stringify(mockedAudit.mock.calls)).not.toContain(
      'https://www.instagram.com/p/DummyPost01/'
    );

    chain.maybeSingle.mockResolvedValue({ data: row, error: null } as never);
    chain.insert.mockClear();
    await expect(reuseSocialCard(row.id, correlationId, doctorId)).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(chain.insert).not.toHaveBeenCalled();
  });

  it('stores a pasted URL on the card and does not fetch it', () => {
    const sql = readFileSync(
      path.join(__dirname, '../../../migrations/250_social_card_posted.sql'),
      'utf8'
    );
    expect(sql).toContain("'posted'");
    expect(sql).toContain('instagram_url');
    expect(sql).not.toMatch(/graph\.facebook|fetch\s*\(/i);
    const visits = readFileSync(
      path.join(__dirname, '../../../migrations/251_social_card_visits.sql'),
      'utf8'
    );
    expect(visits).toContain('visit_count');
    expect(visits).not.toMatch(/^\s*(patient_id|appointment_id|phone)\s+/im);
    expect(sql).not.toMatch(/^\s*patient_id\s+/im);
    const columns = readFileSync(
      path.join(__dirname, '../../../migrations/252_social_columns.sql'),
      'utf8'
    );
    expect(columns).toContain('social_columns');
    expect(columns).toContain("'custom'");
    expect(columns).toContain('ON DELETE RESTRICT');
    expect(columns).toContain('doctor_id = auth.uid()');
    expect(columns).not.toMatch(/^\s*(patient_id|appointment_id|phone)\s+/im);
  });

  it('keeps the card code off the chat-link table', () => {
    const sql = readFileSync(
      path.join(__dirname, '../../../migrations/249_social_card_link.sql'),
      'utf8'
    );
    const chat = readFileSync(
      path.join(__dirname, '../../../migrations/245_visit_page_links.sql'),
      'utf8'
    );
    expect(sql).toContain('link_code');
    expect(sql).not.toContain('expires_at');
    expect(sql).not.toContain('conversation_id');
    expect(sql).not.toMatch(/^\s*patient_id\s+/im);
    expect(chat).toContain('expires_at');
    expect(chat).toContain('conversation_id');
  });

  it('keeps the marketing file out of visit documents and branding', () => {
    const sql = readFileSync(
      path.join(__dirname, '../../../migrations/247_social_card_files.sql'),
      'utf8'
    );
    expect(sql).toContain("VALUES ('social-card-files', 'social-card-files', false)");
    expect(sql).toContain('auth.uid()');
    expect(sql).toContain("stage = 'ready'");
    expect(sql).not.toContain("bucket_id = 'prescription-attachments'");
    expect(sql).not.toContain("bucket_id = 'clinic-branding'");
  });

  it('does not erase a card that is still on the board', async () => {
    const chain = writeChain({ data: row, error: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(() => chain),
    } as never);

    await expect(purgeBinnedSocialCard(row.id, correlationId, doctorId)).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it('erases a binned card and does not log the file path', async () => {
    const filePath = `${doctorId}/11111111-1111-4111-8111-111111111111.jpg`;
    const binned = { ...row, deleted_at: '2026-10-01T00:00:00.000Z', file_path: filePath };
    const chain = writeChain({ data: binned, error: null });
    const removeRow = jest.fn().mockReturnValue(chain);
    Object.assign(chain, { delete: removeRow });
    const remove = jest.fn().mockResolvedValue({ error: null } as never);
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(() => chain),
      storage: { from: jest.fn(() => ({ remove })) },
    } as never);

    await purgeBinnedSocialCard(row.id, correlationId, doctorId);

    expect(remove).toHaveBeenCalledWith([filePath]);
    expect(removeRow).toHaveBeenCalled();
    expect(JSON.stringify(mockedAudit.mock.calls)).not.toContain(filePath);
  });
});

describe('social columns', () => {
  const columnId = '22222222-2222-2222-2222-222222222222';
  const readyId = '33333333-3333-3333-3333-333333333333';

  function chainFor(initialRows: unknown[]) {
    let rows = initialRows;
    const chain = {
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      select: jest.fn(),
      eq: jest.fn(),
      order: jest.fn(),
      single: jest.fn(),
      maybeSingle: jest.fn(),
      setRows(next: unknown[]) {
        rows = next;
      },
      then(onFulfilled: (value: { data: unknown[]; error: null }) => unknown) {
        return Promise.resolve(onFulfilled({ data: rows, error: null }));
      },
    };
    chain.insert.mockReturnValue(chain);
    chain.update.mockReturnValue(chain);
    chain.delete.mockReturnValue(chain);
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.order.mockReturnValue(chain);
    chain.single.mockResolvedValue({ data: null, error: null } as never);
    chain.maybeSingle.mockResolvedValue({ data: null, error: null } as never);
    return chain;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('adds a named column immediately before Ready, and the next one too', async () => {
    const opening = [
      { id: 't', doctor_id: doctorId, kind: 'thoughts', name: 'Thoughts and ideas', position: 0 },
      { id: 'c', doctor_id: doctorId, kind: 'chosen', name: 'Chosen', position: 1 },
      { id: 'm', doctor_id: doctorId, kind: 'making', name: 'Making', position: 2 },
      { id: readyId, doctor_id: doctorId, kind: 'ready', name: 'Ready', position: 3 },
    ];
    const columns = chainFor(opening);
    columns.insert.mockImplementation((payload: unknown) => {
      const body = payload as { name: string; position: number };
      columns.single.mockResolvedValue({
        data: {
          id: columnId,
          doctor_id: doctorId,
          kind: 'custom',
          name: body.name,
          position: body.position,
        },
        error: null,
      } as never);
      return columns;
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(() => columns),
    } as never);

    const first = await createSocialColumn('Film on Sunday', correlationId, doctorId);
    expect(first).toEqual({
      id: columnId,
      kind: 'custom',
      name: 'Film on Sunday',
      position: 3,
    });
    expect(columns.update).toHaveBeenCalledWith({ position: 4 });
    expect(JSON.stringify(mockedAudit.mock.calls)).not.toContain('Film on Sunday');

    columns.setRows([
      ...opening.slice(0, 3),
      { id: columnId, doctor_id: doctorId, kind: 'custom', name: 'Film on Sunday', position: 3 },
      { id: readyId, doctor_id: doctorId, kind: 'ready', name: 'Ready', position: 4 },
    ]);
    columns.update.mockClear();
    const second = await createSocialColumn('Monday cut', correlationId, doctorId);
    expect(second.position).toBe(4);
    expect(columns.update).toHaveBeenCalledTimes(1);
    expect(columns.update).toHaveBeenCalledWith({ position: 5 });
    expect(JSON.stringify(mockedAudit.mock.calls)).not.toContain('Monday cut');
  });

  it('refuses to rename or delete an opening column', async () => {
    const columns = chainFor([]);
    columns.maybeSingle.mockResolvedValue({
      data: { id: readyId, doctor_id: doctorId, kind: 'thoughts', name: 'Thoughts and ideas', position: 0 },
      error: null,
    } as never);
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(() => columns),
    } as never);

    await expect(renameSocialColumn(readyId, 'Ideas', correlationId, doctorId)).rejects.toBeInstanceOf(
      ValidationError
    );
    await expect(deleteSocialColumn(readyId, correlationId, doctorId)).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(columns.update).not.toHaveBeenCalled();
    expect(columns.delete).not.toHaveBeenCalled();
  });

  it('sends cards back to thoughts when a named column is deleted', async () => {
    const columns = chainFor([]);
    const cards = chainFor([]);
    columns.maybeSingle.mockResolvedValue({
      data: { id: columnId, doctor_id: doctorId, kind: 'custom', name: 'Film on Sunday', position: 3 },
      error: null,
    } as never);
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn((table: string) => (table === 'social_cards' ? cards : columns)),
    } as never);

    await deleteSocialColumn(columnId, correlationId, doctorId);

    expect(cards.update).toHaveBeenCalledWith({
      stage: 'thoughts',
      column_id: null,
      scheduled_at: null,
    });
    expect(cards.eq).toHaveBeenCalledWith('stage', 'custom');
    expect(columns.delete).toHaveBeenCalled();
    expect(JSON.stringify(mockedAudit.mock.calls)).not.toContain('Film on Sunday');
  });

  it('keeps the file when a Ready card moves into a named column', async () => {
    const columns = chainFor([]);
    const cards = chainFor([]);
    columns.maybeSingle.mockResolvedValue({
      data: { id: columnId, doctor_id: doctorId, kind: 'custom', name: 'Film on Sunday', position: 3 },
      error: null,
    } as never);
    cards.maybeSingle.mockResolvedValue({
      data: {
        ...row,
        stage: 'ready',
        file_path: `${doctorId}/file.mp4`,
        scheduled_at: '2026-10-13T13:39:00.000Z',
      },
      error: null,
    } as never);
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn((table: string) => (table === 'social_columns' ? columns : cards)),
      storage: {
        from: jest.fn(() => ({
          remove: jest.fn().mockResolvedValue({ error: null } as never),
        })),
      },
    } as never);

    await updateSocialCard(row.id, { columnId }, correlationId, doctorId);

    expect(cards.update).toHaveBeenCalledWith({
      stage: 'custom',
      column_id: columnId,
      scheduled_at: null,
    });
    expect(JSON.stringify(mockedAudit.mock.calls)).not.toContain('Film on Sunday');
    expect(JSON.stringify(mockedAudit.mock.calls)).not.toContain(`${doctorId}/file.mp4`);
  });

  it('does not reveal another doctor column', async () => {
    const columns = chainFor([]);
    columns.maybeSingle.mockResolvedValue({ data: null, error: null } as never);
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(() => columns),
    } as never);

    await expect(
      renameSocialColumn(columnId, 'Film on Sunday', correlationId, doctorId)
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(JSON.stringify(mockedAudit.mock.calls)).not.toContain('Film on Sunday');
  });
});

