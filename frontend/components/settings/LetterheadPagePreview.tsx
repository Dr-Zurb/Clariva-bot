"use client";

import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { PatientRxIdentityBlock } from "@/components/ehr/PatientRxIdentityBlock";
import { layoutInvestigationsForRx } from "@/lib/cockpit/investigations-rx-layout";
import {
  letterheadBuiltinBackgroundUrl,
  letterheadHeading,
  letterheadImageFitClass,
  letterheadTypePx,
  logoSizePx,
  mmToPreviewPx,
  type LetterheadBackgroundPreset,
  type LetterheadImageFit,
  type LetterheadLogoSize,
  type LetterheadTextSize,
  type PatientIdentityPreset,
} from "@/lib/letterhead-heading";
import { RX_INSTRUCTION_MARKER } from "@/lib/cockpit/rx-instruction-marker";

export type LetterheadPreset = "classic" | "centred" | "preprinted" | "banner";
export type LetterheadPageSize = "a4" | "a5";

export interface LetterheadPagePreviewModel {
  doctorName: string;
  qualifications: string;
  specialty?: string | null;
  clinicName: string;
  clinicAddress: string;
  logoUrl: string | null;
  headerUrl?: string | null;
  footerUrl?: string | null;
  headerHeightMm?: number;
  footerHeightMm?: number;
  preset: LetterheadPreset;
  pageSize: LetterheadPageSize;
  accentColor: string;
  chromeColor?: string;
  patientColor?: string;
  preprintMarginTopMm: number;
  preprintMarginBottomMm: number;
  pageMarginTopMm?: number;
  pageMarginRightMm?: number;
  pageMarginBottomMm?: number;
  pageMarginLeftMm?: number;
  logoSize?: LetterheadLogoSize;
  patientIdentityPreset?: PatientIdentityPreset;
  showPatientPhone?: boolean;
  showPatientGuardian?: boolean;
  showPatientMrn?: boolean;
  showPatientAddress?: boolean;
  footerLine?: string | null;
  hideHaloCredit?: boolean;
  backgroundUrl?: string | null;
  backgroundPreset?: LetterheadBackgroundPreset;
  backgroundOpacity?: number;
  headerFit?: LetterheadImageFit;
  footerFit?: LetterheadImageFit;
  backgroundFit?: LetterheadImageFit;
  headerTextSize?: LetterheadTextSize;
  patientTextSize?: LetterheadTextSize;
  bodyTextSize?: LetterheadTextSize;
  registrationNumber?: string | null;
  /** When set, the page shows this visit instead of the settings sample. */
  rx?: LetterheadPreviewRx;
}

export interface LetterheadPreviewMedicine {
  name: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  instructions?: string;
}

export interface LetterheadPreviewRx {
  patientName: string;
  patientAge?: string | null;
  patientGender?: string | null;
  visitDateLabel?: string | null;
  patientPhone?: string | null;
  guardianName?: string | null;
  guardianRelation?: string | null;
  address?: string | null;
  medicalRecordNumber?: string | null;
  cc?: string | null;
  hopi?: string | null;
  socialHistory?: string | null;
  diagnosis?: string | null;
  investigations?: string | null;
  advice?: string | null;
  followUp?: string | null;
  referral?: string | null;
  customSubsections?: LetterheadPreviewCustomSection[];
  assessmentCustomSections?: LetterheadPreviewCustomSection[];
  planCustomSections?: LetterheadPreviewCustomSection[];
  medicines?: LetterheadPreviewMedicine[];
}

export interface LetterheadPreviewCustomSection {
  title: string;
  body: string | null;
  children: Array<{ title: string; body: string | null }>;
}

export const A4_PX = { width: 794, height: 1123 };
export const A5_PX = { width: 559, height: 794 };

export function letterheadPagePx(pageSize: LetterheadPageSize): {
  width: number;
  height: number;
} {
  return pageSize === "a5" ? A5_PX : A4_PX;
}

export const PAGE_STACK_GAP_PX = 16;
/** Leave air above the footer so a medicine + notes is never clipped. */
export const PAGE_PACK_SLACK_PX = 28;

export function previewPackBudgets(
  inner: number,
  chromePage1: number,
  footerH: number,
  slack = PAGE_PACK_SLACK_PX,
): { page1: number; later: number } {
  return {
    page1: Math.max(1, inner - chromePage1 - footerH - slack),
    later: Math.max(1, inner - footerH - slack),
  };
}

