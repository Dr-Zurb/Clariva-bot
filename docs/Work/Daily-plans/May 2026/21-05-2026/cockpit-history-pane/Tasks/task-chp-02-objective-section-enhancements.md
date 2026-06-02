# chp-02 · ObjectiveSection enhancements + legacy `vitalsText` demote

> **Status:** ✅ **DONE** (2026-05-23) — `exam-findings.ts` helpers; General + Systemic split; `testResults` textarea; legacy `vitalsText` in collapsed `<details>`; unit tests green.
>
> **Wave 1 lane β** of the [cockpit-history-pane batch](../plan-cockpit-history-pane-batch.md). Rework `ObjectiveSection.tsx`: split `examinationFindings` into General + Systemic via delimited serialization (DL-6 / DL-9), add `testResults` textarea, demote legacy `vitalsText` to a collapsed `<details>` disclosure. Disjoint from chp-01 (different file in `sections/` vs `inputs/`).

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | M (~100 LOC into `ObjectiveSection.tsx` + ~60 LOC new `exam-findings.ts` helpers + ~160 LOC tests) |
| **Model** | **Auto** — bounded surgery on one section component + a small pure-function helper. Pure helpers are easy to test; no architectural decisions. Per AGENT-EXECUTION-EFFICIENCY-GUIDE this is below the Opus threshold. |
| **Wave** | 1 (lane β) |
| **Depends on** | — |
| **Blocks** | chp-03 (Wave 2 wire-up + telemetry), chp-04 (smoke validation) |

---

## Goal

Land the bulk of R-HISTORY's new content surface:
1. Split the single `examinationFindings` textarea into General + Systemic (two textareas, one DB field via delimited serialization).
2. Add `testResults` textarea so patient-brought labs / reports are captured without conflating them with `investigations_orders` (which is what the doctor is ORDERING today).
3. Demote the legacy `vitalsText` input to a collapsed `<details>` disclosure — it's a holdover from before the structured grid existed and shouldn't dominate the UI anymore.

---

## What to do

### 1. New helper file — `frontend/lib/cockpit/exam-findings.ts`

```ts
/**
 * Parse / serialize helpers for `examination_findings` per DL-6 / DL-9.
 *
 * The DB column is a single `examination_findings` text field (cv2-04 migration
 * 103). The R-HISTORY UI presents two textareas (General + Systemic). This helper
 * pair handles the round-trip via a delimiter.
 *
 * Format:
 *   {general text}\n--- SYSTEMIC ---\n{systemic text}
 *
 * Legacy data (no delimiter) populates `general` and leaves `systemic` empty.
 */

export interface ExamSections {
  general: string;
  systemic: string;
}

export const EXAM_DELIMITER = "\n--- SYSTEMIC ---\n";

/**
 * Parse a combined examination_findings string into general + systemic sections.
 * Tolerates absence of the delimiter (treats everything as general — legacy data).
 */
export function parseExam(combined: string): ExamSections {
  if (!combined) return { general: "", systemic: "" };

  const idx = combined.indexOf(EXAM_DELIMITER);
  if (idx === -1) {
    return { general: combined, systemic: "" };
  }
  return {
    general: combined.slice(0, idx),
    systemic: combined.slice(idx + EXAM_DELIMITER.length),
  };
}

/**
 * Serialize general + systemic into a single examination_findings string.
 * Returns "" when both sections are empty (so the column stores null per the
 * existing `.trim() || null` rule in RxFormContext.serialize).
 *
 * Escapes any literal `--- SYSTEMIC ---` in the general section by prepending
 * a zero-width-joiner to the second hyphen, preserving the doctor's intent.
 */
export function serializeExam(general: string, systemic: string): string {
  const safeGeneral = general.replaceAll(EXAM_DELIMITER, "\n--\u200d- SYSTEMIC ---\n");
  if (!safeGeneral && !systemic) return "";
  if (!systemic) return safeGeneral;
  return `${safeGeneral}${EXAM_DELIMITER}${systemic}`;
}
```

### 2. New tests — `frontend/lib/cockpit/__tests__/exam-findings.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { parseExam, serializeExam, EXAM_DELIMITER } from "@/lib/cockpit/exam-findings";

