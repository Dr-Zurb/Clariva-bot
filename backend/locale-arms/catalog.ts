/**
 * Families the locale-arms generate/apply scripts know about.
 * English source of truth stays in the copy module; catalog only lists ids.
 */

export interface LocaleArmCatalogEntry {
  readonly familyId: string;
  readonly builder: string;
  /** English string used when regenerating drafts (must match production en arm). */
  readonly en: string;
  /** Relative path under backend/ for apply target documentation. */
  readonly modulePath: string;
  readonly phi: boolean;
}

export const LOCALE_ARM_CATALOG: readonly LocaleArmCatalogEntry[] = [
  {
    familyId: 'non-text-ack',
    builder: 'buildNonTextAckMessage',
    en: "I can't read images or voice notes yet — could you type your message instead? I'll take it from there.",
    modulePath: 'src/utils/dm-copy.ts',
    phi: false,
  },
];

export function getCatalogEntry(familyId: string): LocaleArmCatalogEntry | undefined {
  return LOCALE_ARM_CATALOG.find((e) => e.familyId === familyId);
}
