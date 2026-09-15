/**
 * Root @react-pdf/renderer component for the prescription PDF
 * (EHR Sub-batch B2 / T3.15 + plan-p1).
 *
 * Page layout:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Header (logo + doctor + clinic)                              │  ← page 1 only
 *   ├──────────────────────────────────────────────────────────────┤
 *   │ Patient strip (name · age · gender · visit date)             │  ← page 1 only
 *   ├──────────────────────────────────────────────────────────────┤
 *   │ Sections: CC, HOPI, Dx, Investigations                       │  ← flows
 *   ├──────────────────────────────────────────────────────────────┤
 *   │ Rx — medicine table (multi-row, may flow)                    │  ← flows
 *   ├──────────────────────────────────────────────────────────────┤
 *   │ Advice · Education · Follow-up · Referral (plan-p1)          │  ← flows
 *   ├──────────────────────────────────────────────────────────────┤
 *   │ Footer (signature line + Halo Aid attribution + Rx-ID + page) │  ← REPEATS per page
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Clinical notes are doctor-private and are NOT rendered on the patient PDF
 * (plan-p1 / ASMT-D5 clinical_notes privacy precedent).
 *
 * Skipped-section convention: empty/null bodies render NOTHING
 * (omitted entirely) — see SectionBlock.tsx.
 */

import * as React from 'react';
import { Document, Page, View, Text, Image } from '@react-pdf/renderer';
import { letterheadImageFitCss, letterheadTypePt, type LetterheadTextSize } from '../../types/letterhead';
import { mmToPt, resolvePdfAccent, styles } from './styles';
import { Header } from './Header';
import { Footer } from './Footer';
import { PatientBlock } from './PatientBlock';
import { MedicineTable } from './MedicineTable';
import { SectionBlock } from './SectionBlock';
import { InvestigationsBlock } from './InvestigationsBlock';
import type { PrescriptionPdfData, PrescriptionPdfHeaderData } from './types';
import type { OutputCustomSubsection } from '../../utils/custom-subsections';

/** One-line issuer for the preprinted preset (Header is hidden). */
export function formatPreprintedIssuerLine(
  header: PrescriptionPdfHeaderData,
): string | null {
  const bits: string[] = [];
  const name = header.doctorName?.trim() ?? '';
  if (name && name !== 'Doctor') bits.push(name);
  if (header.qualifications?.trim()) bits.push(header.qualifications.trim());
  if (header.specialty?.trim()) bits.push(header.specialty.trim());
  if (header.registrationNumber?.trim()) {
    bits.push(`Reg. No.: ${header.registrationNumber.trim()}`);
  }
  return bits.length > 0 ? bits.join(' · ') : null;
}

interface PrescriptionDocumentProps {
  data: PrescriptionPdfData;
}

/**
 * Doctor-defined custom subsections (subj-22). Additive, separate block —
 * never merged into hopi. The array arrives already sanitised + empty-omitted
 * from the composer, so we render verbatim and skip the whole block when none
 * survive. Order: section title → body → (child title → body)*.
 *
 * Implemented as a node-returning helper (not a component) so the elements
 * live directly in the document tree — keeps it trivially walkable in the
 * synthesised-payload unit tests, matching the SectionBlock approach.
 */
export function renderCustomSubsections(
  sections: OutputCustomSubsection[] | undefined,
  accentColor?: string | null,
  textSize?: LetterheadTextSize
): React.ReactNode {
  if (!sections || sections.length === 0) return null;
  const labelSize = letterheadTypePt('bodyLabel', textSize);
  const bodySize = letterheadTypePt('bodyText', textSize);
  const labelStyle = accentColor
    ? [styles.sectionLabel, { color: accentColor, fontSize: labelSize }]
    : [styles.sectionLabel, { fontSize: labelSize }];
  return sections.map((section, i) => (
    <View key={`custom-subsection-${i}`} style={styles.section} wrap={false}>
      {section.title ? <Text style={labelStyle}>{section.title}</Text> : null}
      {section.body ? (
        <Text style={[styles.sectionBody, { fontSize: bodySize }]}>{section.body}</Text>
      ) : null}
      {section.children.map((child, j) => (
        <View key={`custom-subsection-${i}-child-${j}`} style={{ marginLeft: 12, marginTop: 4 }}>
          <Text style={labelStyle}>{child.title}</Text>
          {child.body ? (
            <Text style={[styles.sectionBody, { fontSize: bodySize }]}>{child.body}</Text>
          ) : null}
        </View>
      ))}
    </View>
  ));
}

