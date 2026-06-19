import type { CustomSubsection, CustomSubsectionChild } from "@/types/prescription";

export type { CustomSubsection, CustomSubsectionChild } from "@/types/prescription";

export const CUSTOM_SUBSECTIONS_MAX = 20;
export const CUSTOM_SUBSECTION_CHILDREN_MAX = 10;

function findSectionIndex(sections: CustomSubsection[], sectionId: string): number {
  return sections.findIndex((s) => s.id === sectionId);
}

function stripNestedChildren(child: CustomSubsectionChild): CustomSubsectionChild {
  const { id, title, body } = child;
  return { id, title, body: body ?? null };
}

export function sanitizeCustomSubsectionChildForStorage(
  child: CustomSubsectionChild,
): CustomSubsectionChild {
  return stripNestedChildren(child);
}

/** In-form normalization — preserves trailing spaces while the doctor is typing. */
export function normalizeCustomSubsectionInForm(section: CustomSubsection): CustomSubsection {
  return {
    id: section.id,
    title: section.title,
    body: section.body ?? null,
    children: (section.children ?? []).map(sanitizeCustomSubsectionChildForStorage),
  };
}

/** Trim/filter for save, export, and doctor-default persistence. */
export function sanitizeCustomSubsectionForStorage(section: CustomSubsection): CustomSubsection {
  const normalized = normalizeCustomSubsectionInForm(section);
  return {
    id: normalized.id,
    title: normalized.title.trim(),
    body: normalized.body?.trim() || null,
    children: normalized.children.filter((c) => c.title.trim()),
  };
}

export function createCustomSubsectionId(): string {
  return crypto.randomUUID();
}

/** Keep an existing id when present + valid; mint one only for absent/malformed rows. */
function preserveOrMintCustomSubsectionId(id: string | null | undefined): string {
  return typeof id === "string" && id.trim() ? id : createCustomSubsectionId();
}

export function createEmptyCustomSubsectionChild(id?: string): CustomSubsectionChild {
  return {
    id: id ?? createCustomSubsectionId(),
    title: "",
    body: null,
  };
}

export function createEmptyCustomSubsection(id?: string): CustomSubsection {
  return {
    id: id ?? createCustomSubsectionId(),
    title: "",
    body: null,
    children: [],
  };
}

export function normalizeCustomSubsections(
  sections: CustomSubsection[] | null | undefined,
): CustomSubsection[] {
  if (!sections || !Array.isArray(sections)) return [];
  return sections.map((section) => ({
    id: section.id,
    title: section.title ?? "",
    body: section.body ?? null,
    children: (section.children ?? []).map((child) => ({
      id: child.id,
      title: child.title ?? "",
      body: child.body ?? null,
    })),
  }));
}

function childHasContent(child: CustomSubsectionChild): boolean {
  return Boolean(child.title.trim() || child.body?.trim());
}

function sectionHasContent(section: CustomSubsection): boolean {
  if (section.title.trim() || section.body?.trim()) return true;
  return (section.children ?? []).some(childHasContent);
}

export function hasCustomSubsectionsContent(sections: CustomSubsection[]): boolean {
  return sections.some(sectionHasContent);
}

function serializeChildBlock(child: CustomSubsectionChild): string | null {
  const title = child.title.trim();
  const body = child.body?.trim() ?? "";
  if (!title && !body) return null;
  const lines: string[] = [];
  if (title) lines.push(`  ${title}`);
  if (body) lines.push(`  ${body}`);
  return lines.join("\n");
}

function serializeSectionBlock(section: CustomSubsection): string | null {
  const title = section.title.trim();
  const body = section.body?.trim() ?? "";
  const childBlocks = (section.children ?? [])
    .map(serializeChildBlock)
    .filter((block): block is string => Boolean(block));

  if (!title && !body && childBlocks.length === 0) return null;

  const lines: string[] = [];
  if (title) lines.push(title);
  if (body) lines.push(body);
  if (childBlocks.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(...childBlocks);
  }
  return lines.join("\n");
}

/** Plain-text mirror for PDF/SMS/snapshot (subj-19 / subj-22). */
export function serializeCustomSubsections(sections: CustomSubsection[]): string {
  return sections
    .map((section) => sanitizeCustomSubsectionForStorage(section))
    .map(serializeSectionBlock)
    .filter((block): block is string => Boolean(block))
    .join("\n\n");
}

export function addCustomSubsection(
  sections: CustomSubsection[],
  section: CustomSubsection,
): CustomSubsection[] {
  return [...sections, normalizeCustomSubsectionInForm(section)];
}

