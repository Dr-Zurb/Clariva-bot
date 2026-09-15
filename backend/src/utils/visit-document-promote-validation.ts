/**
 * Zod for POST /api/v1/prescriptions/:id/attachments/from-visit-page.
 * Kept out of validation.ts so desk-visit-prep P2 can own that file.
 */

import { z } from 'zod';
import { ValidationError } from './errors';

export const promoteVisitDocumentPageBodySchema = z
  .object({
    appointmentId: z.string().uuid('appointmentId must be a valid UUID'),
    documentId: z.string().uuid('documentId must be a valid UUID'),
    pageId: z.string().uuid('pageId must be a valid UUID'),
  })
  .strict();

export type PromoteVisitDocumentPageBody = z.infer<typeof promoteVisitDocumentPageBodySchema>;

export function validatePromoteVisitDocumentPageBody(body: unknown): PromoteVisitDocumentPageBody {
  const result = promoteVisitDocumentPageBodySchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(result.error.issues[0]?.message ?? 'Invalid request body');
  }
  return result.data;
}