export const PrescriptionDocument: React.FC<PrescriptionDocumentProps> = ({ data }) => {
  const { header, footer, patient, body, layout } = data;
  const pageSize = layout?.pageSize === 'a5' ? 'A5' : 'A4';
  const isPreprinted = layout?.preset === 'preprinted';
  const accentColor = resolvePdfAccent(layout?.accentColor);
  const bodyTextSize = layout?.bodyTextSize;
  const hasBannerFooter = layout?.preset === 'banner' && Boolean(footer.bannerSrc);
  const mt = mmToPt(layout?.pageMarginTopMm ?? 12);
  const mr = mmToPt(layout?.pageMarginRightMm ?? 12);
  const mb = mmToPt(layout?.pageMarginBottomMm ?? 12);
  const ml = mmToPt(layout?.pageMarginLeftMm ?? 12);
  const pageStyle =
    isPreprinted && layout
      ? {
          ...styles.page,
          paddingTop: mmToPt(layout.preprintMarginTopMm),
          paddingBottom: mmToPt(layout.preprintMarginBottomMm),
        }
      : hasBannerFooter && layout
        ? {
            ...styles.page,
            paddingTop: mt,
            paddingRight: mr,
            paddingLeft: ml,
            paddingBottom: 24 + mmToPt(layout.footerHeightMm ?? 20) + 40,
          }
        : layout
          ? {
              ...styles.page,
              paddingTop: mt,
              paddingRight: mr,
              paddingBottom: Math.max(mb, 56),
              paddingLeft: ml,
            }
          : styles.page;

  const showBackground =
    !isPreprinted && Boolean(layout?.backgroundSrc) && layout?.backgroundPreset !== 'none';
  const backgroundOpacity = Math.min(40, Math.max(0, layout?.backgroundOpacity ?? 15)) / 100;

  return (
    <Document author={header.doctorName} title={`Prescription · ${patient.patientName}`}>
      <Page size={pageSize} style={pageStyle}>
        {showBackground && layout?.backgroundSrc ? (
          <Image
            src={layout.backgroundSrc}
            fixed
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: letterheadImageFitCss(layout.backgroundFit ?? 'fill'),
              opacity: backgroundOpacity,
            }}
          />
        ) : null}
        {/* Header — page 1 only (NOT marked `fixed`). */}
        <Header data={header} layout={layout} />

        {/* Patient card — page 1 only. */}
        <PatientBlock data={patient} layout={layout} />

        {/* Preprinted hides the letterhead Header. Digital preview still
            needs doctor + registration on the sheet. */}
        {isPreprinted ? (
          <SectionBlock
            label="Doctor"
            body={formatPreprintedIssuerLine(header)}
            accentColor={accentColor}
            textSize={bodyTextSize}
          />
        ) : null}

        {/* SOAP sections (skipped sections render nothing — see SectionBlock). */}
        <SectionBlock
          label="Allergies"
          body={body.allergies}
          accentColor={accentColor}
          textSize={bodyTextSize}
        />
        <SectionBlock
          label="Chief complaint"
          body={body.cc}
          accentColor={accentColor}
          textSize={bodyTextSize}
        />
        <SectionBlock
          label="History of present illness"
          body={body.hopi}
          accentColor={accentColor}
          textSize={bodyTextSize}
        />
        <SectionBlock
          label="Vitals"
          body={body.vitals}
          accentColor={accentColor}
          textSize={bodyTextSize}
        />
        <SectionBlock
          label="Examination"
          body={body.examinationFindings}
          accentColor={accentColor}
          textSize={bodyTextSize}
        />
        <SectionBlock
          label="Social history"
          body={body.socialHistory}
          accentColor={accentColor}
          textSize={bodyTextSize}
        />

        {/* Doctor-defined custom subsections (subj-22) — subjective block,
            rendered after social history and before the plan-side sections. */}
        {renderCustomSubsections(body.customSubsections, accentColor, bodyTextSize)}

        <SectionBlock
          label="Provisional diagnosis"
          body={body.provisionalDiagnosis}
          accentColor={accentColor}
          textSize={bodyTextSize}
        />

        {/* assessment-plan-custom-sections — custom Assessment sections, rendered
            after the diagnosis and before investigations (assessment-side block). */}
        {renderCustomSubsections(body.assessmentCustomSections, accentColor, bodyTextSize)}

        <InvestigationsBlock
          body={body.investigations}
          accentColor={accentColor}
          textSize={bodyTextSize}
        />

        {/* Rx — medicine table. Flows to next page if needed. */}
        <MedicineTable
          medicines={body.medicines}
          accentColor={accentColor}
          textSize={bodyTextSize}
        />

        {/* Plan-side patient-facing sections (plan-p1). Clinical notes omitted. */}
        <SectionBlock
          label="Advice"
          body={body.advice}
          accentColor={accentColor}
          textSize={bodyTextSize}
        />
        <SectionBlock
          label="Follow-up"
          body={body.followUp}
          accentColor={accentColor}
          textSize={bodyTextSize}
        />
        <SectionBlock
          label="Referral"
          body={body.referral}
          accentColor={accentColor}
          textSize={bodyTextSize}
        />

        {/* assessment-plan-custom-sections — custom Plan sections (plan-side block). */}
        {renderCustomSubsections(body.planCustomSections, accentColor, bodyTextSize)}

        {/* Footer — repeats per page (see Footer.tsx `fixed`). */}
        <Footer data={footer} layout={layout} />
      </Page>
    </Document>
  );
};