/** Greedy pack: fill the current sheet, then start another. */
export function packPreviewBlocks(
  heights: number[],
  page1Budget: number,
  laterBudget: number,
): number[][] {
  const first = Math.max(1, page1Budget);
  const later = Math.max(1, laterBudget);
  const pages: number[][] = [[]];
  let budget = first;
  let used = 0;
  heights.forEach((raw, index) => {
    const height = Math.max(0, raw);
    if (pages[pages.length - 1].length > 0 && used + height > budget) {
      pages.push([]);
      budget = later;
      used = 0;
    }
    pages[pages.length - 1].push(index);
    used += height;
  });
  return pages;
}

/** If a painted sheet clipped, move its last block to the next sheet. */
export function shiftOverflowingPreviewPages(
  pages: number[][],
  overflowing: boolean[],
): number[][] {
  const next = pages.map((page) => [...page]);
  overflowing.forEach((over, i) => {
    if (!over) return;
    const page = next[i];
    if (!page || page.length <= 1) return;
    const last = page.pop()!;
    if (!next[i + 1]) next.push([]);
    next[i + 1].unshift(last);
  });
  return next;
}

function previewPagesEqual(a: number[][], b: number[][]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (page, i) =>
        page.length === b[i]!.length && page.every((idx, j) => idx === b[i]![j]),
    )
  );
}

const PAGE_HEIGHT_MM = { a4: 297, a5: 210 } as const;
const DEFAULT_ACCENT = "#000000";

const SAMPLE = {
  patientName: "Sample patient",
  patientAge: "50 y",
  patientGender: "male",
  visitDateLabel: "24 Aug 2026",
  patientPhone: "98765 43210",
  guardianName: "Minder Singh",
  guardianRelation: "father",
  address: "Buter Kalan, Amritsar",
  medicalRecordNumber: "P-00042",
  cc: "Fever and cough for 3 days.",
  diagnosis: "Viral upper respiratory infection",
  medicine: {
    name: "Paracetamol 500 mg",
    dose: "1 tab",
    route: "Oral",
    frequency: "Thrice daily",
    duration: "3 days",
  },
  advice: "Rest, fluids, and paracetamol for fever. Return if breathing worsens.",
  followUp: "After 5 days if not improving.",
};

function resolveAccent(raw: string): string {
  return /^#[0-9A-Fa-f]{6}$/.test(raw.trim()) ? raw.trim() : DEFAULT_ACCENT;
}

const THUMB_WIDTH_PX = 156;

