/**
 * Public booking slug for /d/:slug. Not PHI. Pure — no database.
 */

export const PUBLIC_SLUG_MIN = 3;
export const PUBLIC_SLUG_MAX = 48;

const PUBLIC_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type PublicSlugDecision =
  | { ok: true; slug: string; changed: boolean }
  | { ok: false; reason: 'invalid' | 'taken' };

export function normalizePublicSlug(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isPublicSlugShape(slug: string): boolean {
  return (
    slug.length >= PUBLIC_SLUG_MIN &&
    slug.length <= PUBLIC_SLUG_MAX &&
    PUBLIC_SLUG_RE.test(slug)
  );
}

/** Letters and numbers from a practice name. Null when the name cannot make a slug. */
export function slugBaseFromPracticeName(name: string | null | undefined): string | null {
  const dashed = (name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  if (!dashed) return null;
  const clipped = dashed.slice(0, PUBLIC_SLUG_MAX).replace(/-+$/g, '');
  if (!isPublicSlugShape(clipped)) return null;
  return clipped;
}

/** Stable fallback that is not derived from a person. Uses the practice's own id. */
export function fallbackPublicSlug(doctorId: string): string {
  const compact = doctorId.replace(/-/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const tail = (compact.slice(0, 8) || 'practice').padEnd(8, '0');
  return `clinic-${tail}`;
}

export function withSlugSuffix(base: string, n: number): string {
  if (n <= 1) return base.slice(0, PUBLIC_SLUG_MAX);
  const suffix = `-${n}`;
  const room = PUBLIC_SLUG_MAX - suffix.length;
  const stem = base.slice(0, Math.max(1, room)).replace(/-+$/g, '');
  const candidate = `${stem}${suffix}`;
  return candidate.slice(0, PUBLIC_SLUG_MAX);
}

/** First free slug. `taken` is other practices only. */
export function nextAvailableSlug(base: string, taken: ReadonlySet<string>): string | null {
  if (!taken.has(base) && isPublicSlugShape(base)) return base;
  for (let n = 2; n <= 99; n += 1) {
    const candidate = withSlugSuffix(base, n);
    if (!taken.has(candidate) && isPublicSlugShape(candidate)) return candidate;
  }
  return null;
}

/**
 * Keep the current slug unless the doctor sent a new one.
 * Generate only when the row has none.
 */
export function resolvePublicSlug(input: {
  doctorId: string;
  practiceName: string | null;
  currentSlug: string | null;
  requested: string | null | undefined;
  takenByOthers: ReadonlySet<string>;
}): PublicSlugDecision {
  const current = input.currentSlug?.trim() ? normalizePublicSlug(input.currentSlug) : null;
  const requestedRaw = input.requested;

  if (requestedRaw !== undefined && requestedRaw !== null && requestedRaw.trim() !== '') {
    const slug = normalizePublicSlug(requestedRaw);
    if (!isPublicSlugShape(slug)) return { ok: false, reason: 'invalid' };
    if (input.takenByOthers.has(slug)) return { ok: false, reason: 'taken' };
    return { ok: true, slug, changed: slug !== current };
  }

  if (current && isPublicSlugShape(current) && !input.takenByOthers.has(current)) {
    return { ok: true, slug: current, changed: false };
  }

  const base = slugBaseFromPracticeName(input.practiceName) ?? fallbackPublicSlug(input.doctorId);
  const slug = nextAvailableSlug(base, input.takenByOthers);
  if (!slug) return { ok: false, reason: 'invalid' };
  return { ok: true, slug, changed: slug !== current };
}