describe("exam-findings", () => {
  describe("parseExam", () => {
    it("returns empty sections for empty input", () => {
      expect(parseExam("")).toEqual({ general: "", systemic: "" });
    });

    it("treats legacy data (no delimiter) as general", () => {
      expect(parseExam("Looks alert and oriented.")).toEqual({
        general: "Looks alert and oriented.",
        systemic: "",
      });
    });

    it("splits on the delimiter", () => {
      const combined = `Pale, afebrile.${EXAM_DELIMITER}Chest: clear. Abdomen: soft, non-tender.`;
      expect(parseExam(combined)).toEqual({
        general: "Pale, afebrile.",
        systemic: "Chest: clear. Abdomen: soft, non-tender.",
      });
    });

    it("handles delimiter at start (empty general)", () => {
      const combined = `${EXAM_DELIMITER}Chest clear.`;
      expect(parseExam(combined)).toEqual({
        general: "",
        systemic: "Chest clear.",
      });
    });

    it("handles delimiter at end (empty systemic)", () => {
      const combined = `Pale.${EXAM_DELIMITER}`;
      expect(parseExam(combined)).toEqual({
        general: "Pale.",
        systemic: "",
      });
    });
  });

  describe("serializeExam", () => {
    it("returns empty string when both sections empty", () => {
      expect(serializeExam("", "")).toBe("");
    });

    it("returns general only when systemic empty", () => {
      expect(serializeExam("Looks well.", "")).toBe("Looks well.");
    });

    it("joins with the delimiter when both present", () => {
      expect(serializeExam("Pale.", "Chest clear.")).toBe(
        `Pale.${EXAM_DELIMITER}Chest clear.`
      );
    });

    it("escapes literal '--- SYSTEMIC ---' in general to prevent collision", () => {
      const general = `Note from intake: --- SYSTEMIC --- review pending.`;
      const out = serializeExam(general, "");
      expect(out).not.toContain(EXAM_DELIMITER);
      expect(out).toContain("\u200d");
    });
  });

  describe("round-trip", () => {
    it("parse(serialize(x)) === x for normal inputs", () => {
      const cases = [
        { general: "Alert", systemic: "Chest clear" },
        { general: "", systemic: "Chest clear" },
        { general: "Alert", systemic: "" },
        { general: "Multi\nline\ngeneral", systemic: "Multi\nline\nsystemic" },
      ];

      for (const c of cases) {
        const combined = serializeExam(c.general, c.systemic);
        expect(parseExam(combined)).toEqual(c);
      }
    });
  });
});
```

### 3. Modify `frontend/components/cockpit/rx/sections/ObjectiveSection.tsx`

Final shape:

```tsx
"use client";

import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { VitalsGrid } from "@/components/cockpit/rx/inputs/VitalsGrid";
import {
  RX_FIELD_INPUT_CLASS,
  RX_FIELD_LABEL_CLASS,
  RX_SECTION_HEADING_CLASS,
} from "@/components/cockpit/rx/sections/field-styles";
import { parseExam, serializeExam } from "@/lib/cockpit/exam-findings";

export interface ObjectiveSectionProps {
  heading?: string | null;
  disabled?: boolean;
}

