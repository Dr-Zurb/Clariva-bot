/**
 * SFU-01: Service catalog JSON — Zod validation (version 1).
 * Teleconsult modalities only: text, voice, video.
 *
 * @see docs/Development/Daily-plans/March 2026/2026-03-27/services-and-follow-ups/
 */

import { createHash } from 'crypto';
import { z } from 'zod';
import { ValidationError } from './errors';

export const SERVICE_CATALOG_VERSION = 1 as const;
export const MAX_SERVICE_OFFERINGS = 50;

const serviceKeyRegex = /^[a-z0-9][a-z0-9_-]{0,63}$/;

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

/** SFU-12: optional per-modality follow-up policy (discount can differ by channel; shared max/window must align). */
export const modalitySlotSchema = z.object({
  enabled: z.boolean(),
  price_minor: z.number().int().min(0),
  followup_policy: followUpPolicyV1Schema.nullable().optional(),
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
    type Policy = z.infer<typeof followUpPolicyV1Schema>;
    const keys = ['text', 'voice', 'video'] as const;
    const enabledPolicies: Policy[] = [];
    for (const k of keys) {
      const slot = modalities[k];
      const fp = slot?.followup_policy;
      if (fp?.enabled) {
        enabledPolicies.push(fp);
      }
    }
    if (enabledPolicies.length >= 2) {
      const refMax = enabledPolicies[0]!.max_followups;
      const refWin = enabledPolicies[0]!.eligibility_window_days;
      for (let i = 1; i < enabledPolicies.length; i++) {
        const p = enabledPolicies[i]!;
        if (p.max_followups !== refMax || p.eligibility_window_days !== refWin) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'SFU-12: all enabled modality follow-up policies must share the same max_followups and eligibility_window_days',
            path: [],
          });
          return;
        }
      }
    }
  });

const serviceOfferingCoreSchema = z.object({
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

/** SFU-11: API / merge input — `service_id` backfilled server-side when absent. */
export const serviceOfferingIncomingSchema = serviceOfferingCoreSchema.extend({
  service_id: z.string().uuid().optional(),
});

/** Persisted catalog row: immutable `service_id` per offering. */
export const serviceOfferingV1Schema = serviceOfferingCoreSchema
  .extend({
    service_id: z.string().uuid('service_id must be a UUID'),
  })
  .superRefine((off, ctx) => {
    const root = off.followup_policy;
    if (!root?.enabled) return;
    for (const k of ['text', 'voice', 'video'] as const) {
      const fp = off.modalities[k]?.followup_policy;
      if (
        fp?.enabled &&
        (fp.max_followups !== root.max_followups || fp.eligibility_window_days !== root.eligibility_window_days)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'followup_policy and per-modality follow-up must share max_followups and eligibility_window_days',
          path: ['followup_policy'],
        });
        return;
      }
    }
  });

function refineCatalogUniqueKeysAndIds(
  data: { services: { service_key: string; service_id?: string }[] },
  ctx: z.RefinementCtx,
  requireAllIds: boolean
): void {
  const seenKeys = new Set<string>();
  const seenIds = new Set<string>();
  for (let i = 0; i < data.services.length; i++) {
    const s = data.services[i]!;
    const k = s.service_key;
    if (seenKeys.has(k)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate service_key: ${k}`,
        path: ['services', i, 'service_key'],
      });
    }
    seenKeys.add(k);
    const id = s.service_id?.trim();
    if (id) {
      if (seenIds.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate service_id: ${id}`,
          path: ['services', i, 'service_id'],
        });
      }
      seenIds.add(id);
    } else if (requireAllIds) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'service_id is required',
        path: ['services', i, 'service_id'],
      });
    }
  }
}

export const serviceCatalogIncomingSchema = z
  .object({
    version: z.literal(SERVICE_CATALOG_VERSION),
    services: z.array(serviceOfferingIncomingSchema).min(1).max(MAX_SERVICE_OFFERINGS),
  })
  .superRefine((data, ctx) => refineCatalogUniqueKeysAndIds(data, ctx, false));

export const serviceCatalogV1Schema = z
  .object({
    version: z.literal(SERVICE_CATALOG_VERSION),
    services: z.array(serviceOfferingV1Schema).min(1).max(MAX_SERVICE_OFFERINGS),
  })
  .superRefine((data, ctx) => refineCatalogUniqueKeysAndIds(data, ctx, true));

export type ServiceCatalogV1 = z.infer<typeof serviceCatalogV1Schema>;
export type ServiceOfferingV1 = z.infer<typeof serviceOfferingV1Schema>;
export type FollowUpPolicyV1 = z.infer<typeof followUpPolicyV1Schema>;
export type FollowUpDiscountTierV1 = z.infer<typeof followUpDiscountTierV1Schema>;
export type ServiceModalitiesV1 = z.infer<typeof serviceModalitiesSchema>;

