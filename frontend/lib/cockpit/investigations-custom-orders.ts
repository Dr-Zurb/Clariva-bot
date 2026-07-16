/**
 * Doctor-saved custom investigation orders (Plan combobox vocabulary).
 *
 * Persisted in `doctor_settings.investigations_custom_orders` (config, not PHI).
 * Distinct from rx-template scope `investigations_orders` (full-list presets).
 *
 * Promotion rules:
 *   - Explicit "Save to my orders" → pinned immediately.
 *   - Repeat use (useCount >= AUTO_PROMOTE) → auto-pin + optional nudge.
 */

import type { InvestigationOrder, InvestigationOrderMember } from "@/types/prescription";

export interface DoctorInvestigationCustomOrderMember {
  id: string;
  label: string;
  kind: InvestigationOrderMember["kind"];
}

export interface DoctorInvestigationCustomOrder {
  id: string;
  label: string;
  members: DoctorInvestigationCustomOrderMember[];
  useCount: number;
  pinned: boolean;
  updatedAt: string;
}

export const INVESTIGATIONS_CUSTOM_ORDERS_MAX = 40;
export const INVESTIGATIONS_CUSTOM_ORDER_ID_MAX = 120;
export const INVESTIGATIONS_CUSTOM_ORDER_LABEL_MAX = 80;
export const INVESTIGATIONS_CUSTOM_ORDER_MEMBERS_MAX = 40;
export const INVESTIGATIONS_CUSTOM_ORDER_AUTO_PROMOTE_USES = 2;

function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

function capitalizeLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function customInvestigationOrderIdFromLabel(label: string): string {
  return `custom:${normalizeKey(label)}`;
}

function sanitizeMember(raw: unknown): DoctorInvestigationCustomOrderMember | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const label =
    typeof row.label === "string"
      ? row.label.trim().slice(0, INVESTIGATIONS_CUSTOM_ORDER_LABEL_MAX)
      : "";
  const kind = row.kind;
  if (
    !id ||
    !label ||
    (kind !== "panel" &&
      kind !== "analyte" &&
      kind !== "imaging" &&
      kind !== "custom")
  ) {
    return null;
  }
  return {
    id: id.slice(0, INVESTIGATIONS_CUSTOM_ORDER_ID_MAX),
    label,
    kind,
  };
}

/** Trim/coerce a single saved order; returns null when unusable. */
export function sanitizeInvestigationCustomOrder(
  raw: unknown,
): DoctorInvestigationCustomOrder | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const idRaw = typeof row.id === "string" ? row.id.trim() : "";
  const label = capitalizeLabel(
    typeof row.label === "string"
      ? row.label.slice(0, INVESTIGATIONS_CUSTOM_ORDER_LABEL_MAX)
      : "",
  );
  if (!idRaw || !label) return null;
  const id = idRaw.startsWith("custom:")
    ? idRaw.slice(0, INVESTIGATIONS_CUSTOM_ORDER_ID_MAX)
    : customInvestigationOrderIdFromLabel(idRaw).slice(
        0,
        INVESTIGATIONS_CUSTOM_ORDER_ID_MAX,
      );
  const useCountRaw =
    typeof row.useCount === "number" && Number.isFinite(row.useCount)
      ? Math.max(0, Math.floor(row.useCount))
      : 0;
  const pinned = row.pinned === true;
  const updatedAt =
    typeof row.updatedAt === "string" && row.updatedAt.trim()
      ? row.updatedAt.trim().slice(0, 40)
      : new Date(0).toISOString();
  const membersRaw = Array.isArray(row.members) ? row.members : [];
  const members: DoctorInvestigationCustomOrderMember[] = [];
  for (const m of membersRaw) {
    const sanitized = sanitizeMember(m);
    if (sanitized) members.push(sanitized);
    if (members.length >= INVESTIGATIONS_CUSTOM_ORDER_MEMBERS_MAX) break;
  }
  return {
    id,
    label,
    members,
    useCount: Math.min(useCountRaw, 10_000),
    pinned,
    updatedAt,
  };
}

/** Sanitize + dedupe (last write wins) + cap. */
export function normalizeInvestigationCustomOrders(
  raw: unknown,
): DoctorInvestigationCustomOrder[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map<string, DoctorInvestigationCustomOrder>();
  for (const entry of raw) {
    const order = sanitizeInvestigationCustomOrder(entry);
    if (order) byId.set(order.id, order);
  }
  return Array.from(byId.values()).slice(0, INVESTIGATIONS_CUSTOM_ORDERS_MAX);
}

/** Orders that should appear in the Plan combobox. */
export function visibleInvestigationCustomOrders(
  orders: readonly DoctorInvestigationCustomOrder[],
): DoctorInvestigationCustomOrder[] {
  return normalizeInvestigationCustomOrders(orders).filter(
    (o) =>
      o.pinned || o.useCount >= INVESTIGATIONS_CUSTOM_ORDER_AUTO_PROMOTE_USES,
  );
}

export function membersFromInvestigationOrder(
  order: InvestigationOrder,
): DoctorInvestigationCustomOrderMember[] {
  return (order.members ?? [])
    .map((m) => sanitizeMember(m))
    .filter((m): m is DoctorInvestigationCustomOrderMember => m != null)
    .slice(0, INVESTIGATIONS_CUSTOM_ORDER_MEMBERS_MAX);
}

export type RecordCustomOrderUseResult = {
  orders: DoctorInvestigationCustomOrder[];
  /** True when this bump newly pinned via auto-promote. */
  autoPromoted: boolean;
  order: DoctorInvestigationCustomOrder;
};

