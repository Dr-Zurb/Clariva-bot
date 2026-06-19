/**
 * Ephemeral, write-once registry of what the free-text parser just auto-filled
 * for a freshly-captured complaint (subj-13 §3 — transparency cue).
 *
 * The parse happens in the capture handlers (ComplaintList / ComplaintCard), but
 * the cue is rendered by the per-card component that mounts afterwards. Rather
 * than thread parsed-keys through the reducer/JSONB (which would persist them),
 * we stash them here keyed by the complaint id and let the card *read* them on
 * mount. Hydrated cards (loaded from a saved prescription) never register, so
 * they never show a spurious cue.
 *
 * Reads are intentionally NON-destructive: the freshly-captured card briefly
 * remounts (its list key swaps from the complaint id to an assigned instance id
 * once `ComplaintList` settles), and a destructive read would be drained by the
 * throwaway first mount. Instead each entry self-expires after a short TTL, which
 * also stops a much-later remount (e.g. after removing a sibling) from resurfacing
 * a stale cue. Nothing is persisted.
 */

import type { Complaint } from "@/types/prescription";
import { formatComplaintDisplayName } from "@/lib/cockpit/complaint-display";
import {
  resolveComplaintAttributeFields,
  type ComplaintAttributeKey,
} from "@/lib/cockpit/complaint-schema";
import type { ParsedComplaintPatch } from "@/lib/cockpit/parse-complaint-text";

/** One entry in the transparency cue. `emphasized` flags fields a doctor must verify. */
export interface ParsedCueItem {
  label: string;
  emphasized: boolean;
}

/** Higher-risk fields get the clearest affordance (subj-13 §3.3). */
const EMPHASIZED_KEYS = new Set<ComplaintAttributeKey>(["laterality", "severity"]);

/** How long a recorded entry lives before self-deleting (covers the remount). */
const REGISTRY_TTL_MS = 2500;

const registry = new Map<string, ParsedCueItem[]>();

function humanizeKey(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

/**
 * Build the cue list from a parsed patch + spawned associated names, resolving
 * each field's human label off the *final* complaint schema. Reads the value
 * back from `complaint` so fields dropped by a downstream guard (e.g. invalid
 * laterality) aren't advertised.
 */
export function buildParsedCueItems(
  complaint: Complaint,
  patch: ParsedComplaintPatch,
  associatedNames: string[],
): ParsedCueItem[] {
  const fields = resolveComplaintAttributeFields({
    complaintName: complaint.name,
    category: complaint.category ?? null,
  });
  const items: ParsedCueItem[] = [];
  for (const key of Object.keys(patch) as (keyof ParsedComplaintPatch)[]) {
    const value = (complaint as unknown as Record<string, unknown>)[key];
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    const label = fields.find((f) => f.key === key)?.label ?? humanizeKey(key);
    items.push({ label, emphasized: EMPHASIZED_KEYS.has(key as ComplaintAttributeKey) });
  }
  for (const name of associatedNames) {
    const label = formatComplaintDisplayName(name);
    if (label) items.push({ label, emphasized: false });
  }
  return items;
}

/** Record the cue items for a complaint id (no-op for an empty list). */
export function recordParsedFields(complaintId: string, items: ParsedCueItem[]): void {
  if (items.length === 0) return;
  registry.set(complaintId, items);
  globalThis.setTimeout(() => registry.delete(complaintId), REGISTRY_TTL_MS);
}

/** Read (non-destructive) the cue items for a complaint id (returns [] when none). */
export function readParsedFields(complaintId: string): ParsedCueItem[] {
  return registry.get(complaintId) ?? [];
}
