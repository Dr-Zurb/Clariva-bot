"use client";

/**
 * Built-in modality layout presets (clpm-02 / DL-9).
 *
 * Not persisted to the DB — listed in the preset picker alongside custom rows.
 */

import type { PaneDefinition } from "./types";
import type { LayoutNode } from "./types";
import {
  getTelemedVideoTemplate,
  getTelemedVoiceTemplate,
  getTelemedTextTemplate,
  getReviewTemplate,
  type TelemedVideoContext,
} from "./templates";

export interface BuiltInLayoutPreset {
  id: string;
  name: string;
  description: string;
  /** Built-in template id for reset-to-default (DL-11). */
  sourceTemplateId: string;
  layoutTree: LayoutNode;
}

function normalizeSizes(pcts: number[]): number[] {
  const sum = pcts.reduce((a, b) => a + b, 0) || 1;
  const raw = pcts.map((p) => (p / sum) * 100);
  const rounded = raw.map((v) => Math.round(v));
  const drift = 100 - rounded.reduce((a, b) => a + b, 0);
  if (drift !== 0 && rounded.length > 0) {
    rounded[rounded.length - 1] = (rounded[rounded.length - 1] ?? 0) + drift;
  }
  return rounded;
}

/**
 * Lift a {@link PaneDefinition} tree (from templates.tsx) into the persisted
 * {@link LayoutNode} shape. Group nodes become splits; leaves become panes.
 */
export function convertTemplateToTree(
  template: PaneDefinition[],
  parentIsHorizontal?: boolean,
): LayoutNode {
  if (template.length === 0) {
    throw new Error("convertTemplateToTree: empty template");
  }
  if (template.length === 1) {
    return paneDefToLayoutNode(template[0]!, parentIsHorizontal);
  }
  return {
    kind: "split",
    direction: "horizontal",
    children: template.map((t) => paneDefToLayoutNode(t, true)),
    sizes: normalizeSizes(
      template.map((t) => t.naturalSizePct ?? 100 / template.length),
    ),
  };
}

function paneDefToLayoutNode(
  def: PaneDefinition,
  parentIsHorizontal?: boolean,
): LayoutNode {
  if (def.children && def.children.length > 0) {
    const direction =
      def.direction ??
      (parentIsHorizontal === true
        ? "vertical"
        : parentIsHorizontal === false
          ? "horizontal"
          : "vertical");
    const children = def.children.map((c) =>
      paneDefToLayoutNode(c, direction === "horizontal"),
    );
    const pcts = def.children.map(
      (c) => c.naturalSizePct ?? 100 / def.children!.length,
    );
    return {
      kind: "split",
      direction,
      children,
      sizes: normalizeSizes(pcts),
    };
  }
  return { kind: "pane", paneId: def.id };
}

/** Minimal context for template factories — layout structure only, no live data. */
function builtinTemplateContext(): TelemedVideoContext {
  return {
    appointment: {
      id: "builtin-appt",
      doctor_id: "builtin-doc",
      patient_name: "Patient",
      patient_phone: null,
      patient_age: null,
      patient_sex: null,
      appointment_date: "2026-05-24T10:00:00Z",
      status: "confirmed",
      created_at: "2026-05-01T00:00:00Z",
      updated_at: "2026-05-01T00:00:00Z",
      consultation_session: null,
    },
    token: "",
    state: "live",
  };
}

export const BUILT_IN_PRESETS: readonly BuiltInLayoutPreset[] = [
  {
    id: "builtin-telemed-video",
    name: "Telemed (Video)",
    description: "Default 8-pane layout for video consults.",
    sourceTemplateId: "telemed-video",
    layoutTree: convertTemplateToTree(getTelemedVideoTemplate(builtinTemplateContext())),
  },
  {
    id: "builtin-telemed-voice",
    name: "Telemed (Voice)",
    description: "Audio-first layout with chart prominent.",
    sourceTemplateId: "telemed-voice",
    layoutTree: convertTemplateToTree(getTelemedVoiceTemplate(builtinTemplateContext())),
  },
  {
    id: "builtin-telemed-text",
    name: "Telemed (Text)",
    description: "Chat-first layout for text consults.",
    sourceTemplateId: "telemed-text",
    layoutTree: convertTemplateToTree(getTelemedTextTemplate(builtinTemplateContext())),
  },
  {
    id: "builtin-review",
    name: "Read-only Review",
    description: "Single-column scroll for review consults.",
    sourceTemplateId: "review",
    layoutTree: convertTemplateToTree(getReviewTemplate(builtinTemplateContext())),
  },
] as const;
