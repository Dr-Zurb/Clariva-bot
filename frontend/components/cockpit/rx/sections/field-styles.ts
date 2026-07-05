/** Shared input classes — matches legacy PrescriptionForm field styling (cpv-06 tokens). */
export const RX_FIELD_INPUT_CLASS =
  "mt-1 w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-muted/30";

export const RX_FIELD_LABEL_CLASS = "block text-sm font-medium text-foreground/80";

export const RX_SECTION_HEADING_CLASS =
  "text-sm font-semibold uppercase tracking-wide text-muted-foreground";

/** Exam system card title (General, Cardiovascular, …) — CollapsibleContainer parity. */
export const RX_EXAM_SYSTEM_TITLE_CLASS = "text-sm font-medium text-foreground/80";

/** IPPA subsection + exam notes group labels inside a system card. */
export const RX_EXAM_SUBSECTION_HEADING_CLASS =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80";

/** System-level free-text row at the bottom of an exam card (General, CVS, Resp, …). */
export const RX_EXAM_ADDITIONAL_NOTES_LABEL = "Additional notes";

/** In-card field, chip-group, notes, and finding-row labels (Position, Palpation, Notes, …). */
export const RX_EXAM_FIELD_LABEL_CLASS = "text-xs font-medium text-foreground/80";

/** Block layout for exam in-card `<label>` elements. */
export const RX_EXAM_FIELD_LABEL_BLOCK_CLASS = "block text-xs font-medium text-foreground/80";

/** @deprecated Use {@link RX_EXAM_FIELD_LABEL_CLASS} — kept for transitional imports. */
export const RX_EXAM_FINDING_TITLE_CLASS = RX_EXAM_FIELD_LABEL_CLASS;

export const RX_CV207_STUB_CLASS =
  "rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-3 text-xs text-muted-foreground";