/** Bump useCount; auto-pin at the promote threshold. */
export function recordInvestigationCustomOrderUse(
  existing: readonly DoctorInvestigationCustomOrder[],
  order: InvestigationOrder,
  now = new Date(),
): RecordCustomOrderUseResult {
  const list = normalizeInvestigationCustomOrders(existing);
  const id = order.id.startsWith("custom:")
    ? order.id
    : customInvestigationOrderIdFromLabel(order.label);
  const label = capitalizeLabel(order.label).slice(
    0,
    INVESTIGATIONS_CUSTOM_ORDER_LABEL_MAX,
  );
  const members = membersFromInvestigationOrder(order);
  const prev = list.find((o) => o.id === id);
  const wasVisible =
    prev != null &&
    (prev.pinned || prev.useCount >= INVESTIGATIONS_CUSTOM_ORDER_AUTO_PROMOTE_USES);
  const useCount = (prev?.useCount ?? 0) + 1;
  const pinned =
    prev?.pinned === true ||
    useCount >= INVESTIGATIONS_CUSTOM_ORDER_AUTO_PROMOTE_USES;
  const next: DoctorInvestigationCustomOrder = {
    id,
    label: label || prev?.label || order.label,
    members: members.length > 0 ? members : (prev?.members ?? []),
    useCount,
    pinned,
    updatedAt: now.toISOString(),
  };
  const without = list.filter((o) => o.id !== id);
  const orders = normalizeInvestigationCustomOrders([next, ...without]);
  const autoPromoted =
    pinned &&
    !wasVisible &&
    !(prev?.pinned === true) &&
    useCount >= INVESTIGATIONS_CUSTOM_ORDER_AUTO_PROMOTE_USES;
  return { orders, autoPromoted, order: next };
}

/** Explicit pin (Save to my orders). */
export function pinInvestigationCustomOrder(
  existing: readonly DoctorInvestigationCustomOrder[],
  order: InvestigationOrder,
  now = new Date(),
): DoctorInvestigationCustomOrder[] {
  const list = normalizeInvestigationCustomOrders(existing);
  const id = order.id.startsWith("custom:")
    ? order.id
    : customInvestigationOrderIdFromLabel(order.label);
  const prev = list.find((o) => o.id === id);
  const next: DoctorInvestigationCustomOrder = {
    id,
    label: capitalizeLabel(order.label).slice(
      0,
      INVESTIGATIONS_CUSTOM_ORDER_LABEL_MAX,
    ),
    members: membersFromInvestigationOrder(order),
    useCount: Math.max(prev?.useCount ?? 0, 1),
    pinned: true,
    updatedAt: now.toISOString(),
  };
  const without = list.filter((o) => o.id !== id);
  return normalizeInvestigationCustomOrders([next, ...without]);
}

/** Remove a saved custom order from doctor vocabulary (not from the visit). */
export function removeInvestigationCustomOrder(
  existing: readonly DoctorInvestigationCustomOrder[],
  orderId: string,
): DoctorInvestigationCustomOrder[] {
  const id = orderId.startsWith("custom:")
    ? orderId
    : customInvestigationOrderIdFromLabel(orderId);
  return normalizeInvestigationCustomOrders(
    existing.filter((o) => o.id !== id),
  );
}

/**
 * Rename a saved custom order in place (stable `id`). Empty/unchanged label is a no-op.
 */
export function renameInvestigationCustomOrder(
  existing: readonly DoctorInvestigationCustomOrder[],
  orderId: string,
  nextLabel: string,
  now = new Date(),
): DoctorInvestigationCustomOrder[] {
  const id = orderId.startsWith("custom:")
    ? orderId
    : customInvestigationOrderIdFromLabel(orderId);
  const label = capitalizeLabel(nextLabel).slice(
    0,
    INVESTIGATIONS_CUSTOM_ORDER_LABEL_MAX,
  );
  if (!label) return normalizeInvestigationCustomOrders(existing);
  const list = normalizeInvestigationCustomOrders(existing);
  return normalizeInvestigationCustomOrders(
    list.map((o) =>
      o.id === id
        ? { ...o, label, pinned: true, updatedAt: now.toISOString() }
        : o,
    ),
  );
}

export function isInvestigationCustomOrderSaved(
  orders: readonly DoctorInvestigationCustomOrder[],
  orderId: string,
): boolean {
  const id = orderId.startsWith("custom:")
    ? orderId
    : customInvestigationOrderIdFromLabel(orderId);
  return visibleInvestigationCustomOrders(orders).some((o) => o.id === id);
}

/** Load doctor's stored custom investigation orders (empty = none). */
export async function fetchInvestigationCustomOrders(
  token: string,
): Promise<DoctorInvestigationCustomOrder[]> {
  const { getDoctorSettings } = await import("@/lib/api");
  const res = await getDoctorSettings(token);
  return normalizeInvestigationCustomOrders(
    res.data.settings.investigations_custom_orders,
  );
}

/** Persist the doctor's custom investigation order vocabulary (config, not PHI). */
export async function saveInvestigationCustomOrders(
  token: string,
  orders: DoctorInvestigationCustomOrder[],
): Promise<DoctorInvestigationCustomOrder[]> {
  const { patchDoctorSettings } = await import("@/lib/api");
  const normalized = normalizeInvestigationCustomOrders(orders);
  const res = await patchDoctorSettings(token, {
    investigations_custom_orders: normalized,
  });
  return normalizeInvestigationCustomOrders(
    res.data.settings.investigations_custom_orders,
  );
}