function usePageScale(
  page: { width: number; height: number },
  variant: "thumb" | "dialog",
): number {
  const [scale, setScale] = useState(THUMB_WIDTH_PX / page.width);
  useEffect(() => {
    if (variant === "thumb") {
      setScale(THUMB_WIDTH_PX / page.width);
      return;
    }
    function fit() {
      const maxW = Math.min(window.innerWidth * 0.86, 720);
      const maxH = window.innerHeight * 0.72;
      setScale(Math.min(maxW / page.width, maxH / page.height));
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [variant, page.width, page.height]);
  return scale;
}

function Identity({
  model,
  align,
}: {
  model: LetterheadPagePreviewModel;
  align: "left" | "center" | "right";
}) {
  const alignClass =
    align === "center"
      ? "text-center"
      : align === "right"
        ? "text-right"
        : "text-left";
  const title = letterheadHeading(model.doctorName, model.clinicName);
  const chrome = resolveAccent(model.chromeColor ?? model.accentColor);
  const titlePx = letterheadTypePx("headerTitle", model.headerTextSize);
  const metaPx = letterheadTypePx("headerMeta", model.headerTextSize);
  return (
    <div className={alignClass}>
      <div className="font-bold leading-tight" style={{ color: chrome, fontSize: titlePx }}>
        {title}
      </div>
      {model.qualifications.trim() ? (
        <div style={{ color: chrome, fontSize: metaPx }}>{model.qualifications}</div>
      ) : null}
      {model.specialty?.trim() ? (
        <div style={{ color: chrome, fontSize: metaPx }}>{model.specialty}</div>
      ) : null}
      <div style={{ color: chrome, fontSize: metaPx }}>
        {model.registrationNumber?.trim()
          ? `Reg. No.: ${model.registrationNumber.trim()}`
          : "Registration number appears after verification"}
      </div>
      {model.clinicAddress.trim() ? (
        <div className="mt-1 whitespace-pre-wrap" style={{ color: chrome, fontSize: metaPx }}>
          {model.clinicAddress}
        </div>
      ) : null}
    </div>
  );
}

function bandHeightPx(
  mm: number,
  pageSize: LetterheadPageSize,
): number {
  const pageMm = PAGE_HEIGHT_MM[pageSize];
  return (mm / pageMm) * letterheadPagePx(pageSize).height;
}

function Header({ model }: { model: LetterheadPagePreviewModel }) {
  const showLogo = Boolean(model.logoUrl);

  if (model.preset === "preprinted") return null;

  if (model.preset === "banner") {
    if (model.headerUrl) {
      const heightPx = bandHeightPx(model.headerHeightMm ?? 35, model.pageSize);
      return (
        <header className="mb-3 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={model.headerUrl}
            alt=""
            className={`w-full ${letterheadImageFitClass(model.headerFit ?? "stretch")}`}
            style={{ height: heightPx }}
          />
        </header>
      );
    }
  }

  if (model.preset === "centred") {
    return (
      <header className="mb-3 flex flex-col items-center gap-1.5 border-b border-black pb-2.5">
        {showLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={model.logoUrl ?? undefined}
            alt=""
            className="object-contain"
            style={{
              width: logoSizePx(model.logoSize),
              height: logoSizePx(model.logoSize),
            }}
          />
        ) : null}
        <Identity model={model} align="center" />
      </header>
    );
  }

  return (
    <header className="mb-3 flex items-start justify-between gap-4 border-b border-black pb-2.5">
      {showLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={model.logoUrl ?? undefined}
          alt=""
            className="shrink-0 object-contain"
            style={{
              width: logoSizePx(model.logoSize),
              height: logoSizePx(model.logoSize),
            }}
        />
      ) : (
        <span />
      )}
      <Identity model={model} align="right" />
    </header>
  );
}

function previewFields(model: LetterheadPagePreviewModel) {
  const rx = model.rx;
  return {
    live: Boolean(rx),
    rx,
    fields: rx ?? {
      patientName: SAMPLE.patientName,
      patientAge: SAMPLE.patientAge,
      patientGender: SAMPLE.patientGender,
      visitDateLabel: SAMPLE.visitDateLabel,
      patientPhone: SAMPLE.patientPhone,
      guardianName: SAMPLE.guardianName,
      guardianRelation: SAMPLE.guardianRelation,
      address: SAMPLE.address,
      medicalRecordNumber: SAMPLE.medicalRecordNumber,
      cc: SAMPLE.cc,
      diagnosis: SAMPLE.diagnosis,
      advice: SAMPLE.advice,
      followUp: SAMPLE.followUp,
    },
    medicines: rx
      ? (rx.medicines ?? [])
      : [
          {
            name: SAMPLE.medicine.name,
            dose: SAMPLE.medicine.dose,
            route: SAMPLE.medicine.route,
            frequency: SAMPLE.medicine.frequency,
            duration: SAMPLE.medicine.duration,
          },
        ],
  };
}

function PatientIdentity({
  model,
}: {
  model: LetterheadPagePreviewModel;
}) {
  const { fields } = previewFields(model);
  return (
    <PatientRxIdentityBlock
      compact
      textSize={model.patientTextSize}
      textColor={resolveAccent(model.patientColor ?? model.accentColor)}
      preset={model.patientIdentityPreset ?? "open_letter"}
      showPhone={model.showPatientPhone !== false}
      showGuardian={model.showPatientGuardian !== false}
      showMrn={model.showPatientMrn !== false}
      showAddress={model.showPatientAddress !== false}
      fields={{
        patientName: fields.patientName,
        patientAge: fields.patientAge,
        patientGender: fields.patientGender,
        visitDateLabel: fields.visitDateLabel,
        patientPhone: fields.patientPhone,
        guardianName: fields.guardianName,
        guardianRelation: fields.guardianRelation,
        address: fields.address,
        medicalRecordNumber: fields.medicalRecordNumber,
      }}
    />
  );
}

