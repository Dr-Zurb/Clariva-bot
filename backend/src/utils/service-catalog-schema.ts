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

/** ARM-01 / AI receptionist: reserved slug for mandatory catch-all offering (matcher + booking). */
export const CATALOG_CATCH_ALL_SERVICE_KEY = 'other' as const;

/** Default label for catch-all row (doctors may edit display name; key stays `other`). */
export const CATALOG_CATCH_ALL_LABEL_DEFAULT = 'Other / not listed';

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

/** SFU-12: optional per-modality follow-up policy (max/window/discount can differ by channel). */
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
  });

/**
 * ARM-02: Optional doctor-entered text for AI service-key matching only.
 * Do not put patient PHI here. Omitted from patient-facing fee DMs (`formatServiceCatalogForDm`).
 */
export const serviceMatcherHintsV1Schema = z
  .object({
    keywords: z.string().trim().max(400).optional(),
    include_when: z.string().trim().max(800).optional(),
    exclude_when: z.string().trim().max(800).optional(),
  })
  .strict();

export type ServiceMatcherHintsV1 = z.infer<typeof serviceMatcherHintsV1Schema>;

const serviceOfferingCoreSchema = z.object({
  service_key: z
    .string()
    .min(1)
    .max(64)
    .regex(serviceKeyRegex, 'service_key must be lowercase slug: a-z, 0-9, _, -'),
  label: z.string().min(1).max(200).trim(),
  description: z.string().max(500).trim().nullable().optional(),
  matcher_hints: serviceMatcherHintsV1Schema.optional(),
  modalities: serviceModalitiesSchema,
  followup_policy: followUpPolicyV1Schema.nullable().optional(),
});

/** SFU-11: API / merge input — `service_id` backfilled server-side when absent. */
export const serviceOfferingIncomingSchema = serviceOfferingCoreSchema.extend({
  service_id: z.string().uuid().optional(),
});

