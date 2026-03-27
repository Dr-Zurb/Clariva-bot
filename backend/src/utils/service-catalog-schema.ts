/**
 * SFU-01: Service catalog JSON — Zod validation (version 1).
 * Teleconsult modalities only: text, voice, video.
 *
 * @see docs/Development/Daily-plans/March 2026/2026-03-27/services-and-follow-ups/
 */

import { z } from 'zod';
import { ValidationError } from './errors';

export const SERVICE_CATALOG_VERSION = 1 as const;
export const MAX_SERVICE_OFFERINGS = 50;

const serviceKeyRegex = /^[a-z0-9][a-z0-9_-]{0,63}$/;

const modalitySlotSchema = z.object({
  enabled: z.boolean(),
  price_minor: z.number().int().min(0),
});

/** Per-mod prices; omit key or enabled:false for unavailable mode */
export const serviceModalitiesSchema = z
  .object({
    text: modalitySlotSchema.optional(),
    voice: modalitySlotSchema.optional(),
    video: modalitySlotSchema.optional(),
  })
  .superRefine((modalities, ctx) => {
    const slots = [modalities.text, modalities.voice, modalities.video].filter(Boolean);
    const anyEnabled = slots.some((s) => s!.enabled);
    if (!anyEnabled) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one modality must be enabled',
        path: [],
      });
    }
    for (const s of slots) {
      if (s!.enabled && s!.price_minor < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Enabled modalities must have non-negative price_minor',
          path: [],
        });
        break;
      }
    }
  });

const followUpDiscountTypeSchema = z.enum(['none', 'percent', 'flat_off', 'fixed_price', 'free']);

function refineFollowUpDiscountFields(
  discount_type: z.infer<typeof followUpDiscountTypeSchema>,
  discount_value: number | undefined,
  ctx: z.RefinementCtx,
  valuePath: (string | number)[]
): void {
  if (discount_type === 'percent') {
    if (discount_value === undefined || discount_value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'discount_type percent requires discount_value between 0 and 100',
        path: valuePath,
      });
    }
  }
  if (discount_type === 'flat_off' || discount_type === 'fixed_price') {
    if (discount_value === undefined || !Number.isFinite(discount_value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `discount_type ${discount_type} requires discount_value`,
        path: valuePath,
      });
    }
  }
}

/**
 * SFU-09 Phase A: one tier in `followup_policy.discount_tiers`.
 * `from_visit` is visit ordinal: 2 = first follow-up after index, 3 = second follow-up, ...
 */
export const followUpDiscountTierV1Schema = z
  .object({
    from_visit: z.number().int().min(2).max(100),
    discount_type: followUpDiscountTypeSchema,
    discount_value: z.number().min(0).optional(),
  })
  .superRefine((t, ctx) => {
    refineFollowUpDiscountFields(t.discount_type, t.discount_value, ctx, ['discount_value']);
  });

export const followUpPolicyV1Schema = z
  .object({
    enabled: z.boolean(),
    max_followups: z.number().int().min(0).max(100),
    eligibility_window_days: z.number().int().min(1).max(3650),
    discount_type: followUpDiscountTypeSchema,
    discount_value: z.number().min(0).optional(),
    /** Tiered follow-up discounts (optional). Greatest `from_visit` <= visit index wins; else top-level discount. */
    discount_tiers: z.array(followUpDiscountTierV1Schema).max(20).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.enabled) return;
    refineFollowUpDiscountFields(data.discount_type, data.discount_value, ctx, ['discount_value']);
  });

export const serviceOfferingV1Schema = z.object({
  service_key: z
    .string()
    .min(1)
    .max(64)
    .regex(serviceKeyRegex, 'service_key must be lowercase slug: a-z, 0-9, _, -'),
  label: z.string().min(1).max(200).trim(),
  description: z.string().max(500).trim().nullable().optional(),
  modalities: serviceModalitiesSchema,
  followup_policy: followUpPolicyV1Schema.nullable().optional(),
});

export const serviceCatalogV1Schema = z
  .object({
    version: z.literal(SERVICE_CATALOG_VERSION),
    services: z.array(serviceOfferingV1Schema).min(1).max(MAX_SERVICE_OFFERINGS),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    for (let i = 0; i < data.services.length; i++) {
      const k = data.services[i]!.service_key;
      if (seen.has(k)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate service_key: ${k}`,
          path: ['services', i, 'service_key'],
        });
      }
      seen.add(k);
    }
  });

export type ServiceCatalogV1 = z.infer<typeof serviceCatalogV1Schema>;
export type ServiceOfferingV1 = z.infer<typeof serviceOfferingV1Schema>;
export type FollowUpPolicyV1 = z.infer<typeof followUpPolicyV1Schema>;
export type FollowUpDiscountTierV1 = z.infer<typeof followUpDiscountTierV1Schema>;
export type ServiceModalitiesV1 = z.infer<typeof serviceModalitiesSchema>;

export function parseServiceCatalogV1(input: unknown): ServiceCatalogV1 {
  const result = serviceCatalogV1Schema.safeParse(input);
  if (!result.success) {
    const first = result.error.issues[0];
    const msg = first ? `${first.path.join('.')}: ${first.message}` : 'Invalid service_offerings_json';
    throw new ValidationError(msg);
  }
  return result.data;
}

/** Returns parsed catalog or null if input is null/undefined */
export function parseServiceCatalogV1OrNull(input: unknown): ServiceCatalogV1 | null {
  if (input === null || input === undefined) {
    return null;
  }
  return parseServiceCatalogV1(input);
}

/**
 * Returns validated catalog from doctor settings row, or null if column missing / invalid.
 * Invalid JSON in DB should not crash readers — log at warn in callers if needed.
 */
export function safeParseServiceCatalogV1FromDb(raw: unknown): ServiceCatalogV1 | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const result = serviceCatalogV1Schema.safeParse(raw);
  return result.success ? result.data : null;
}