function sectionBlock(
  label: string,
  body: string | null | undefined,
  labelStyle: { color: string; fontSize: number },
  bodyStyle: { fontSize: number; lineHeight?: number },
) {
  if (!body?.trim()) return null;
  return (
    <section className="mb-3">
      <h3 className="font-semibold uppercase tracking-wide" style={labelStyle}>
        {label}
      </h3>
      <p className="mt-0.5 text-[#0F172A]" style={bodyStyle}>
        {body.trim()}
      </p>
    </section>
  );
}

function customSectionBlocks(
  sections: LetterheadPreviewCustomSection[] | undefined,
  labelStyle: { color: string; fontSize: number },
  bodyStyle: { fontSize: number; lineHeight?: number },
): ReactNode[] {
  if (!sections?.length) return [];
  return sections.map((section, i) => (
    <section key={`custom-${i}-${section.title}`} className="mb-3">
      {section.title ? (
        <h3 className="font-semibold uppercase tracking-wide" style={labelStyle}>
          {section.title}
        </h3>
      ) : null}
      {section.body ? (
        <p className="mt-0.5 text-[#0F172A]" style={bodyStyle}>
          {section.body}
        </p>
      ) : null}
      {section.children.map((child, j) => (
        <div key={`${i}-${j}-${child.title}`} className="mt-1 ml-3">
          <h3 className="font-semibold uppercase tracking-wide" style={labelStyle}>
            {child.title}
          </h3>
          {child.body ? (
            <p className="mt-0.5 text-[#0F172A]" style={bodyStyle}>
              {child.body}
            </p>
          ) : null}
        </div>
      ))}
    </section>
  ));
}

function investigationTick(
  item: string,
  i: number,
  bodyStyle: { fontSize: number; lineHeight?: number },
) {
  return (
    <div key={`${i}-${item}`} className="flex items-start gap-1.5">
      <span
        aria-hidden
        className="mt-[3px] h-2.5 w-2.5 shrink-0 border border-[#0F172A]"
      />
      <span className="text-[#0F172A]" style={bodyStyle}>
        {item}
      </span>
    </div>
  );
}

function investigationsBlocks(
  body: string | null | undefined,
  labelStyle: { color: string; fontSize: number },
  bodyStyle: { fontSize: number; lineHeight?: number },
): ReactNode[] {
  const layout = layoutInvestigationsForRx(body);
  if (!layout) return [];
  if (layout.kind === "paragraph") {
    return [
      <section key="inv-start" data-inv-start className="mb-3">
        <h3 className="font-semibold uppercase tracking-wide" style={labelStyle}>
          Investigations
        </h3>
        <p className="mt-0.5 text-[#0F172A]" style={bodyStyle}>
          {layout.text}
        </p>
      </section>,
    ];
  }
  const rows: string[][] = [];
  for (let i = 0; i < layout.items.length; i += 2) {
    rows.push(layout.items.slice(i, i + 2));
  }
  const nodes: ReactNode[] = [
    <section key="inv-start" data-inv-start className="mb-3">
      <h3 className="font-semibold uppercase tracking-wide" style={labelStyle}>
        Investigations
      </h3>
      {rows[0] ? (
        <div className="mt-0.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
          {rows[0].map((item, i) => investigationTick(item, i, bodyStyle))}
        </div>
      ) : null}
    </section>,
  ];
  rows.slice(1).forEach((row, i) => {
    nodes.push(
      <div
        key={`inv-row-${i + 1}`}
        className="grid grid-cols-2 gap-x-3 gap-y-0.5"
      >
        {row.map((item, j) =>
          investigationTick(item, (i + 1) * 2 + j, bodyStyle),
        )}
      </div>,
    );
  });
  if (layout.note) {
    nodes.push(
      <p key="inv-note" className="mb-3 mt-1.5 text-[#0F172A]" style={bodyStyle}>
        {layout.note}
      </p>,
    );
  }
  return nodes;
}

/** Same % as the PDF `medCell*` widths so split header/body tables line up. */
export const RX_COL_WIDTHS = ["6%", "30%", "14%", "12%", "18%", "20%"] as const;

function RxColGroup() {
  return (
    <colgroup>
      {RX_COL_WIDTHS.map((width, i) => (
        <col key={i} style={{ width }} />
      ))}
    </colgroup>
  );
}

