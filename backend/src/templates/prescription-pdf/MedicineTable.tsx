/**
 * Medicine table for the prescription PDF (T3.15).
 *
 * Renders one row per medicine, in `sort_order`. Uses the structured
 * `frequency_code` / `route_code` / `duration_value` + `duration_unit`
 * columns (T2.9) when set; falls back to the legacy free-text columns
 * for any field the doctor entered as free text.
 *
 * Layout — six columns: # · Name · Dose · Route · Frequency · Duration.
 * Instructions render under the medicine name in that same column
 * (matches the HTML letterhead preview). Cells are direct children of
 * the row so % widths line up with the header — no nested 100% wrap.
 *
 * Multi-page flow: heading + header stay together (`wrap={false}`).
 * Medicine rows may wrap so a tall first name cannot be clipped off
 * the page-1 leftover (react-pdf drops `wrap={false}` blocks that
 * do not fit).
 */

import * as React from 'react';
import { View, Text } from '@react-pdf/renderer';
import { letterheadTypePt, type LetterheadTextSize } from '../../types/letterhead';
import { styles } from './styles';
import type { PrescriptionMedicine } from '../../types/prescription';
import { projectMedicineForDisplay } from '../../utils/medicine-display';
import { RX_INSTRUCTION_MARKER } from '../../utils/rx-instruction-marker';

interface MedicineTableProps {
  medicines: PrescriptionMedicine[];
  accentColor?: string | null;
  textSize?: LetterheadTextSize;
}

export const MedicineTable: React.FC<MedicineTableProps> = ({
  medicines,
  accentColor,
  textSize,
}) => {
  const labelSize = letterheadTypePt('bodyLabel', textSize);
  const bodySize = letterheadTypePt('bodyText', textSize);
  const headingStyle = accentColor
    ? [styles.medsHeading, { color: accentColor, fontSize: bodySize }]
    : [styles.medsHeading, { fontSize: bodySize }];
  if (!medicines || medicines.length === 0) {
    return (
      <>
        <Text style={headingStyle}>Rx</Text>
        <Text style={[styles.medsEmpty, { fontSize: bodySize }]}>
          No medicines prescribed.
        </Text>
      </>
    );
  }

  const sorted = [...medicines].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );

  const headerRow = (
    <View style={styles.medRowHeader} minPresenceAhead={28}>
      <Text style={[styles.medCellIdx, styles.medHeaderText, { fontSize: labelSize }]}>#</Text>
      <Text style={[styles.medCellName, styles.medHeaderText, { fontSize: labelSize }]}>
        Medicine
      </Text>
      <Text style={[styles.medCellDose, styles.medHeaderText, { fontSize: labelSize }]}>
        Dose
      </Text>
      <Text style={[styles.medCellRoute, styles.medHeaderText, { fontSize: labelSize }]}>
        Route
      </Text>
      <Text style={[styles.medCellFreq, styles.medHeaderText, { fontSize: labelSize }]}>
        Frequency
      </Text>
      <Text style={[styles.medCellDuration, styles.medHeaderText, { fontSize: labelSize }]}>
        Duration
      </Text>
    </View>
  );

  const medicineRow = (
    med: (typeof sorted)[number],
    i: number,
  ): React.ReactElement => {
    const d = projectMedicineForDisplay(med);
    return (
      <View
        key={med.id}
        style={styles.medRow}
        minPresenceAhead={64}
      >
        <Text style={[styles.medCellIdx, { fontSize: labelSize }]}>{i + 1}.</Text>
        <View style={styles.medCellName}>
          <Text style={[styles.medCellText, { fontSize: bodySize }]}>
            {d.name || '—'}
          </Text>
          {d.instructions ? (
            <Text style={[styles.medInstructions, { fontSize: labelSize }]}>
              {RX_INSTRUCTION_MARKER} {d.instructions}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.medCellDose, styles.medCellText, { fontSize: bodySize }]}>
          {d.dosage || '—'}
        </Text>
        <Text style={[styles.medCellRoute, styles.medCellText, { fontSize: bodySize }]}>
          {d.route || '—'}
        </Text>
        <Text style={[styles.medCellFreq, styles.medCellText, { fontSize: bodySize }]}>
          {d.frequency || '—'}
        </Text>
        <Text style={[styles.medCellDuration, styles.medCellText, { fontSize: bodySize }]}>
          {d.duration || '—'}
        </Text>
      </View>
    );
  };

  // Heading + header stay together. Each medicine is its own wrapping
  // row so a 3-line name is not clipped off the page-1 leftover.
  return (
    <>
      <View wrap={false} minPresenceAhead={40}>
        <Text style={headingStyle}>Rx</Text>
        {headerRow}
      </View>
      {sorted.map((med, i) => medicineRow(med, i))}
    </>
  );
};
