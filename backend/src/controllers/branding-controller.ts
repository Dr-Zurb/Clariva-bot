/**
 * clinic-branding-v1 / Phase 2 — doctor branding asset endpoints.
 *
 *   POST   /api/v1/settings/doctor/branding/logo-upload-url
 *   POST   /api/v1/settings/doctor/branding/logo
 *   DELETE /api/v1/settings/doctor/branding/logo
 *   POST   /api/v1/settings/doctor/branding/header
 *   DELETE /api/v1/settings/doctor/branding/header
 *   POST   /api/v1/settings/doctor/branding/footer
 *   DELETE /api/v1/settings/doctor/branding/footer
 *
 * Orchestration only. Paths are never accepted via generic settings PATCH.
 */

import type { Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError, ValidationError } from '../utils/errors';
import {
  BRANDING_LOGO_ALLOWED_MIME,
  BRANDING_LOGO_MAX_BYTES,
  type BrandingAssetSlot,
} from '../types/letterhead';
import {
  createBrandingLogoUploadUrl,
  deleteBrandingAsset,
  deleteBrandingLogo,
  putBrandingAsset,
  putBrandingLogo,
} from '../services/letterhead-service';

function requireUserId(req: Request): string {
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }
  return userId;
}

const LOGO_BASE64_REGEX = /^[A-Za-z0-9+/=\r\n]+$/;
const BRANDING_LOGO_BASE64_MAX = Math.ceil((BRANDING_LOGO_MAX_BYTES * 4) / 3) + 80;

const uploadUrlSchema = z.object({
  contentType: z.enum(BRANDING_LOGO_ALLOWED_MIME),
});

const putLogoSchema = z.object({
  contentType: z.string().trim().max(80).optional(),
  data: z.string().min(1).max(BRANDING_LOGO_BASE64_MAX),
});

function decodeLogoBase64(raw: string): Buffer {
  const trimmed = raw.trim();
  const payload =
    trimmed.startsWith('data:') && trimmed.includes(',')
      ? trimmed.slice(trimmed.indexOf(',') + 1)
      : trimmed;
  if (!LOGO_BASE64_REGEX.test(payload)) {
    throw new ValidationError('Logo data must be base64');
  }
  return Buffer.from(payload, 'base64');
}

export const createBrandingLogoUploadUrlHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { contentType } = uploadUrlSchema.parse(req.body);
    const result = await createBrandingLogoUploadUrl(userId, contentType, req.correlationId ?? '');
    res.status(200).json(successResponse(result, req));
  }
);

export const putBrandingLogoHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const { data } = putLogoSchema.parse(req.body);
  const bytes = decodeLogoBase64(data);
  const result = await putBrandingLogo(userId, bytes, req.correlationId ?? '');
  res.status(200).json(successResponse(result, req));
});

export const deleteBrandingLogoHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  await deleteBrandingLogo(userId, req.correlationId ?? '');
  res.status(200).json(successResponse({ deleted: true }, req));
});

function putBrandingSlotHandler(slot: Exclude<BrandingAssetSlot, 'logo'>): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { data } = putLogoSchema.parse(req.body);
    const bytes = decodeLogoBase64(data);
    const result = await putBrandingAsset(userId, slot, bytes, req.correlationId ?? '');
    if (slot === 'header') {
      res.status(200).json(
        successResponse(
          { headerVersion: result.version, headerPreviewUrl: result.previewUrl },
          req
        )
      );
      return;
    }
    if (slot === 'footer') {
      res.status(200).json(
        successResponse(
          { footerVersion: result.version, footerPreviewUrl: result.previewUrl },
          req
        )
      );
      return;
    }
    res.status(200).json(
      successResponse(
        { backgroundVersion: result.version, backgroundPreviewUrl: result.previewUrl },
        req
      )
    );
  });
}

function deleteBrandingSlotHandler(slot: Exclude<BrandingAssetSlot, 'logo'>): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    await deleteBrandingAsset(userId, slot, req.correlationId ?? '');
    res.status(200).json(successResponse({ deleted: true }, req));
  });
}

export const putBrandingHeaderHandler = putBrandingSlotHandler('header');
export const deleteBrandingHeaderHandler = deleteBrandingSlotHandler('header');
export const putBrandingFooterHandler = putBrandingSlotHandler('footer');
export const deleteBrandingFooterHandler = deleteBrandingSlotHandler('footer');
export const putBrandingBackgroundHandler = putBrandingSlotHandler('background');
export const deleteBrandingBackgroundHandler = deleteBrandingSlotHandler('background');