export function updateCustomSubsection(
  sections: CustomSubsection[],
  index: number,
  patch: Partial<CustomSubsection>,
): CustomSubsection[] {
  const next = [...sections];
  const current = next[index];
  if (!current) return sections;
  const merged = { ...current, ...patch };
  if (patch.children) {
    merged.children = patch.children.map(sanitizeCustomSubsectionChildForStorage);
  }
  next[index] = normalizeCustomSubsectionInForm(merged);
  return next;
}

export function removeCustomSubsection(
  sections: CustomSubsection[],
  index: number,
): CustomSubsection[] {
  return sections.filter((_, i) => i !== index);
}

export function reorderCustomSubsections(
  sections: CustomSubsection[],
  fromIndex: number,
  toIndex: number,
): CustomSubsection[] {
  if (fromIndex === toIndex) return sections;
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= sections.length ||
    toIndex >= sections.length
  ) {
    return sections;
  }
  const next = [...sections];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved!);
  return next;
}

export function addCustomSubsectionChild(
  sections: CustomSubsection[],
  sectionId: string,
  child: CustomSubsectionChild,
): CustomSubsection[] {
  const sectionIndex = findSectionIndex(sections, sectionId);
  if (sectionIndex < 0) return sections;
  const section = sections[sectionIndex]!;
  const children = [...section.children, sanitizeCustomSubsectionChildForStorage(child)];
  const next = [...sections];
  next[sectionIndex] = { ...section, children };
  return next;
}

export function updateCustomSubsectionChild(
  sections: CustomSubsection[],
  sectionId: string,
  childIndex: number,
  patch: Partial<CustomSubsectionChild>,
): CustomSubsection[] {
  const sectionIndex = findSectionIndex(sections, sectionId);
  if (sectionIndex < 0) return sections;
  const section = sections[sectionIndex]!;
  const children = [...section.children];
  const current = children[childIndex];
  if (!current) return sections;
  children[childIndex] = sanitizeCustomSubsectionChildForStorage({ ...current, ...patch });
  const next = [...sections];
  next[sectionIndex] = { ...section, children };
  return next;
}

export function removeCustomSubsectionChild(
  sections: CustomSubsection[],
  sectionId: string,
  childIndex: number,
): CustomSubsection[] {
  const sectionIndex = findSectionIndex(sections, sectionId);
  if (sectionIndex < 0) return sections;
  const section = sections[sectionIndex]!;
  const children = section.children.filter((_, i) => i !== childIndex);
  const next = [...sections];
  next[sectionIndex] = { ...section, children };
  return next;
}

export function reorderCustomSubsectionChildren(
  sections: CustomSubsection[],
  sectionId: string,
  fromIndex: number,
  toIndex: number,
): CustomSubsection[] {
  if (fromIndex === toIndex) return sections;
  const sectionIndex = findSectionIndex(sections, sectionId);
  if (sectionIndex < 0) return sections;
  const section = sections[sectionIndex]!;
  const children = [...section.children];
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= children.length ||
    toIndex >= children.length
  ) {
    return sections;
  }
  const [moved] = children.splice(fromIndex, 1);
  children.splice(toIndex, 0, moved!);
  const next = [...sections];
  next[sectionIndex] = { ...section, children };
  return next;
}

export function serializeCustomSubsectionsForPayload(
  sections: CustomSubsection[],
): CustomSubsection[] {
  return sections
    .map((section) => sanitizeCustomSubsectionForStorage(section))
    .filter((section) => section.title.trim());
}

/**
 * Strip visit bodies; keep titles/structure for the per-doctor default template (subj-21).
 * Preserves the existing id so a template-backed block keeps one stable identity across
 * create → doctor-default autosave → per-visit seed (subj-36); only absent/malformed ids mint.
 */
export function customSubsectionsToDefaultTemplate(
  sections: CustomSubsection[],
): CustomSubsection[] {
  return sections
    .map((section) => sanitizeCustomSubsectionForStorage(section))
    .filter((section) => section.title.trim())
    .map((section) => ({
      id: preserveOrMintCustomSubsectionId(section.id),
      title: section.title,
      body: null,
      children: section.children.map((child) => ({
        id: preserveOrMintCustomSubsectionId(child.id),
        title: child.title,
        body: null,
      })),
    }));
}

/** Clone a doctor default into a fresh visit (ids preserved verbatim, empty bodies — subj-21/36). */
export function seedCustomSubsectionsFromDefault(
  defaults: CustomSubsection[],
): CustomSubsection[] {
  return customSubsectionsToDefaultTemplate(defaults);
}

/**
 * Stable signature of titles + child titles (ignores ids/bodies) for autosaving the
 * per-doctor default when structure changes.
 */
export function customSubsectionsStructureKey(sections: CustomSubsection[]): string {
  return JSON.stringify(
    sections.map((section) => ({
      title: section.title.trim(),
      children: (section.children ?? []).map((child) => child.title.trim()),
    })),
  );
}
