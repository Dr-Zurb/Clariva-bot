/**
 * Live hidden-set registry for the visit command bar (rfec-02).
 *
 * SOAP tabs / VitalsGrid register the ids they currently hide. The bar
 * offers *Show* and calls back into the same `setHiddenIds` those
 * surfaces already persist. No new doctor-settings key.
 */

import { useSyncExternalStore } from "react";
import type { RxFieldPaneId } from "@/lib/search/rx-fields";

export interface RxHiddenTarget {
  kind: "section" | "vital";
  pane: RxFieldPaneId;
  section: string;
  field?: string;
  label: string;
}

export interface RxHiddenSource {
  hidden: readonly RxHiddenTarget[];
  show: (target: RxHiddenTarget) => boolean;
}

const listeners = new Set<() => void>();
const sources = new Map<string, RxHiddenSource>();
const EMPTY: readonly RxHiddenTarget[] = [];
let cached: readonly RxHiddenTarget[] = EMPTY;

function emit(): void {
  const next: RxHiddenTarget[] = [];
  Array.from(sources.values()).forEach((source) => {
    next.push(...source.hidden);
  });
  cached = next;
  Array.from(listeners).forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): readonly RxHiddenTarget[] {
  return cached;
}

/** Register a tab's hidden set. Call again when the set changes. */
export function registerRxHiddenSource(
  id: string,
  source: RxHiddenSource
): () => void {
  sources.set(id, source);
  emit();
  return () => {
    if (sources.get(id) === source) sources.delete(id);
    emit();
  };
}

export function showHiddenTarget(target: RxHiddenTarget): boolean {
  return Array.from(sources.values()).some((source) => source.show(target));
}

export function useRxHiddenTargets(): readonly RxHiddenTarget[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

export function rxFocusForHiddenTarget(target: RxHiddenTarget): string {
  return target.field
    ? `${target.pane}.${target.section}.${target.field}`
    : `${target.pane}.${target.section}`;
}

function fold(value: string): string {
  return value.normalize("NFKC").toLowerCase();
}

function matchesTarget(target: RxHiddenTarget, needle: string): boolean {
  if (fold(target.label).includes(needle)) return true;
  if (fold(target.section.replace(/_/g, " ")).includes(needle)) return true;
  if (fold(target.section).includes(needle)) return true;
  if (target.field && fold(target.field).includes(needle)) return true;
  return false;
}

const MAX_SHOW_HITS = 8;

/** Hidden-only Show hits. Visible fields stay jump-only (rfec-01). */
export function searchShowHits(
  query: string,
  hidden: readonly RxHiddenTarget[]
): RxHiddenTarget[] {
  const needle = fold(query.trim());
  if (needle.length === 0) return [];
  const hits: RxHiddenTarget[] = [];
  for (const target of hidden) {
    if (!matchesTarget(target, needle)) continue;
    hits.push(target);
    if (hits.length >= MAX_SHOW_HITS) break;
  }
  return hits;
}

/** Test-only: drop every source so suites do not leak. */
export function resetRxHiddenSourcesForTests(): void {
  sources.clear();
  cached = EMPTY;
}
