/**
 * Zod for desk lab extract confirm.
 * PUT /api/v1/appointments/:id/documents/:documentId/extracted-results
 */

import { z } from 'zod';
import { ValidationError } from './errors';
import type { VisitExtractedLabPanelInput } from '../types/visit-documents';

function nullableTrimmed(max: number): z.ZodType<string | null> {
  return z
    .string()
    .max(max)
    .trim()
    .nullable()
    .optional()
    .transform((value): string | null => (value == null || value === '' ? null : value));
}

const extractedLabReportSchema = z
  .object({
    id: z.string().uuid('report.id must be a valid UUID'),
    kind: z.literal('lab'),
    title: z.string().min(1).max(120).trim(),
    reportDate: nullableTrimmed(10),
    labName: nullableTrimmed(120),
    attachmentIds: z.array(z.string().uuid()).min(1).max(24),
    findings: z.null(),
    entryMethod: z.literal('extracted'),
  })
  .strict();

const extractedLabRowSchema = z
  .object({
    id: z.string().uuid('row.id must be a valid UUID'),
    source: z.literal('patient_report'),
    name: z.string().min(1).max(120).trim(),
    value: nullableTrimmed(40),
    unit: nullableTrimmed(40),
    date: nullableTrimmed(10),
    interpretation: z.null().optional(),
    notes: z.null().optional(),
    reportId: z.string().uuid().nullable(),
    refLow: z.number().finite().nullable().optional(),
    refHigh: z.number().finite().nullable().optional(),
    refText: nullableTrimmed(80),
    method: nullableTrimmed(80),
  })
  .strict();

const extractedLabPanelSchema = z
  .object({
    pageId: z.string().uuid('pageId must be a valid UUID'),
    report: extractedLabReportSchema,
    rows: z.array(extractedLabRowSchema).min(1).max(200),
  })
  .strict();

export const confirmVisitExtractedResultsBodySchema = z
  .object({
    panels: z.array(extractedLabPanelSchema).min(1).max(24),
  })
  .strict();

export type ConfirmVisitExtractedResultsBody = z.infer<
  typeof confirmVisitExtractedResultsBodySchema
>;

export function validateConfirmVisitExtractedResultsBody(
  body: unknown
): { panels: VisitExtractedLabPanelInput[] } {
  const result = confirmVisitExtractedResultsBodySchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(result.error.issues[0]?.message ?? 'Invalid request body');
  }
  return {
    panels: result.data.panels.map((panel) => ({
      pageId: panel.pageId,
      report: {
        id: panel.report.id,
        kind: 'lab',
        title: panel.report.title,
        reportDate: panel.report.reportDate ?? null,
        labName: panel.report.labName ?? null,
        attachmentIds: panel.report.attachmentIds,
        findings: null,
        entryMethod: 'extracted',
      },
      rows: panel.rows.map((row) => ({
        id: row.id,
        source: 'patient_report',
        name: row.name,
        value: row.value ?? null,
        unit: row.unit ?? null,
        date: row.date ?? null,
        interpretation: null,
        notes: null,
        reportId: row.reportId,
        refLow: row.refLow ?? null,
        refHigh: row.refHigh ?? null,
        refText: row.refText ?? null,
        method: row.method ?? null,
      })),
    })),
  };
}
