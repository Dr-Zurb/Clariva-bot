/**
 * SFU-06: Service catalog Zod schema — aligned with backend SFU-01.
 * @see backend/src/utils/service-catalog-schema.ts
 */

import { z } from "zod";

export const SERVICE_CATALOG_VERSION = 1 as const;
export const MAX_SERVICE_OFFERINGS = 50;

/** ARM-01: reserved slug for mandatory catch-all (must match backend). */
export const CATALOG_CATCH_ALL_SERVICE_KEY = "other" as const;
export const CATALOG_CATCH_ALL_LABEL_DEFAULT = "Other / not listed";

const serviceKeyRegex = /^[a-z0-9][a-z0-9_-]{0,63}$/;

const followUpDiscountTypeSchema = z.enum(["none", "percent", "flat_off", "fixed_price", "free"]);

function refineFollowUpDiscountFields(
  discount_type: z.infer<typeof followUpDiscountTypeSchema>,
  discount_value: number | undefined,
  ctx: z.RefinementCtx,
  valuePath: (string | number)[]
): void {
  if (discount_type === "percent") {
    if (discount_value === undefined || discount_value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "discount_type percent requires discount_value between 0 and 100",
        path: valuePath,
      });
    }
  }
  if (discount_type === "flat_off" || discount_type === "fixed_price") {
    if (discount_value === undefined || !Number.isFinite(discount_value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `discount_type ${discount_type} requires discount_value`,
        path: valuePath,
      });
    }
  }
}

/** SFU-09: tiered follow-up discount (aligned with backend service-catalog-schema). */
export const followUpDiscountTierV1Schema = z
  .object({
    from_visit: z.number().int().min(2).max(100),
    discount_type: followUpDiscountTypeSchema,
    discount_value: z.number().min(0).optional(),
  })
  .superRefine((t, ctx) => {
    refineFollowUpDiscountFields(t.discount_type, t.discount_value, ctx, ["discount_value"]);
  });

export const followUpPolicyV1Schema = z
  .object({
    enabled: z.boolean(),
    max_followups: z.number().int().min(0).max(100),
    eligibility_window_days: z.number().int().min(1).max(3650),
    discount_type: followUpDiscountTypeSchema,
    discount_value: z.number().min(0).optional(),
    discount_tiers: z.array(followUpDiscountTierV1Schema).max(20).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.enabled) return;
    refineFollowUpDiscountFields(data.discount_type, data.discount_value, ctx, ["discount_value"]);
  });

export const modalitySlotSchema = z.object({
  enabled: z.boolean(),
  price_minor: z.number().int().min(0),
  followup_policy: followUpPolicyV1Schema.nullable().optional(),
});

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
        message: "At least one modality must be enabled",
        path: [],
      });
    }
    for (const s of slots) {
      if (s!.enabled && s!.price_minor < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enabled modalities must have non-negative price_minor",
          path: [],
        });
        break;
      }
    }
  });

/** ARM-02: optional matcher metadata (AI routing only; not for patient fee DMs). */
export const serviceMatcherHintsV1Schema = z
  .object({
    keywords: z.string().trim().max(400).optional(),
    include_when: z.string().trim().max(800).optional(),
    exclude_when: z.string().trim().max(800).optional(),
  })
  .strict();

export type ServiceMatcherHintsV1 = z.infer<typeof serviceMatcherHintsV1Schema>;

/**
 * SFU-18 (Plan 01 Phase C): per-offering matching scope mode (mirror of backend schema).
 * `strict`   — only match listed keywords / include_when conditions.
 * `flexible` — broader category matching; preserves pre-SFU-18 behavior.
 * Absent/undefined is treated as `flexible` everywhere for backward compatibility.
 */
export const SERVICE_SCOPE_MODES = ["strict", "flexible"] as const;
export const scopeModeSchema = z.enum(SERVICE_SCOPE_MODES);
export type ScopeMode = z.infer<typeof scopeModeSchema>;

/** Single normalization point: undefined → 'flexible'. */
export function resolveServiceScopeMode(scopeMode: ScopeMode | undefined): ScopeMode {
  return scopeMode ?? "flexible";
}

