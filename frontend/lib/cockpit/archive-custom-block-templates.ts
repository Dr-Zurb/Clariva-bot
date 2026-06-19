/**
 * Opt-in archive cascade for linked `custom_block` templates (subj-42).
 *
 * Mirrors Phase-6 server-apply resilience: attempt every id, keep successes,
 * surface partial failure without blocking the section delete.
 */

import { archiveRxTemplate } from "@/lib/api";

export interface ArchiveCustomBlockTemplatesResult {
  archivedIds: string[];
  failedIds: string[];
}

export type ArchiveTemplateFn = (token: string, templateId: string) => Promise<unknown>;

/** Soft-archive each template id; partial failure is tolerated (P12-D4). */
export async function archiveCustomBlockTemplates(
  token: string,
  templateIds: readonly string[],
  archive: ArchiveTemplateFn = archiveRxTemplate,
): Promise<ArchiveCustomBlockTemplatesResult> {
  const archivedIds: string[] = [];
  const failedIds: string[] = [];

  for (const templateId of templateIds) {
    try {
      await archive(token, templateId);
      archivedIds.push(templateId);
    } catch {
      failedIds.push(templateId);
    }
  }

  return { archivedIds, failedIds };
}
