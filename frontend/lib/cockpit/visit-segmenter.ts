/**
 * Deterministic visit-paragraph segmenter (rfed-01 / vnb-02).
 *
 * Splits a short dictation on SOAP cue phrases. Model-free — do not import
 * an API client here (RFE3-D2 / VN-DL-4). The segmenter labels; it does not
 * validate values.
 *
 * Cue table is the single list. Downstream routers must import it, not copy it.
 */

export type VisitProseTarget = "exam" | "advice" | "note";

export type VisitSliceKind =
  | "complaint"
  | "medicine"
  | "vital"
  | "diagnosis"
  | "investigation"
  | "prose"
  | "ignored"
  | "leftover";

export type VisitCueKind = Exclude<VisitSliceKind, "leftover">;

export interface VisitCue {
  phrase: string;
  kind: VisitCueKind;
  /** Required when `kind === "prose"`. */
  proseTarget?: VisitProseTarget;
}

export interface VisitSlice {
  kind: VisitSliceKind;
  text: string;
  /** Opening cue, lowercased. Null on leftover. */
  cue: string | null;
  proseTarget?: VisitProseTarget;
}

/**
 * Product-locked cues. Common shorthand only.
 * No Hindi/Marathi rows — leftover covers those via the parsers.
 */
export const VISIT_SEGMENT_CUES: readonly VisitCue[] = [
  { phrase: "chief complaint", kind: "complaint" },
  { phrase: "complains of", kind: "complaint" },
  { phrase: "complain of", kind: "complaint" },
  { phrase: "complaints", kind: "complaint" },
  { phrase: "complaint", kind: "complaint" },
  { phrase: "c/o", kind: "complaint" },
  { phrase: "cc", kind: "complaint" },

  { phrase: "on examination", kind: "prose", proseTarget: "exam" },
  { phrase: "examination", kind: "prose", proseTarget: "exam" },
  { phrase: "exam", kind: "prose", proseTarget: "exam" },
  { phrase: "o/e", kind: "prose", proseTarget: "exam" },

  { phrase: "impression", kind: "diagnosis" },
  { phrase: "diagnosis", kind: "diagnosis" },
  { phrase: "diagnoses", kind: "diagnosis" },
  { phrase: "imp", kind: "diagnosis" },
  { phrase: "dx", kind: "diagnosis" },

  { phrase: "investigations", kind: "investigation" },
  { phrase: "investigation", kind: "investigation" },
  { phrase: "send for", kind: "investigation" },
  { phrase: "orders", kind: "investigation" },
  { phrase: "order", kind: "investigation" },
  { phrase: "labs", kind: "investigation" },
  { phrase: "lab", kind: "investigation" },
  { phrase: "test", kind: "investigation" },

  { phrase: "blood pressure", kind: "vital" },
  { phrase: "heart rate", kind: "vital" },
  { phrase: "temperature", kind: "vital" },
  { phrase: "vitals", kind: "vital" },
  { phrase: "vital", kind: "vital" },
  { phrase: "glucose", kind: "vital" },
  { phrase: "weight", kind: "vital" },
  { phrase: "height", kind: "vital" },
  { phrase: "pulse", kind: "vital" },
  { phrase: "spo2", kind: "vital" },
  { phrase: "temp", kind: "vital" },
  { phrase: "gcs", kind: "vital" },
  { phrase: "bp", kind: "vital" },
  { phrase: "rr", kind: "vital" },

  { phrase: "advice and education", kind: "prose", proseTarget: "advice" },
  { phrase: "advice", kind: "prose", proseTarget: "advice" },
  { phrase: "counsel", kind: "prose", proseTarget: "advice" },

  { phrase: "family history", kind: "prose", proseTarget: "note" },
  { phrase: "social history", kind: "prose", proseTarget: "note" },
  { phrase: "past surgical", kind: "prose", proseTarget: "note" },
  { phrase: "surgical history", kind: "prose", proseTarget: "note" },
  { phrase: "allergies", kind: "prose", proseTarget: "note" },
  { phrase: "allergy", kind: "prose", proseTarget: "note" },
  { phrase: "follow-up", kind: "prose", proseTarget: "note" },
  { phrase: "follow up", kind: "prose", proseTarget: "note" },
  { phrase: "followup", kind: "prose", proseTarget: "note" },
  { phrase: "referral", kind: "prose", proseTarget: "note" },

  { phrase: "for review", kind: "medicine" },
  { phrase: "review", kind: "medicine" },
  { phrase: "started on", kind: "medicine" },
  { phrase: "start on", kind: "medicine" },
  { phrase: "medications", kind: "medicine" },
  { phrase: "medication", kind: "medicine" },
  { phrase: "medicines", kind: "medicine" },
  { phrase: "medicine", kind: "medicine" },
  { phrase: "prescribe", kind: "medicine" },
  { phrase: "prescribed", kind: "medicine" },
  { phrase: "meds", kind: "medicine" },
  { phrase: "plan", kind: "medicine" },
  { phrase: "rx", kind: "medicine" },
  { phrase: "tab", kind: "medicine" },
  { phrase: "cap", kind: "medicine" },
];