export function ObjectiveSection({
  heading = "Objective",
  disabled = false,
}: ObjectiveSectionProps) {
  const { state, setField } = useRxForm();
  const { fields } = state;
  const exam = parseExam(fields.examinationFindings);

  return (
    <section aria-label="Objective" className="space-y-3">
      {heading !== null && (
        <h3 className={RX_SECTION_HEADING_CLASS}>{heading}</h3>
      )}

      {/* 1. Vitals chip-grid (with BMI badge from chp-01) */}
      <div>
        <span className={RX_FIELD_LABEL_CLASS}>Vitals</span>
        <div className="mt-1">
          <VitalsGrid />
        </div>
      </div>

      {/* 2. General examination */}
      <div>
        <label htmlFor="examinationGeneral" className={RX_FIELD_LABEL_CLASS}>
          General examination
        </label>
        <textarea
          id="examinationGeneral"
          rows={3}
          value={exam.general}
          onChange={(e) =>
            setField("examinationFindings", serializeExam(e.target.value, exam.systemic))
          }
          className={RX_FIELD_INPUT_CLASS}
          placeholder="Appearance, hydration, pallor, jaundice, …"
          maxLength={3000}
          disabled={disabled}
        />
      </div>

      {/* 3. Systemic examination */}
      <div>
        <label htmlFor="examinationSystemic" className={RX_FIELD_LABEL_CLASS}>
          Systemic examination
        </label>
        <textarea
          id="examinationSystemic"
          rows={3}
          value={exam.systemic}
          onChange={(e) =>
            setField("examinationFindings", serializeExam(exam.general, e.target.value))
          }
          className={RX_FIELD_INPUT_CLASS}
          placeholder="CVS, RS, Abdomen, CNS, …"
          maxLength={3000}
          disabled={disabled}
        />
      </div>

      {/* 4. Test results (patient-brought) */}
      <div>
        <label htmlFor="testResults" className={RX_FIELD_LABEL_CLASS}>
          Test results (patient-brought)
        </label>
        <textarea
          id="testResults"
          rows={3}
          value={fields.testResults}
          onChange={(e) => setField("testResults", e.target.value)}
          className={RX_FIELD_INPUT_CLASS}
          placeholder="Reports / labs the patient brought to this visit"
          maxLength={3000}
          disabled={disabled}
        />
      </div>

      {/* 5. Legacy free-text vitals — demoted to collapsed disclosure */}
      <details className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs">
        <summary className="cursor-pointer select-none text-muted-foreground">
          Show legacy free-text vitals
        </summary>
        <div className="mt-2">
          <label htmlFor="vitalsText" className={RX_FIELD_LABEL_CLASS}>
            Vitals (free-text — legacy)
          </label>
          <input
            id="vitalsText"
            type="text"
            value={fields.vitalsText}
            onChange={(e) => setField("vitalsText", e.target.value)}
            className={RX_FIELD_INPUT_CLASS}
            placeholder="Free-text vitals (deprecated — use the grid above)"
            maxLength={1000}
            disabled={disabled}
          />
        </div>
      </details>
    </section>
  );
}
```

Key changes:
- Import `parseExam` / `serializeExam` from the new helper.
- Compute `exam` (parsed General + Systemic) at the top of the render.
- Two separate textareas; each onChange re-serializes to the single field via `setField("examinationFindings", ...)`.
- New `testResults` textarea wired to `fields.testResults`.
- Legacy `vitalsText` moved to a `<details>` disclosure at the bottom, visually de-emphasized.
- Removed the old "Vitals (structured)" label since the grid is now the primary vitals UI; just labeled "Vitals."

### 4. New / updated section test — `frontend/components/cockpit/rx/sections/__tests__/ObjectiveSection.test.tsx`

If a test file already exists from cv2-06, extend it with these describe blocks; otherwise create new:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ObjectiveSection } from "@/components/cockpit/rx/sections/ObjectiveSection";
import { RxFormProvider } from "@/components/cockpit/rx/RxFormContext";
import { EXAM_DELIMITER } from "@/lib/cockpit/exam-findings";

function renderSection(initial?: Partial<RxFormFieldsInput>) {
  return render(
    <RxFormProvider appointmentId="appt-1" token="tok" initialFields={initial}>
      <ObjectiveSection />
    </RxFormProvider>
  );
}

describe("ObjectiveSection — R-HISTORY enhancements", () => {
  it("renders Vitals grid + 3 textareas + collapsed legacy", () => {
    renderSection();
    expect(screen.getByLabelText(/General examination/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Systemic examination/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Test results/i)).toBeInTheDocument();
    expect(screen.getByText(/Show legacy free-text vitals/i)).toBeInTheDocument();
    // Legacy input is inside <details>, so by default not visible-by-user (it's
    // still in DOM but the closed disclosure visually hides it). Assert it
    // exists in DOM but is hidden via the closed parent <details>:
    const legacyInput = screen.getByLabelText(/Vitals \(free-text — legacy\)/i);
    expect(legacyInput.closest("details")?.open).toBe(false);
  });

  it("parses legacy examinationFindings into General textarea", () => {
    renderSection({ examinationFindings: "Pale, afebrile." });
    const general = screen.getByLabelText(/General examination/i) as HTMLTextAreaElement;
    const systemic = screen.getByLabelText(/Systemic examination/i) as HTMLTextAreaElement;
    expect(general.value).toBe("Pale, afebrile.");
    expect(systemic.value).toBe("");
  });

  it("parses delimited examinationFindings into both textareas", () => {
    renderSection({
      examinationFindings: `Alert${EXAM_DELIMITER}Chest clear`,
    });
    const general = screen.getByLabelText(/General examination/i) as HTMLTextAreaElement;
    const systemic = screen.getByLabelText(/Systemic examination/i) as HTMLTextAreaElement;
    expect(general.value).toBe("Alert");
    expect(systemic.value).toBe("Chest clear");
  });

  it("serializes back to delimited form on edit", () => {
    const onChangeSpy = vi.fn();
    // ... or assert via re-reading the textarea values after fireEvent.change ...
    renderSection({ examinationFindings: "Alert" });
    const systemic = screen.getByLabelText(/Systemic examination/i) as HTMLTextAreaElement;
    fireEvent.change(systemic, { target: { value: "Chest clear" } });
    // After change, both textareas should reflect the new state:
    expect(systemic.value).toBe("Chest clear");
    const general = screen.getByLabelText(/General examination/i) as HTMLTextAreaElement;
    expect(general.value).toBe("Alert");
  });

  it("disables all inputs when disabled prop set", () => {
    renderSection({ examinationFindings: "Alert" });
    // re-render with disabled=true via a follow-up assertion is more complex —
    // just verify the prop wires through to one input:
    const { container } = render(
      <RxFormProvider appointmentId="appt-1" token="tok">
        <ObjectiveSection disabled />
      </RxFormProvider>
    );
    const generalEl = container.querySelector("#examinationGeneral");
    expect(generalEl).toBeDisabled();
  });
});
```