/** Persisted catalog row: immutable `service_id` per offering. */
export const serviceOfferingV1Schema = serviceOfferingCoreSchema.extend({
  service_id: z.string().uuid('service_id must be a UUID'),
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

function refineCatalogRequiresCatchAllOffering(
  data: { services: { service_key: string }[] },
  ctx: z.RefinementCtx
): void {
  const has = data.services.some(
    (s) => s.service_key.trim().toLowerCase() === CATALOG_CATCH_ALL_SERVICE_KEY
  );
  if (!has) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Catalog must include a catch-all service with service_key "${CATALOG_CATCH_ALL_SERVICE_KEY}" (default label "${CATALOG_CATCH_ALL_LABEL_DEFAULT}")`,
      path: ['services'],
    });
  }
}

/**
 * Persisted catalog shape + uniqueness — **no** catch-all requirement (legacy DB rows, saved templates).
 */
export const serviceCatalogV1BaseSchema = z
  .object({
    version: z.literal(SERVICE_CATALOG_VERSION),
    services: z.array(serviceOfferingV1Schema).min(1).max(MAX_SERVICE_OFFERINGS),
  })
  .superRefine((data, ctx) => refineCatalogUniqueKeysAndIds(data, ctx, true));

export const serviceCatalogIncomingSchema = z
  .object({
    version: z.literal(SERVICE_CATALOG_VERSION),
    services: z.array(serviceOfferingIncomingSchema).min(1).max(MAX_SERVICE_OFFERINGS),
  })
  .superRefine((data, ctx) => refineCatalogUniqueKeysAndIds(data, ctx, false))
  .superRefine((data, ctx) => refineCatalogRequiresCatchAllOffering(data, ctx));

/** Live `service_offerings_json`: must include catch-all `other` (ARM-01). */
export const serviceCatalogV1Schema = serviceCatalogV1BaseSchema.superRefine((data, ctx) =>
  refineCatalogRequiresCatchAllOffering(data, ctx)
);

export type ServiceCatalogV1 = z.infer<typeof serviceCatalogV1BaseSchema>;
export type ServiceOfferingV1 = z.infer<typeof serviceOfferingV1Schema>;
export type FollowUpPolicyV1 = z.infer<typeof followUpPolicyV1Schema>;
export type FollowUpDiscountTierV1 = z.infer<typeof followUpDiscountTierV1Schema>;
export type ServiceModalitiesV1 = z.infer<typeof serviceModalitiesSchema>;

/** SFU-14: max saved templates per doctor (doctor_settings.service_catalog_templates_json). */
export const MAX_USER_SAVED_TEMPLATES = 20;

/** One user-named snapshot; `catalog` is full ServiceCatalogV1. */
export const userSavedServiceTemplateSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(80).trim(),
    specialty_tag: z.string().max(200).trim().nullable().optional(),
    updated_at: z.string().max(50),
    /** Snapshots may predate ARM-01; live catalog still requires `other` on save. */
    catalog: serviceCatalogV1BaseSchema,
  })
  .strict();

export const serviceCatalogTemplatesJsonSchema = z
  .object({
    templates: z.array(userSavedServiceTemplateSchema).max(MAX_USER_SAVED_TEMPLATES),
  })
  .strict()
  .superRefine((data, ctx) => {
    const ids = new Set<string>();
    for (let i = 0; i < data.templates.length; i++) {
      const id = data.templates[i]!.id;
      if (ids.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Duplicate template id',
          path: ['templates', i, 'id'],
        });
      }
      ids.add(id);
    }
  });

export type UserSavedServiceTemplateV1 = z.infer<typeof userSavedServiceTemplateSchema>;
export type ServiceCatalogTemplatesJsonV1 = z.infer<typeof serviceCatalogTemplatesJsonSchema>;

/** Parse stored JSON; null if missing/invalid (callers may default to { templates: [] }). */
export function parseServiceCatalogTemplatesJson(
  raw: unknown
): ServiceCatalogTemplatesJsonV1 | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const result = serviceCatalogTemplatesJsonSchema.safeParse(raw);
  return result.success ? result.data : null;
}

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
 * Episode row `max_followups` / `eligibility_ends_at` — loose aggregates for legacy readers.
 * Per-modality caps/windows are enforced from `price_snapshot_json` when `followups_used_by_modality` is present.
 */
export function aggregateEpisodeFollowUpRowMeta(
  offering: ServiceOfferingV1,
  completion: Date
): { max_followups: number; eligibility_ends_at: string | null } {
  let maxCap = 0;
  let anyEnabled = false;
  let eligibilityEndsAtMs = 0;
  const bump = (pol: z.infer<typeof followUpPolicyV1Schema> | null | undefined) => {
    if (!pol?.enabled) return;
    anyEnabled = true;
    if (pol.max_followups > maxCap) {
      maxCap = pol.max_followups;
    }
    const d = new Date(completion.getTime());
    d.setUTCDate(d.getUTCDate() + pol.eligibility_window_days);
    const ms = d.getTime();
    if (!eligibilityEndsAtMs || ms > eligibilityEndsAtMs) {
      eligibilityEndsAtMs = ms;
    }
  };

  for (const k of MODALITY_KEYS) {
    const slot = offering.modalities[k];
    if (slot?.enabled === true) {
      bump(slot.followup_policy);
    }
  }
  bump(offering.followup_policy);
  if (!anyEnabled) {
    return { max_followups: 0, eligibility_ends_at: null };
  }
  return {
    max_followups: maxCap,
    eligibility_ends_at: new Date(eligibilityEndsAtMs).toISOString(),
  };
}

/**
 * @deprecated Prefer aggregateEpisodeFollowUpRowMeta — kept for callers that need a single policy shape.
 * SFU-12: first enabled root, else first enabled per-modality policy.
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
  const baseOk = serviceCatalogV1BaseSchema.safeParse(raw);
  if (baseOk.success) {
    return hydrateCatalogPerModalityFollowUp(baseOk.data);
  }
  /** Legacy rows may lack catch-all until the next save (ARM-01). */
  const legacyIncomingSchema = z
    .object({
      version: z.literal(SERVICE_CATALOG_VERSION),
      services: z.array(serviceOfferingIncomingSchema).min(1).max(MAX_SERVICE_OFFERINGS),
    })
    .superRefine((data, ctx) => refineCatalogUniqueKeysAndIds(data, ctx, false));
  const looseRaw = legacyIncomingSchema.safeParse(raw);
  if (!looseRaw.success || !doctorId) {
    return null;
  }
  const hydrated = hydrateServiceCatalogServiceIds(doctorId, looseRaw.data as ServiceCatalogV1);
  const again = serviceCatalogV1BaseSchema.safeParse(hydrated);
  return again.success ? hydrateCatalogPerModalityFollowUp(again.data) : null;
}