function RxTableHead({
  labelPx,
  bodyStyle,
}: {
  labelPx: number;
  bodyStyle: { fontSize: number; lineHeight?: number };
}) {
  return (
    <table
      className="mt-1.5 w-full table-fixed border-collapse"
      style={bodyStyle}
    >
      <RxColGroup />
      <thead>
        <tr
          className="bg-[#F8FAFC] text-left uppercase tracking-wide text-[#64748B]"
          style={{ fontSize: labelPx }}
        >
          <th className="border-b border-[#E2E8F0] px-1.5 py-1 font-semibold">#</th>
          <th className="border-b border-[#E2E8F0] px-1.5 py-1 font-semibold">
            Medicine
          </th>
          <th className="border-b border-[#E2E8F0] px-1.5 py-1 font-semibold">Dose</th>
          <th className="border-b border-[#E2E8F0] px-1.5 py-1 font-semibold">Route</th>
          <th className="border-b border-[#E2E8F0] px-1.5 py-1 font-semibold">
            Frequency
          </th>
          <th className="border-b border-[#E2E8F0] px-1.5 py-1 font-semibold">
            Duration
          </th>
        </tr>
      </thead>
    </table>
  );
}

function RxMedicineRows({
  medicines,
  start,
  end,
  labelPx,
  bodyStyle,
}: {
  medicines: LetterheadPreviewMedicine[];
  start: number;
  end: number;
  labelPx: number;
  bodyStyle: { fontSize: number; lineHeight?: number };
}) {
  return (
    <table className="w-full table-fixed border-collapse" style={bodyStyle}>
      <RxColGroup />
      <tbody>
        {medicines.slice(start, end).map((med, offset) => {
          const i = start + offset;
          return (
            <tr key={`${i}-${med.name}`} className="align-top">
              <td className="border-b border-[#F1F5F9] px-1.5 py-1.5 text-[#64748B]">
                {i + 1}
              </td>
              <td className="min-w-0 break-words border-b border-[#F1F5F9] px-1.5 py-1.5">
                <div className="font-medium">{med.name}</div>
                {med.instructions?.trim() ? (
                  <div
                    className="mt-0.5 italic text-[#64748B]"
                    style={{ fontSize: labelPx }}
                  >
                    {RX_INSTRUCTION_MARKER} {med.instructions.trim()}
                  </div>
                ) : null}
              </td>
              <td className="min-w-0 break-words border-b border-[#F1F5F9] px-1.5 py-1.5">
                {med.dose}
              </td>
              <td className="min-w-0 break-words border-b border-[#F1F5F9] px-1.5 py-1.5">
                {med.route}
              </td>
              <td className="min-w-0 break-words border-b border-[#F1F5F9] px-1.5 py-1.5">
                {med.frequency}
              </td>
              <td className="min-w-0 break-words border-b border-[#F1F5F9] px-1.5 py-1.5">
                {med.duration}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function buildPreviewBlocks(
  model: LetterheadPagePreviewModel,
  accent: string,
): ReactNode[] {
  const labelPx = letterheadTypePx("bodyLabel", model.bodyTextSize);
  const bodyPx = letterheadTypePx("bodyText", model.bodyTextSize);
  const labelStyle = { color: accent, fontSize: labelPx };
  const bodyStyle = { fontSize: bodyPx, lineHeight: 1.35 };
  const { live, rx, fields, medicines } = previewFields(model);
  const blocks: React.ReactNode[] = [];

  const pushSection = (label: string, body: string | null | undefined) => {
    const node = sectionBlock(label, body, labelStyle, bodyStyle);
    if (node) blocks.push(node);
  };

  pushSection("Chief complaint", fields.cc);
  pushSection("History of present illness", live ? rx?.hopi : null);
  pushSection("Social history", live ? rx?.socialHistory : null);
  blocks.push(...customSectionBlocks(live ? rx?.customSubsections : undefined, labelStyle, bodyStyle));
  pushSection("Provisional diagnosis", fields.diagnosis);
  blocks.push(
    ...customSectionBlocks(
      live ? rx?.assessmentCustomSections : undefined,
      labelStyle,
      bodyStyle,
    ),
  );
  blocks.push(
    ...investigationsBlocks(
      live ? rx?.investigations : null,
      labelStyle,
      bodyStyle,
    ),
  );

  if (medicines.length === 0) {
    blocks.push(
      <div key="rx-empty">
        <h3 className="font-semibold uppercase tracking-wide" style={labelStyle}>
          Rx
        </h3>
        <p className="mt-0.5 italic text-[#64748B]" style={bodyStyle}>
          No medicines prescribed.
        </p>
      </div>,
    );
  } else {
    blocks.push(
      <div key="rx-start" data-rx-start>
        <h3 className="font-semibold uppercase tracking-wide" style={labelStyle}>
          Rx
        </h3>
        <RxTableHead labelPx={labelPx} bodyStyle={bodyStyle} />
        <RxMedicineRows
          medicines={medicines}
          start={0}
          end={1}
          labelPx={labelPx}
          bodyStyle={bodyStyle}
        />
      </div>,
    );
    medicines.slice(1).forEach((_, offset) => {
      const i = offset + 1;
      blocks.push(
        <RxMedicineRows
          key={`rx-row-${i}`}
          medicines={medicines}
          start={i}
          end={i + 1}
          labelPx={labelPx}
          bodyStyle={bodyStyle}
        />,
      );
    });
  }

  pushSection("Advice", fields.advice);
  pushSection("Follow-up", fields.followUp);
  pushSection("Referral", live ? rx?.referral : null);
  blocks.push(
    ...customSectionBlocks(live ? rx?.planCustomSections : undefined, labelStyle, bodyStyle),
  );
  return blocks;
}

function Footer({
  model,
  pageNumber = 1,
  pageCount = 1,
}: {
  model: LetterheadPagePreviewModel;
  pageNumber?: number;
  pageCount?: number;
}) {
  const chrome = resolveAccent(model.chromeColor ?? model.accentColor);
  const showBanner =
    model.preset === "banner" && Boolean(model.footerUrl);
  const heightPx = bandHeightPx(model.footerHeightMm ?? 20, model.pageSize);
  return (
    <footer className="mt-auto border-t border-black pt-3">
      {showBanner ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={model.footerUrl ?? undefined}
          alt=""
          className={`mb-2 w-full ${letterheadImageFitClass(model.footerFit ?? "stretch")}`}
          style={{ height: heightPx }}
        />
      ) : null}
      {model.footerLine?.trim() ? (
        <div
          className="mb-1"
          style={{
            color: chrome,
            fontSize: letterheadTypePx("headerMeta", model.headerTextSize),
          }}
        >
          {model.footerLine.trim()}
        </div>
      ) : null}
      <div className="text-[7px] text-[#64748B]">
        Electronically generated — does not require signature
      </div>
      <div className="mt-2 flex items-center justify-between text-[8px] text-[#64748B]">
        <span>
          {model.hideHaloCredit
            ? "Rx-ID …PREVIEW"
            : "Generated by Halo Aid on 24 Aug 2026 · Rx-ID …PREVIEW"}
        </span>
        <span>
          Page {pageNumber} of {pageCount}
        </span>
      </div>
    </footer>
  );
}

function pagePadding(model: LetterheadPagePreviewModel, isPreprinted: boolean): string | undefined {
  if (isPreprinted) return undefined;
  return `${mmToPreviewPx(model.pageMarginTopMm ?? 12)}px ${mmToPreviewPx(model.pageMarginRightMm ?? 12)}px ${Math.max(mmToPreviewPx(model.pageMarginBottomMm ?? 12), 56)}px ${mmToPreviewPx(model.pageMarginLeftMm ?? 12)}px`;
}

function PreviewSheet({
  model,
  page,
  scale,
  pageIndex,
  pageCount,
  showHeader,
  body,
  backgroundUrl,
  backgroundOpacity,
  bodyRef,
}: {
  model: LetterheadPagePreviewModel;
  page: { width: number; height: number };
  scale: number;
  pageIndex: number;
  pageCount: number;
  showHeader: boolean;
  body: ReactNode;
  backgroundUrl: string | null;
  backgroundOpacity: number;
  bodyRef?: (el: HTMLDivElement | null) => void;
}) {
  const isPreprinted = model.preset === "preprinted";
  const topMm = Math.min(80, Math.max(0, model.preprintMarginTopMm));
  const bottomMm = Math.min(80, Math.max(0, model.preprintMarginBottomMm));
  const pageHeightMm = PAGE_HEIGHT_MM[model.pageSize];
  const sizeLabel = model.pageSize === "a5" ? "A5" : "A4";
  const label =
    pageCount > 1
      ? `${sizeLabel} prescription preview, page ${pageIndex + 1} of ${pageCount}`
      : `${sizeLabel} prescription preview`;

  return (
    <div
      className="relative overflow-hidden bg-white"
      style={{ width: page.width * scale, height: page.height * scale }}
      data-testid="letterhead-preview-page"
      data-page={pageIndex + 1}
    >
      <article
        aria-label={label}
        className="pointer-events-none absolute left-0 top-0 flex flex-col bg-white text-[#0F172A] shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
        style={{
          width: page.width,
          height: page.height,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          padding: pagePadding(model, isPreprinted),
          fontFamily: "Helvetica, Arial, sans-serif",
        }}
      >
        {backgroundUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={backgroundUrl}
            alt=""
            className={`pointer-events-none absolute inset-0 h-full w-full ${letterheadImageFitClass(model.backgroundFit ?? "fill")}`}
            style={{ opacity: backgroundOpacity }}
          />
        ) : null}
        {isPreprinted ? (
          <>
            {showHeader ? (
              <div
                className="flex items-center justify-center border-b border-dashed border-[#CBD5E1] bg-[#F8FAFC] text-[10px] text-[#64748B]"
                style={{ height: `${(topMm / pageHeightMm) * 100}%` }}
              >
                Your printed letterhead ({topMm} mm)
              </div>
            ) : null}
            <div
              ref={bodyRef}
              data-preview-body
              className="flex min-h-0 flex-1 flex-col overflow-hidden px-12 py-4"
            >
              {showHeader ? <PatientIdentity model={model} /> : null}
              {body}
            </div>
            <div
              className="flex items-center justify-center border-t border-dashed border-[#CBD5E1] bg-[#F8FAFC] text-[10px] text-[#64748B]"
              style={{ height: `${(bottomMm / pageHeightMm) * 100}%` }}
            >
              Your printed footer ({bottomMm} mm)
            </div>
          </>
        ) : (
          <>
            {showHeader ? (
              <>
                <Header model={model} />
                <PatientIdentity model={model} />
              </>
            ) : null}
            <div
              ref={bodyRef}
              data-preview-body
              className="min-h-0 flex-1 overflow-hidden"
            >
              {body}
            </div>
            <Footer model={model} pageNumber={pageIndex + 1} pageCount={pageCount} />
          </>
        )}
      </article>
    </div>
  );
}

export function LetterheadPagePreview({
  model,
  variant = "dialog",
  scale: scaleOverride,
  onPageCountChange,
}: {
  model: LetterheadPagePreviewModel;
  variant?: "thumb" | "dialog";
  scale?: number;
  onPageCountChange?: (count: number) => void;
}) {
  const page = letterheadPagePx(model.pageSize);
  const autoScale = usePageScale(page, variant);
  const scale = scaleOverride ?? autoScale;
  const accent = resolveAccent(model.accentColor);
  const isPreprinted = model.preset === "preprinted";
  const paginate = variant !== "thumb";
  const backgroundUrl =
    model.preset === "preprinted"
      ? null
      : model.backgroundPreset === "upload"
        ? model.backgroundUrl ?? null
        : letterheadBuiltinBackgroundUrl(model.backgroundPreset);
  const backgroundOpacity =
    Math.min(40, Math.max(0, model.backgroundOpacity ?? 15)) / 100;
  const blocks = useMemo(() => buildPreviewBlocks(model, accent), [model, accent]);
  const [pages, setPages] = useState<number[][]>([blocks.map((_, i) => i)]);
  const [hideMeasure, setHideMeasure] = useState(false);
  const measureRef = useRef<HTMLDivElement>(null);
  const bodyRefs = useRef<Array<HTMLDivElement | null>>([]);

  useLayoutEffect(() => {
    setHideMeasure(false);
  }, [
    paginate,
    blocks,
    isPreprinted,
    model.pageMarginTopMm,
    model.pageMarginBottomMm,
    model.headerUrl,
    model.footerUrl,
    model.headerHeightMm,
    model.footerHeightMm,
    page.height,
  ]);

  useLayoutEffect(() => {
    if (!paginate) {
      setPages([blocks.map((_, i) => i)]);
      setHideMeasure(true);
      return;
    }
    if (hideMeasure) return;
    const root = measureRef.current;
    if (!root) return;
    const chromePage1 =
      (root.querySelector("[data-preview-chrome='page1']") as HTMLElement | null)
        ?.offsetHeight ?? 0;
    const measuredFooter =
      (root.querySelector("[data-preview-chrome='footer']") as HTMLElement | null)
        ?.offsetHeight ?? 0;
    const reservedFooterBanner =
      !isPreprinted && model.preset === "banner" && model.footerUrl
        ? bandHeightPx(model.footerHeightMm ?? 20, model.pageSize)
        : 0;
    const footerH = Math.max(measuredFooter, reservedFooterBanner);
    const padY = isPreprinted
      ? 32
      : mmToPreviewPx(model.pageMarginTopMm ?? 12) +
        Math.max(mmToPreviewPx(model.pageMarginBottomMm ?? 12), 56);
    const inner = Math.max(1, page.height - padY);
    const { page1, later } = previewPackBudgets(inner, chromePage1, footerH);
    const heights = Array.from(
      root.querySelectorAll<HTMLElement>("[data-preview-block]"),
    ).map((el) => Math.max(el.offsetHeight, el.scrollHeight));
    setPages(packPreviewBlocks(heights, page1, later));
    setHideMeasure(true);
  }, [
    hideMeasure,
    paginate,
    blocks,
    isPreprinted,
    model.pageMarginTopMm,
    model.pageMarginBottomMm,
    model.headerUrl,
    model.footerUrl,
    model.headerHeightMm,
    model.footerHeightMm,
    model.preset,
    model.pageSize,
    page.height,
  ]);

  const pageCount = paginate ? pages.length : 1;

  useLayoutEffect(() => {
    if (!paginate || !hideMeasure) return;
    const overflowing = pages.map((_, i) => {
      const el = bodyRefs.current[i];
      if (!el || el.clientHeight <= 0) return false;
      return el.scrollHeight > el.clientHeight + 1;
    });
    const next = shiftOverflowingPreviewPages(pages, overflowing);
    if (!previewPagesEqual(pages, next)) setPages(next);
  }, [paginate, hideMeasure, pages]);

  useEffect(() => {
    onPageCountChange?.(pageCount);
  }, [onPageCountChange, pageCount]);

  const sheet = (pageIndex: number, indices: number[]) => (
    <PreviewSheet
      key={pageIndex}
      model={model}
      page={page}
      scale={scale}
      pageIndex={pageIndex}
      pageCount={pageCount}
      showHeader={pageIndex === 0}
      backgroundUrl={backgroundUrl}
      backgroundOpacity={backgroundOpacity}
      bodyRef={(el) => {
        bodyRefs.current[pageIndex] = el;
      }}
      body={
        <>
          {indices.map((i) => (
            <Fragment key={i}>{blocks[i]}</Fragment>
          ))}
        </>
      }
    />
  );

  if (!paginate) {
    return sheet(0, blocks.map((_, i) => i));
  }

  return (
    <div
      className="flex flex-col"
      style={{ gap: PAGE_STACK_GAP_PX }}
      data-testid="letterhead-preview-stack"
    >
      {hideMeasure ? null : (
        <div
          ref={measureRef}
          aria-hidden
          className="pointer-events-none absolute left-0 top-0"
          style={{
            width: page.width,
            padding: pagePadding(model, isPreprinted),
            fontFamily: "Helvetica, Arial, sans-serif",
          }}
        >
          <div data-preview-chrome="page1">
            {isPreprinted ? (
              <div
                style={{
                  height:
                    (Math.min(80, Math.max(0, model.preprintMarginTopMm)) /
                      PAGE_HEIGHT_MM[model.pageSize]) *
                    page.height,
                }}
              />
            ) : (
              <Header model={model} />
            )}
            <PatientIdentity model={model} />
          </div>
          {blocks.map((node, i) => (
            <div key={i} data-preview-block>
              {node}
            </div>
          ))}
          <div data-preview-chrome="footer">
            {isPreprinted ? (
              <div
                style={{
                  height:
                    (Math.min(80, Math.max(0, model.preprintMarginBottomMm)) /
                      PAGE_HEIGHT_MM[model.pageSize]) *
                    page.height,
                }}
              />
            ) : (
              <Footer model={model} />
            )}
          </div>
        </div>
      )}
      {pages.map((indices, pageIndex) => sheet(pageIndex, indices))}
    </div>
  );
}
