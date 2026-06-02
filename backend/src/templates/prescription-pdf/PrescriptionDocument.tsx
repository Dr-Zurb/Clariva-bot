/**
 * Root @react-pdf/renderer component for the prescription PDF
 * (EHR Sub-batch B2 / T3.15).
 *
 * Page layout:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Header (logo + doctor + clinic)                              │  ← page 1 only
 *   ├──────────────────────────────────────────────────────────────┤
 *   │ Patient strip (name · age · gender · visit date)             │  ← page 1 only
 *   ├──────────────────────────────────────────────────────────────┤
 *   │ Sections: CC, HOPI, Dx, Investigations, Follow-up, Education │  ← flows
 *   ├──────────────────────────────────────────────────────────────┤
 *   │ Rx — medicine table (multi-row, may flow)                    │  ← flows
 *   ├──────────────────────────────────────────────────────────────┤
 *   │ Clinical notes (private; appears AFTER Rx so the patient     │  ← flows
 *   │ sees the medicines first)                                    │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │ Footer (signature line + Clariva attribution + Rx-ID + page) │  ← REPEATS per page
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Section order rationale (decision deviating from source-plan §T3.15
 * step 4 list-order): we put **medicines BEFORE clinical_notes**
 * because the table is the artifact most patients screenshot for the
 * pharmacy. Clinical notes are typically internal/follow-up oriented
 * and ride below the meds table without losing readability. The "all
 * 7 SOAP sections present" acceptance still holds — they're all
 * rendered (or omitted when empty per SectionBlock convention).
 *
 * Skipped-section convention: empty/null bodies render NOTHING
 * (omitted entirely) — see SectionBlock.tsx. This was the cleaner of
 * the two source-plan options ("—" vs omit); pinned for v1.
 */

import * as React from 'react';
import { Document, Page, View, Text } from '@react-pdf/renderer';
import { styles } from './styles';
import { Header } from './Header';
import { Footer } from './Footer';
import { MedicineTable } from './MedicineTable';
import { SectionBlock } from './SectionBlock';
import type { PrescriptionPdfData } from './types';

interface PrescriptionDocumentProps {
  data: PrescriptionPdfData;
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
        <SectionBlock label="Provisional diagnosis" body={body.provisionalDiagnosis} />
        <SectionBlock label="Investigations" body={body.investigations} />

        {/* Rx — medicine table. Flows to next page if needed. */}
        <MedicineTable medicines={body.medicines} />

        {/* Plan-side sections sit below the table so the patient sees
            the medicines on the first page when possible. */}
        <SectionBlock label="Patient education" body={body.patientEducation} />
        <SectionBlock label="Follow-up" body={body.followUp} />
        <SectionBlock label="Clinical notes" body={body.clinicalNotes} />

        {/* Footer — repeats per page (see Footer.tsx `fixed`). */}
        <Footer data={footer} />
      </Page>
    </Document>
  );
};