const serviceOfferingCoreSchema = z.object({
  service_key: z
    .string()
    .min(1)
    .max(64)
    .regex(serviceKeyRegex, "service_key must be lowercase slug: a-z, 0-9, _, -"),
  label: z.string().min(1).max(200).trim(),
  description: z.string().max(500).trim().nullable().optional(),
  matcher_hints: serviceMatcherHintsV1Schema.optional(),
  /** SFU-18: optional per-offering scope mode; `undefined` resolves to `flexible`. */
  scope_mode: scopeModeSchema.optional(),
  modalities: serviceModalitiesSchema,
  followup_policy: followUpPolicyV1Schema.nullable().optional(),
});

export const serviceOfferingIncomingSchema = serviceOfferingCoreSchema.extend({
  service_id: z.string().uuid().optional(),
});

export const serviceOfferingV1Schema = serviceOfferingCoreSchema.extend({
  service_id: z.string().uuid("service_id must be a UUID"),
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
        path: ["services", i, "service_key"],
      });
    }
    seenKeys.add(k);
    const id = s.service_id?.trim();
    if (id) {
      if (seenIds.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate service_id: ${id}`,
          path: ["services", i, "service_id"],
        });
      }
      seenIds.add(id);
    } else if (requireAllIds) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "service_id is required",
        path: ["services", i, "service_id"],
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
      message: `Catalog must include the “${CATALOG_CATCH_ALL_LABEL_DEFAULT}” row.`,
      path: ["services"],
    });
  }
}

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

export const serviceCatalogV1Schema = serviceCatalogV1BaseSchema.superRefine((data, ctx) =>
  refineCatalogRequiresCatchAllOffering(data, ctx)
);

export type ServiceCatalogV1 = z.infer<typeof serviceCatalogV1BaseSchema>;
export type ServiceOfferingV1 = z.infer<typeof serviceOfferingV1Schema>;
export type FollowUpPolicyV1 = z.infer<typeof followUpPolicyV1Schema>;

/** End-user copy for Practice Setup / booking flows (avoid Zod paths and jargon). */
export function humanizeServiceCatalogIssue(issue: z.ZodIssue): string {
  const msg = issue.message;

  const dupKey = /^Duplicate service_key:\s*(.+)$/i.exec(msg);
  if (dupKey) {
    const key = dupKey[1]!.trim();
    return `More than one service shares the same code (“${key}”). Give each row a different service name, or remove the duplicate row.`;
  }

  if (/^Duplicate service_id:/i.test(msg)) {
    return "Something is inconsistent in your service list. Try refreshing the page. If this keeps happening, contact support.";
  }

  if (
    msg === "service_id must be a UUID" ||
    (issue.code === "invalid_string" && issue.path.some((p) => p === "service_id"))
  ) {
    return "A service row is missing a valid ID. Try refreshing the page or removing and re-adding that row.";
  }

  if (msg.includes("service_key must be lowercase slug")) {
    return "A service name produced an invalid code. Use only letters, numbers, spaces, hyphens, and underscores in the name.";
  }

  if (msg.includes("At least one modality must be enabled")) {
    return "Turn on at least one channel (text, voice, or video) for each service.";
  }

  if (msg.includes("service_id is required")) {
    return "A service row is incomplete. Try refreshing the page or re-adding that service.";
  }

  if (issue.code === "too_small" && issue.path.some((p) => p === "label")) {
    return "Each service needs a name.";
  }

  if (issue.path.length > 0 && issue.path[0] === "services" && typeof issue.path[1] === "number") {
    const row = (issue.path[1] as number) + 1;
    return `There's a problem on row ${row}. ${msg}`;
  }

  return msg;
}

export function safeParseServiceCatalogV1(
  input: unknown
): { ok: true; data: ServiceCatalogV1 } | { ok: false; message: string } {
  const result = serviceCatalogV1Schema.safeParse(input);
  if (!result.success) {
    const first = result.error.issues[0];
    const message =
      first != null ? humanizeServiceCatalogIssue(first) : "This catalog could not be saved. Check each service and try again.";
    return { ok: false, message };
  }
  return { ok: true, data: result.data };
}
