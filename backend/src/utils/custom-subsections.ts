/**
 * Custom-subsections output helpers (subj-22).
 *
 * Reads the stored `prescriptions.custom_subsections` JSONB tree (depth-2;
 * see migration 144 / subj-19) and shapes it for the patient-facing
 * artifacts — the prescription PDF block and the SMS / snapshot text mirror.
 *
 * Output-only: this module NEVER mutates or persists; it sanitises a copy for
 * rendering. The serialisation mirrors the frontend
 * `frontend/lib/cockpit/custom-subsections.ts#serializeCustomSubsections` so
 * the SMS text matches what the doctor previewed in the cockpit.
 *
 * Empty-omission rules (graceful empties, P7-D-output):
 *   - children with no title are dropped (title is the anchor),
 *   - a section is dropped when it has no title, no body and no surviving child,
 *   - empty bodies are skipped (no stray heading / whitespace),
 *   - the whole block is omitted when no section survives.
 */

import type { CustomSubsection, CustomSubsectionChild } from '../types/prescription';

/** A child sanitised for output — title is guaranteed non-empty. */
export interface OutputCustomSubsectionChild {
  title: string;
  body: string | null;
}

/** A section sanitised for output — at least one of title/body/children present. */
export interface OutputCustomSubsection {
  title: string;
  body: string | null;
  children: OutputCustomSubsectionChild[];
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed : null;
}

function sanitizeChild(child: CustomSubsectionChild): OutputCustomSubsectionChild | null {
  const title = (child.title ?? '').trim();
  if (!title) return null;
  return { title, body: trimOrNull(child.body) };
}

function sanitizeSection(section: CustomSubsection): OutputCustomSubsection | null {
  const title = (section.title ?? '').trim();
  const body = trimOrNull(section.body);
  const children = (section.children ?? [])
    .map(sanitizeChild)
    .filter((c): c is OutputCustomSubsectionChild => c !== null);

  if (!title && !body && children.length === 0) return null;
  return { title, body, children };
}

/**
 * Sanitise the stored JSONB tree into the ordered, empty-omitted shape the PDF
 * renders. Tolerant of malformed input (null/non-array → []).
 */
export function sanitizeCustomSubsectionsForOutput(
  sections: CustomSubsection[] | null | undefined,
): OutputCustomSubsection[] {
  if (!Array.isArray(sections)) return [];
  return sections
    .map(sanitizeSection)
    .filter((s): s is OutputCustomSubsection => s !== null);
}

function serializeChildBlock(child: OutputCustomSubsectionChild): string {
  const lines: string[] = [`  ${child.title}`];
  if (child.body) lines.push(`  ${child.body}`);
  return lines.join('\n');
}

function serializeSectionBlock(section: OutputCustomSubsection): string {
  const lines: string[] = [];
  if (section.title) lines.push(section.title);
  if (section.body) lines.push(section.body);
  if (section.children.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(...section.children.map(serializeChildBlock));
  }
  return lines.join('\n');
}

/**
 * Plain-text mirror for SMS / snapshot. Sections separated by a blank line.
 * Mirrors the frontend serializer so the patient sees the same text the
 * doctor previewed. Returns '' when nothing survives (caller omits the block).
 */
export function serializeCustomSubsections(
  sections: CustomSubsection[] | null | undefined,
): string {
  return sanitizeCustomSubsectionsForOutput(sections)
    .map(serializeSectionBlock)
    .join('\n\n');
}
