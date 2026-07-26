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
import { Document, Page, View, Text } from '@react-pdf/renderer';
import { styles } from './styles';
import { Header } from './Header';
import { Footer } from './Footer';
import { MedicineTable } from './MedicineTable';
import { SectionBlock } from './SectionBlock';
import type { PrescriptionPdfData } from './types';
import type { OutputCustomSubsection } from '../../utils/custom-subsections';

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
): React.ReactNode {
  if (!sections || sections.length === 0) return null;
  return sections.map((section, i) => (
    <View key={`custom-subsection-${i}`} style={styles.section} wrap={false}>
      {section.title ? (
        <Text style={styles.sectionLabel}>{section.title}</Text>
      ) : null}
      {section.body ? (
        <Text style={styles.sectionBody}>{section.body}</Text>
      ) : null}
      {section.children.map((child, j) => (
        <View
          key={`custom-subsection-${i}-child-${j}`}
          style={{ marginLeft: 12, marginTop: 4 }}
        >
          <Text style={styles.sectionLabel}>{child.title}</Text>
          {child.body ? (
            <Text style={styles.sectionBody}>{child.body}</Text>
          ) : null}
        </View>
      ))}
    </View>
  ));
}

export const PrescriptionDocument: React.FC<PrescriptionDocumentProps> = ({
  data,
}) => {
  const { header, footer, patient, body } = data;

  return (
    <Document
      author={header.doctorName}
      title={`Prescription · ${patient.patientName}`}
    >
      <Page size="A4" style={styles.page}>
        {/* Header — page 1 only (NOT marked `fixed`). */}
        <Header data={header} />

        {/* Patient strip — page 1 only. */}
        <View style={styles.patientStrip}>
          <View style={styles.patientField}>
            <Text style={styles.patientLabel}>Patient</Text>
            <Text style={styles.patientValue}>{patient.patientName}</Text>
          </View>
          {patient.patientAge ? (
            <View style={styles.patientField}>
              <Text style={styles.patientLabel}>Age</Text>
              <Text style={styles.patientValue}>{patient.patientAge}</Text>
            </View>
          ) : null}
          {patient.patientGender ? (
            <View style={styles.patientField}>
              <Text style={styles.patientLabel}>Gender</Text>
              <Text style={styles.patientValue}>{patient.patientGender}</Text>
            </View>
          ) : null}
          <View style={styles.patientField}>
            <Text style={styles.patientLabel}>Visit</Text>
            <Text style={styles.patientValue}>{patient.visitDateLabel}</Text>
          </View>
        </View>

        {/* SOAP sections (skipped sections render nothing — see SectionBlock). */}
        <SectionBlock label="Chief complaint" body={body.cc} />
        <SectionBlock label="History of present illness" body={body.hopi} />
        <SectionBlock label="Social history" body={body.socialHistory} />

        {/* Doctor-defined custom subsections (subj-22) — subjective block,
            rendered after social history and before the plan-side sections. */}
        {renderCustomSubsections(body.customSubsections)}

        <SectionBlock label="Provisional diagnosis" body={body.provisionalDiagnosis} />

        {/* assessment-plan-custom-sections — custom Assessment sections, rendered
            after the diagnosis and before investigations (assessment-side block). */}
        {renderCustomSubsections(body.assessmentCustomSections)}

        <SectionBlock label="Investigations" body={body.investigations} />

        {/* Rx — medicine table. Flows to next page if needed. */}
        <MedicineTable medicines={body.medicines} />

        {/* Plan-side patient-facing sections (plan-p1). Clinical notes omitted. */}
        <SectionBlock label="Advice" body={body.advice} />
        <SectionBlock label="Follow-up" body={body.followUp} />
        <SectionBlock label="Referral" body={body.referral} />

        {/* assessment-plan-custom-sections — custom Plan sections (plan-side block). */}
        {renderCustomSubsections(body.planCustomSections)}

        {/* Footer — repeats per page (see Footer.tsx `fixed`). */}
        <Footer data={footer} />
      </Page>
    </Document>
  );
};
