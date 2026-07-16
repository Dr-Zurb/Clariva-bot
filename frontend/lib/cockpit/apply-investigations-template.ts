/**
 * Save / apply helpers for Plan investigations section templates.
 * Form-state only — persists the flat `investigations_orders` TEXT on
 * `doctor_rx_templates.investigations` (scope `investigations_orders`).
 */

import { parseInvestigationsOrders } from "@/components/cockpit/rx/inputs/investigations-orders-format";
import type { RxFormAction, RxFormFields } from "@/components/cockpit/rx/RxFormContext";
import type {
  CreateRxTemplatePayload,
  DoctorRxTemplate,
} from "@/types/rx-template";

export const INVESTIGATIONS_TEMPLATE_SCOPE = "investigations_orders" as const;

export function investigationsOrdersCount(value: string | null | undefined): number {
  return parseInvestigationsOrders(value ?? "").length;
}

export function investigationsScopeHasContent(
  fields: Pick<RxFormFields, "investigationsOrders">,
): boolean {
  return investigationsOrdersCount(fields.investigationsOrders) > 0;
}

export function templateInvestigationsHasContent(
  template: DoctorRxTemplate,
): boolean {
  return investigationsOrdersCount(template.investigations) > 0;
}

/** Replace the current investigations list with the template (scoped replace). */
export function buildInvestigationsTemplateApplyActions(
  template: DoctorRxTemplate,
): RxFormAction[] {
  const next = (template.investigations ?? "").trim();
  return [{ type: "SET_FIELD", key: "investigationsOrders", value: next }];
}

export function buildInvestigationsTemplateSavePayload(
  fields: Pick<RxFormFields, "investigationsOrders">,
): Omit<CreateRxTemplatePayload, "name"> {
  return {
    scope: INVESTIGATIONS_TEMPLATE_SCOPE,
    investigations: fields.investigationsOrders.trim(),
    medicines: [],
  };
}

export function defaultInvestigationsSaveName(
  fields: Pick<RxFormFields, "investigationsOrders">,
): string {
  const count = investigationsOrdersCount(fields.investigationsOrders);
  if (count <= 0) return "Investigations";
  if (count === 1) {
    const [first] = parseInvestigationsOrders(fields.investigationsOrders);
    const label = first?.trim();
    if (label) return label.length > 40 ? `${label.slice(0, 37)}…` : label;
  }
  return `Investigations (${count})`;
}
