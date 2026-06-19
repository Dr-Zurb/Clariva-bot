/**
 * Complaint search normalization (mirrors backend complaint-master-service).
 *
 * Used client-side for duplicate detection so "pain in shoulder" and
 * "shoulder pain" are treated as the same chief complaint.
 */

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "my",
  "of",
  "in",
  "on",
  "at",
  "to",
  "and",
  "with",
  "&",
  "i",
  "is",
  "am",
  "are",
  "have",
  "having",
  "has",
  "feel",
  "feeling",
  "felt",
  "get",
  "getting",
  "got",
  "since",
  "for",
  "from",
  "it",
  "its",
  "some",
  "little",
  "bit",
  "there",
  "been",
]);

export function normalizeComplaintToken(token: string): string {
  let t = token.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (t.length > 4 && t.endsWith("ing")) {
    t = t.slice(0, -3);
  } else if (t.length > 3 && t.endsWith("s")) {
    t = t.slice(0, -1);
  }
  return t;
}

export function tokenizeComplaintPhrase(input: string): string[] {
  return (input ?? "")
    .toLowerCase()
    .split(/[^a-z0-9&]+/)
    .filter((w) => w.length > 0 && !STOPWORDS.has(w))
    .map(normalizeComplaintToken)
    .filter((w) => w.length >= 2);
}

/** Sorted token key — word-order independent identity for a complaint phrase. */
export function complaintPhraseTokenKey(name: string): string {
  return [...tokenizeComplaintPhrase(name)].sort().join(" ");
}

/** Whether two complaint names describe the same symptom (word-order tolerant). */
export function complaintNamesEquivalent(a: string, b: string): boolean {
  const trimmedA = a.trim();
  const trimmedB = b.trim();
  if (!trimmedA || !trimmedB) return false;
  if (trimmedA.toLowerCase() === trimmedB.toLowerCase()) return true;

  const keyA = complaintPhraseTokenKey(trimmedA);
  const keyB = complaintPhraseTokenKey(trimmedB);
  if (!keyA || !keyB) return false;
  return keyA === keyB;
}