export type ServiceCatalogIncoming = z.infer<typeof serviceCatalogIncomingSchema>;

export function parseServiceCatalogIncoming(input: unknown): ServiceCatalogIncoming {
  const result = serviceCatalogIncomingSchema.safeParse(input);
  if (!result.success) {
    const first = result.error.issues[0];
    const msg = first ? `${first.path.join('.')}: ${first.message}` : 'Invalid service_offerings_json';
    throw new ValidationError(msg);
  }
  return result.data;
}

export function parseServiceCatalogV1(input: unknown): ServiceCatalogV1 {
  const result = serviceCatalogV1Schema.safeParse(input);
  if (!result.success) {
    const first = result.error.issues[0];
    const msg = first ? `${first.path.join('.')}: ${first.message}` : 'Invalid service_offerings_json';
    throw new ValidationError(msg);
  }
  return hydrateCatalogPerModalityFollowUp(result.data);
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
/** Stable UUID-shaped id for legacy rows missing `service_id` (per doctor + service_key). */
export function deterministicServiceIdForLegacyOffering(doctorId: string, serviceKey: string): string {
  const h = createHash('sha256')
    .update(`clariva:svc:v1:${doctorId}:${serviceKey.trim().toLowerCase()}`)
    .digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = b.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Ensure every offering has `service_id` (deterministic for legacy rows). */
export function hydrateServiceCatalogServiceIds(
  doctorId: string,
  catalog: ServiceCatalogV1
): ServiceCatalogV1 {
  const services = catalog.services.map((s) => {
    if (s.service_id && /^[0-9a-f-]{36}$/i.test(s.service_id)) {
      return s;
    }
    return {
      ...s,
      service_id: deterministicServiceIdForLegacyOffering(doctorId, s.service_key),
    };
  });
  return { ...catalog, services };
}

const MODALITY_KEYS = ['text', 'voice', 'video'] as const;

/**
 * SFU-12: copy legacy service-level `followup_policy` into enabled modality slots that omit it.
 */
export function hydrateOfferingRootFollowUpIntoModalities(offering: ServiceOfferingV1): ServiceOfferingV1 {
  const root = offering.followup_policy;
  if (root === undefined || root === null) {
    return offering;
  }
  const modalities = { ...offering.modalities };
  let changed = false;
  for (const k of MODALITY_KEYS) {
    const slot = modalities[k];
    if (slot?.enabled !== true) continue;
    if (slot.followup_policy !== undefined) continue;
    modalities[k] = {
      ...slot,
      followup_policy: JSON.parse(JSON.stringify(root)) as z.infer<typeof followUpPolicyV1Schema>,
    };
    changed = true;
  }
  return changed ? { ...offering, modalities } : offering;
}

/** Run per-offering SFU-12 hydration on a validated catalog. */
export function hydrateCatalogPerModalityFollowUp(catalog: ServiceCatalogV1): ServiceCatalogV1 {
  return {
    ...catalog,
    services: catalog.services.map(hydrateOfferingRootFollowUpIntoModalities),
  };
}

/**
 * SFU-12: episode max_followups + eligibility window come from root policy or first enabled per-modality policy.
 */
export function resolveEpisodeFollowUpEligibilitySource(
  offering: ServiceOfferingV1
): z.infer<typeof followUpPolicyV1Schema> | null {
  if (offering.followup_policy?.enabled) {
    return offering.followup_policy;
  }
  for (const k of MODALITY_KEYS) {
    const fp = offering.modalities[k]?.followup_policy;
    if (fp?.enabled) return fp;
  }
  return null;
}

/**
 * Parse catalog from DB / settings. When `doctorId` is set, legacy rows without `service_id`
 * receive a deterministic UUID so reads match after SFU-11 hydration.
 */
export function safeParseServiceCatalogV1FromDb(
  raw: unknown,
  doctorId?: string
): ServiceCatalogV1 | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const strict = serviceCatalogV1Schema.safeParse(raw);
  if (strict.success) {
    return hydrateCatalogPerModalityFollowUp(strict.data);
  }
  const loose = serviceCatalogIncomingSchema.safeParse(raw);
  if (!loose.success || !doctorId) {
    return null;
  }
  const hydrated = hydrateServiceCatalogServiceIds(doctorId, loose.data as ServiceCatalogV1);
  const again = serviceCatalogV1Schema.safeParse(hydrated);
  return again.success ? hydrateCatalogPerModalityFollowUp(again.data) : null;
}
