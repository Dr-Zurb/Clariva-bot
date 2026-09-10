/**
 * Rank a free-text patient `q` hit for desk / list search.
 * Lower rank is better: patient name, then relative name, then other fields.
 */

export function isNameSearchQuery(q: string): boolean {
  const trimmed = q.trim();
  if (!trimmed) return false;
  const compact = trimmed.replace(/\s+/g, '');
  if (/^p-?\d+$/i.test(compact)) return false;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length >= 2 && !/[a-z]/i.test(trimmed)) return false;
  return /[a-z]/i.test(trimmed);
}

function tokens(raw: string): string[] {
  return raw.toLowerCase().trim().split(/\s+/).filter(Boolean);
}

function hasAllTokens(haystack: string, parts: string[]): boolean {
  return parts.length > 0 && parts.every((part) => haystack.includes(part));
}

/**
 * 0 = name starts with the query (or first token)
 * 1 = name contains the query / all tokens
 * 2 = relative / guardian contains the query
 * 3 = other field (phone, MRN, address, …)
 */
export function patientSearchRank(
  q: string,
  name: string,
  guardianName?: string | null
): number {
  const needle = q.toLowerCase().trim();
  const parts = tokens(needle);
  const n = name.toLowerCase().trim();
  const g = (guardianName ?? '').toLowerCase().trim();

  if (n && (n.startsWith(needle) || (parts[0] != null && n.startsWith(parts[0])))) {
    return 0;
  }
  if (n && (n.includes(needle) || hasAllTokens(n, parts))) {
    return 1;
  }
  if (g && (g.includes(needle) || hasAllTokens(g, parts))) {
    return 2;
  }
  return 3;
}

export function comparePatientSearchHits(
  q: string,
  a: { name: string; guardian_name?: string | null },
  b: { name: string; guardian_name?: string | null }
): number {
  const rank = patientSearchRank(q, a.name, a.guardian_name) - patientSearchRank(q, b.name, b.guardian_name);
  if (rank !== 0) return rank;
  const byName = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  if (byName !== 0) return byName;
  return (a.guardian_name ?? '').localeCompare(b.guardian_name ?? '', undefined, {
    sensitivity: 'base',
  });
}