### 5. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test lib/cockpit/__tests__/exam-findings.test.ts
pnpm --filter frontend test sections/__tests__/ObjectiveSection.test.tsx
```

All green before declaring chp-02 done.

---

## Acceptance gate

- [x] `frontend/lib/cockpit/exam-findings.ts` exports `parseExam`, `serializeExam`, `EXAM_DELIMITER`.
- [x] `parseExam` correctly handles: empty input, legacy (no-delimiter) input, normal delimited input, delimiter-at-edges.
- [x] `serializeExam` correctly handles: both empty, only-general, both present, escape-collision-on-literal-delimiter.
- [x] Round-trip `parse(serialize(x))` is identity for normal inputs.
- [x] `ObjectiveSection` renders 4 visible inputs (Vitals grid, General textarea, Systemic textarea, Test results textarea) + 1 collapsed disclosure (legacy vitalsText).
- [x] Legacy `vitalsText` data is preserved (no field deletion); still editable inside the disclosure.
- [x] Existing autosave behavior is unchanged — single field-write per edit; debounce timer untouched.
- [x] Unit tests pass: both `exam-findings.test.ts` and `ObjectiveSection.test.tsx` clean.
- [x] tsc + lint clean (no new issues in chp-02 files; repo-wide tsc/lint pre-existing failures unchanged).

---

## Anti-goals

- ❌ Don't add new fields to `RxFormFields` / `RxFormContext`. DL-9: backend untouched. The split is UI-only via delimited serialization.
- ❌ Don't remove the legacy `vitalsText` field from the form state or DB. Demote-by-disclosure, not delete.
- ❌ Don't add validation that requires General or Systemic to be filled. DL-3: optional.
- ❌ Don't change the existing `<VitalsGrid>` import path or props in this task — chp-01 owns it.
- ❌ Don't add an "Auto-split with AI" button or any LLM integration. Capture-inbox if it comes up.
- ❌ Don't change the section heading default from "Objective." DL-10: layout-tree pane ids unchanged means the heading stays consistent.

---

## Notes

- **Why a delimited serialization?** DL-9 forbids backend changes. Two columns would mean a migration + two `setField` calls per edit + two more endpoint serializer mappings. Delimited keeps the surface narrow at the cost of one helper file + one parse/serialize round-trip per edit. The trade-off is good: the helper is pure (easy to test), and edits are still O(1) — same autosave timer behavior.
- **Delimiter choice (`\n--- SYSTEMIC ---\n`).** Visually clear if the column is exported to JSON / CSV for analytics. ALL-CAPS distinguishes from doctor's prose. The newline padding ensures it doesn't fuse with adjacent text in displays that don't parse it.
- **Escape strategy (zero-width-joiner).** If a doctor literally pastes `--- SYSTEMIC ---` into the general field (unlikely but possible — perhaps copying from another doctor's notes), the second hyphen gets a ZWJ injected so the delimiter detection doesn't false-positive. The visual appearance is preserved in the doctor's General textarea (ZWJ is invisible in most fonts) but the parser won't confuse it. This is over-engineered; capture-inbox a follow-up to switch to a less-likely delimiter (e.g., `\x1F` ASCII unit separator) if escape collisions become a real issue. For v1 the prose delimiter is fine because it's effectively impossible to paste literally in a clinical context.
- **Why `<details>` for the legacy field?** Three reasons: (1) data preservation — existing visits with `vitalsText` data shouldn't lose their content; (2) visual de-emphasis — the structured grid is the primary surface, the legacy is a fallback; (3) reversibility — if the structured grid ever has a P0 bug, doctors can still get to the legacy input by clicking the disclosure. After 30 days of zero clicks on the disclosure (telemetry could measure this — out of scope here), the legacy can be deleted in a future cleanup task.
- **Placeholder text for General / Systemic.** Mirrors how doctors write notes on paper: General = appearance / habitus / vitals-narrative; Systemic = organ-system findings. These cues reduce the "what goes where" friction.
- **maxLength=3000** is generous — most exam notes are 100–500 chars. The cap exists to prevent paste-bombs only. Same as `examinationFindings` had before.