interface CueHit {
  index: number;
  end: number;
  bodyStart: number;
  phrase: string;
  kind: VisitCueKind;
  proseTarget?: VisitProseTarget;
}

function isWordChar(ch: string | undefined): boolean {
  if (!ch) return false;
  return /[a-z0-9]/i.test(ch);
}

function isCueAt(haystack: string, index: number, phrase: string): boolean {
  if (haystack.slice(index, index + phrase.length) !== phrase) return false;
  if (isWordChar(haystack[index - 1])) return false;
  if (isWordChar(haystack[index + phrase.length])) return false;
  return true;
}

function consumeCueTrailer(haystack: string, afterPhrase: number): number {
  let i = afterPhrase;
  if (haystack[i] === ":" || haystack[i] === "-") i += 1;
  while (i < haystack.length && /\s/.test(haystack[i]!)) i += 1;
  return i;
}

function findCueHits(folded: string): CueHit[] {
  const candidates: CueHit[] = [];
  for (const cue of VISIT_SEGMENT_CUES) {
    const phrase = cue.phrase;
    let from = 0;
    while (from <= folded.length - phrase.length) {
      const index = folded.indexOf(phrase, from);
      if (index < 0) break;
      if (isCueAt(folded, index, phrase)) {
        const afterPhrase = index + phrase.length;
        candidates.push({
          index,
          end: afterPhrase,
          bodyStart: consumeCueTrailer(folded, afterPhrase),
          phrase,
          kind: cue.kind,
          proseTarget: cue.proseTarget,
        });
      }
      from = index + 1;
    }
  }

  candidates.sort((a, b) => a.index - b.index || b.phrase.length - a.phrase.length);

  const hits: CueHit[] = [];
  let coveredThrough = -1;
  for (const hit of candidates) {
    if (hit.index < coveredThrough) continue;
    hits.push(hit);
    coveredThrough = hit.end;
  }
  return hits;
}

function toSlice(hit: CueHit, text: string): VisitSlice {
  const slice: VisitSlice = { kind: hit.kind, text, cue: hit.phrase };
  if (hit.kind === "prose" && hit.proseTarget) {
    slice.proseTarget = hit.proseTarget;
  }
  return slice;
}

/**
 * Split a visit paragraph into labelled slices.
 *
 * Empty / whitespace → no slices. No cue at all → one leftover containing
 * the original string (the router sends that to both extractors).
 */
export function segmentVisitText(input: string): VisitSlice[] {
  if (input.trim().length === 0) return [];

  const folded = input.toLowerCase();
  const hits = findCueHits(folded);
  if (hits.length === 0) {
    return [{ kind: "leftover", text: input, cue: null }];
  }

  const slices: VisitSlice[] = [];
  const prefix = input.slice(0, hits[0]!.index).trim();
  if (prefix.length > 0) {
    slices.push({ kind: "leftover", text: prefix, cue: null });
  }

  for (let i = 0; i < hits.length; i += 1) {
    const hit = hits[i]!;
    const bodyEnd = i + 1 < hits.length ? hits[i + 1]!.index : input.length;
    const text = input.slice(hit.bodyStart, bodyEnd).trim();
    if (text.length === 0) continue;
    slices.push(toSlice(hit, text));
  }

  return slices;
}
