/**
 * Social cards (soc-03, soc-05). Validate, then the service.
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError } from '../utils/errors';
import {
  addSocialCardFrame,
  addSocialCardScrap,
  attachSocialCardFile,
  createSocialCard,
  createSocialCardFileUpload,
  createSocialCardUpload,
  deleteSocialCard,
  duplicateSocialCard,
  getSocialCardFileUrl,
  getSocialCardFrameUrl,
  getSocialCardScrapUrl,
  getSocialPagePath,
  isInstagramPostUrl,
  emptySocialBin,
  listBinnedSocialCards,
  listSocialCards,
  listSocialColumns,
  orderSocialCardFrames,
  createSocialColumn,
  deleteSocialColumn,
  renameSocialColumn,
  purgeBinnedSocialCard,
  removeSocialCardFile,
  removeSocialCardFrame,
  removeSocialCardScrap,
  restoreSocialCard,
  reuseSocialCard,
  updateSocialCard,
  SOCIAL_CARD_FILE_TYPES,
  type SocialCard,
} from '../services/social-card-service';

const stageSchema = z.enum(['thoughts', 'chosen', 'making', 'ready']);
const formatSchema = z.enum(['post', 'reel', 'story']);

const wordsSchema = z
  .object({
    note: z.string().trim().min(1).max(4000).optional(),
    caption: z.string().trim().min(1).max(2200).optional(),
    altText: z.string().trim().min(1).max(500).optional(),
    firstComment: z.string().trim().min(1).max(500).optional(),
    hook: z.string().trim().min(1).max(300).optional(),
    script: z.string().trim().min(1).max(4000).optional(),
    coverLine: z.string().trim().min(1).max(200).optional(),
    shots: z.array(z.string().trim().min(1).max(200)).max(3).optional(),
    line: z.string().trim().min(1).max(500).optional(),
    location: z.string().trim().min(1).max(200).optional(),
    collaborator: z.string().trim().min(1).max(80).optional(),
    crop: z.enum(['original', 'square', 'portrait']).optional(),
    aiGenerated: z.boolean().optional(),
    shareToFeed: z.boolean().optional(),
    music: z.string().trim().min(1).max(200).optional(),
    stickers: z.string().trim().min(1).max(200).optional(),
    productTag: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const createSocialCardSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    stage: stageSchema.optional(),
    format: formatSchema.nullable().optional(),
    topic: z.string().trim().min(1).max(80).nullable().optional(),
    words: wordsSchema.optional(),
    filePath: z.string().trim().min(1).max(300).optional(),
    sourceUrl: z.string().trim().max(500).nullable().optional(),
    links: z
      .array(z.object({ id: z.string().trim().min(1).max(500), url: z.string().trim().max(500) }))
      .optional(),
    columnId: z.string().uuid().optional(),
  })
  .strict()
  .refine((body) => body.stage !== 'ready' || Boolean(body.filePath), {
    message: 'Ready needs a file',
  });

export const updateSocialCardSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    stage: stageSchema.optional(),
    format: formatSchema.nullable().optional(),
    topic: z.string().trim().min(1).max(80).nullable().optional(),
    words: wordsSchema.optional(),
    sourceUrl: z.string().trim().max(500).nullable().optional(),
    links: z
      .array(z.object({ id: z.string().trim().min(1).max(500), url: z.string().trim().max(500) }))
      .optional(),
    scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
    instagramUrl: z
      .string()
      .trim()
      .max(500)
      .refine(isInstagramPostUrl, { message: 'Paste an Instagram post link' })
      .optional(),
    columnId: z.string().uuid().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'No fields to update',
  })
  .refine((body) => body.instagramUrl === undefined || Object.keys(body).length === 1, {
    message: 'Paste the link on its own',
  });

export const socialCardUploadSchema = z
  .object({
    contentType: z.enum(SOCIAL_CARD_FILE_TYPES, {
      error: 'Use a photo, a video, audio, or a document',
    }),
  })
  .strict();

export const attachSocialCardFileSchema = z
  .object({
    path: z.string().trim().min(1).max(300),
  })
  .strict();

const idSchema = z.object({
  id: z.string().uuid(),
});

function getUserId(req: Request): string {
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');
  return userId;
}

function presentCard(
  card: SocialCard,
  base: string | null
): Omit<SocialCard, 'linkCode'> & { pagePath: string | null } {
  const { linkCode, ...rest } = card;
  return {
    ...rest,
    pagePath: base && linkCode ? `${base}?c=${linkCode}` : base,
  };
}

async function withPagePath(
  card: SocialCard,
  doctorId: string,
  correlationId: string
): Promise<Omit<SocialCard, 'linkCode'> & { pagePath: string | null }> {
  return presentCard(card, await getSocialPagePath(doctorId, correlationId));
}

export const listSocialCardsHandler = asyncHandler(async (req: Request, res: Response) => {
  const doctorId = getUserId(req);
  const correlationId = req.correlationId || 'unknown';
  const [pagePath, cards] = await Promise.all([
    getSocialPagePath(doctorId, correlationId),
    listSocialCards(correlationId, doctorId),
  ]);
  res.status(200).json(
    successResponse(
      { cards: cards.map((card) => presentCard(card, pagePath)) },
      req
    )
  );
});

export const createSocialCardHandler = asyncHandler(async (req: Request, res: Response) => {
  const doctorId = getUserId(req);
  const correlationId = req.correlationId || 'unknown';
  const body = createSocialCardSchema.parse(req.body);
  const card = await withPagePath(
    await createSocialCard(body, correlationId, doctorId),
    doctorId,
    correlationId
  );
  res.status(201).json(successResponse({ card }, req));
});

export const updateSocialCardHandler = asyncHandler(async (req: Request, res: Response) => {
  const doctorId = getUserId(req);
  const correlationId = req.correlationId || 'unknown';
  const { id } = idSchema.parse(req.params);
  const body = updateSocialCardSchema.parse(req.body);
  const card = await withPagePath(
    await updateSocialCard(id, body, correlationId, doctorId),
    doctorId,
    correlationId
  );
  res.status(200).json(successResponse({ card }, req));
});

export const listBinnedSocialCardsHandler = asyncHandler(async (req: Request, res: Response) => {
  const doctorId = getUserId(req);
  const correlationId = req.correlationId || 'unknown';
  const pagePath = await getSocialPagePath(doctorId, correlationId);
  const cards = (await listBinnedSocialCards(correlationId, doctorId)).map((card) =>
    presentCard(card, pagePath)
  );
  res.status(200).json(successResponse({ cards }, req));
});

export const purgeBinnedSocialCardHandler = asyncHandler(async (req: Request, res: Response) => {
  const doctorId = getUserId(req);
  const correlationId = req.correlationId || 'unknown';
  const { id } = idSchema.parse(req.params);
  await purgeBinnedSocialCard(id, correlationId, doctorId);
  res.status(200).json(successResponse(null, req));
});

export const emptySocialBinHandler = asyncHandler(async (req: Request, res: Response) => {
  const doctorId = getUserId(req);
  const correlationId = req.correlationId || 'unknown';
  await emptySocialBin(correlationId, doctorId);
  res.status(200).json(successResponse(null, req));
});

export const restoreSocialCardHandler = asyncHandler(async (req: Request, res: Response) => {
  const doctorId = getUserId(req);
  const correlationId = req.correlationId || 'unknown';
  const { id } = idSchema.parse(req.params);
  const card = await withPagePath(
    await restoreSocialCard(id, correlationId, doctorId),
    doctorId,
    correlationId
  );
  res.status(200).json(successResponse({ card }, req));
});

export const duplicateSocialCardHandler = asyncHandler(async (req: Request, res: Response) => {
  const doctorId = getUserId(req);
  const correlationId = req.correlationId || 'unknown';
  const { id } = idSchema.parse(req.params);
  const card = await withPagePath(
    await duplicateSocialCard(id, correlationId, doctorId),
    doctorId,
    correlationId
  );
  res.status(201).json(successResponse({ card }, req));
});

export const deleteSocialCardHandler = asyncHandler(async (req: Request, res: Response) => {
  const doctorId = getUserId(req);
  const correlationId = req.correlationId || 'unknown';
  const { id } = idSchema.parse(req.params);
  await deleteSocialCard(id, correlationId, doctorId);
  res.status(200).json(successResponse(null, req));
});

export const createSocialCardUploadHandler = asyncHandler(async (req: Request, res: Response) => {
  const doctorId = getUserId(req);
  const correlationId = req.correlationId || 'unknown';
  const { contentType } = socialCardUploadSchema.parse(req.body);
  const upload = await createSocialCardUpload(contentType, correlationId, doctorId);
  res.status(200).json(successResponse(upload, req));
});

export const createSocialCardFileUploadHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const doctorId = getUserId(req);
    const correlationId = req.correlationId || 'unknown';
    const { id } = idSchema.parse(req.params);
    const { contentType } = socialCardUploadSchema.parse(req.body);
    const upload = await createSocialCardFileUpload(id, contentType, correlationId, doctorId);
    res.status(200).json(successResponse(upload, req));
  }
);

const scrapParamsSchema = z.object({
  id: z.string().uuid(),
  scrapId: z.string().uuid(),
});

export const addSocialCardScrapHandler = asyncHandler(async (req: Request, res: Response) => {
  const doctorId = getUserId(req);
  const correlationId = req.correlationId || 'unknown';
  const { id } = idSchema.parse(req.params);
  const { path } = attachSocialCardFileSchema.parse(req.body);
  const scrap = await addSocialCardScrap(id, path, correlationId, doctorId);
  res.status(201).json(successResponse({ scrap }, req));
});

export const removeSocialCardScrapHandler = asyncHandler(async (req: Request, res: Response) => {
  const doctorId = getUserId(req);
  const correlationId = req.correlationId || 'unknown';
  const { id, scrapId } = scrapParamsSchema.parse(req.params);
  await removeSocialCardScrap(id, scrapId, correlationId, doctorId);
  res.status(200).json(successResponse(null, req));
});

export const getSocialCardScrapUrlHandler = asyncHandler(async (req: Request, res: Response) => {
  const doctorId = getUserId(req);
  const correlationId = req.correlationId || 'unknown';
  const { id, scrapId } = scrapParamsSchema.parse(req.params);
  const file = await getSocialCardScrapUrl(id, scrapId, correlationId, doctorId);
  res.status(200).json(successResponse(file, req));
});

const frameParamsSchema = z.object({
  id: z.string().uuid(),
  frameId: z.string().uuid(),
});

const frameOrderSchema = z
  .object({
    ids: z.array(z.string().trim().min(1).max(80)).min(1).max(10),
  })
  .strict();

export const addSocialCardFrameHandler = asyncHandler(async (req: Request, res: Response) => {
  const doctorId = getUserId(req);
  const correlationId = req.correlationId || 'unknown';
  const { id } = idSchema.parse(req.params);
  const { path } = attachSocialCardFileSchema.parse(req.body);
  const card = await withPagePath(
    await addSocialCardFrame(id, path, correlationId, doctorId),
    doctorId,
    correlationId
  );
  res.status(201).json(successResponse({ card }, req));
});

export const removeSocialCardFrameHandler = asyncHandler(async (req: Request, res: Response) => {
  const doctorId = getUserId(req);
  const correlationId = req.correlationId || 'unknown';
  const { id, frameId } = frameParamsSchema.parse(req.params);
  const card = await withPagePath(
    await removeSocialCardFrame(id, frameId, correlationId, doctorId),
    doctorId,
    correlationId
  );
  res.status(200).json(successResponse({ card }, req));
});

export const orderSocialCardFramesHandler = asyncHandler(async (req: Request, res: Response) => {
  const doctorId = getUserId(req);
  const correlationId = req.correlationId || 'unknown';
  const { id } = idSchema.parse(req.params);
  const { ids } = frameOrderSchema.parse(req.body);
  const card = await withPagePath(
    await orderSocialCardFrames(id, ids, correlationId, doctorId),
    doctorId,
    correlationId
  );
  res.status(200).json(successResponse({ card }, req));
});

export const getSocialCardFrameUrlHandler = asyncHandler(async (req: Request, res: Response) => {
  const doctorId = getUserId(req);
  const correlationId = req.correlationId || 'unknown';
  const { id, frameId } = frameParamsSchema.parse(req.params);
  const file = await getSocialCardFrameUrl(id, frameId, correlationId, doctorId);
  res.status(200).json(successResponse(file, req));
});

export const attachSocialCardFileHandler = asyncHandler(async (req: Request, res: Response) => {
  const doctorId = getUserId(req);
  const correlationId = req.correlationId || 'unknown';
  const { id } = idSchema.parse(req.params);
  const { path } = attachSocialCardFileSchema.parse(req.body);
  const card = await withPagePath(
    await attachSocialCardFile(id, path, correlationId, doctorId),
    doctorId,
    correlationId
  );
  res.status(200).json(successResponse({ card }, req));
});

export const reuseSocialCardHandler = asyncHandler(async (req: Request, res: Response) => {
  const doctorId = getUserId(req);
  const correlationId = req.correlationId || 'unknown';
  const { id } = idSchema.parse(req.params);
  const card = await withPagePath(
    await reuseSocialCard(id, correlationId, doctorId),
    doctorId,
    correlationId
  );
  res.status(201).json(successResponse({ card }, req));
});

export const removeSocialCardFileHandler = asyncHandler(async (req: Request, res: Response) => {
  const doctorId = getUserId(req);
  const correlationId = req.correlationId || 'unknown';
  const { id } = idSchema.parse(req.params);
  const card = await withPagePath(
    await removeSocialCardFile(id, correlationId, doctorId),
    doctorId,
    correlationId
  );
  res.status(200).json(successResponse({ card }, req));
});

const columnNameSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
  })
  .strict();

export const listSocialColumnsHandler = asyncHandler(async (req: Request, res: Response) => {
  const doctorId = getUserId(req);
  const correlationId = req.correlationId || 'unknown';
  const columns = await listSocialColumns(correlationId, doctorId);
  res.status(200).json(successResponse({ columns }, req));
});

export const createSocialColumnHandler = asyncHandler(async (req: Request, res: Response) => {
  const doctorId = getUserId(req);
  const correlationId = req.correlationId || 'unknown';
  const { name } = columnNameSchema.parse(req.body);
  const column = await createSocialColumn(name, correlationId, doctorId);
  res.status(201).json(successResponse({ column }, req));
});

export const renameSocialColumnHandler = asyncHandler(async (req: Request, res: Response) => {
  const doctorId = getUserId(req);
  const correlationId = req.correlationId || 'unknown';
  const { id } = idSchema.parse(req.params);
  const { name } = columnNameSchema.parse(req.body);
  const column = await renameSocialColumn(id, name, correlationId, doctorId);
  res.status(200).json(successResponse({ column }, req));
});

export const deleteSocialColumnHandler = asyncHandler(async (req: Request, res: Response) => {
  const doctorId = getUserId(req);
  const correlationId = req.correlationId || 'unknown';
  const { id } = idSchema.parse(req.params);
  await deleteSocialColumn(id, correlationId, doctorId);
  res.status(200).json(successResponse(null, req));
});

export const getSocialCardFileUrlHandler = asyncHandler(async (req: Request, res: Response) => {
  const doctorId = getUserId(req);
  const correlationId = req.correlationId || 'unknown';
  const { id } = idSchema.parse(req.params);
  const file = await getSocialCardFileUrl(id, correlationId, doctorId);
  res.status(200).json(successResponse(file, req));
});
