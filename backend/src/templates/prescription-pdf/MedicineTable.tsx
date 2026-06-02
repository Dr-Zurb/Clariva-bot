/**
 * Medicine table for the prescription PDF (T3.15).
 *
 * Renders one row per medicine, in `sort_order`. Uses the structured
 * `frequency_code` / `route_code` / `duration_value` + `duration_unit`
 * columns (T2.9) when set; falls back to the legacy free-text columns
 * for any field the doctor entered as free text.
 *
 * Layout — six columns: # · Name · Dose · Route · Frequency · Duration.
 * Instructions render as a sub-line under the row when present (so the
 * main row stays compact and scan-able for the patient pharmacy).
 *
 * Multi-page flow: the table doesn't wrap rows mid-row (each `<View>`
 * with `wrap={false}` is treated as a single block by the
 * @react-pdf/renderer page-break engine).
 */

import * as React from 'react';
import { View, Text } from '@react-pdf/renderer';
import { styles } from './styles';
import type { PrescriptionMedicine } from '../../types/prescription';
import { projectMedicineForDisplay } from '../../utils/medicine-display';

interface MedicineTableProps {
  medicines: PrescriptionMedicine[];
}

export const MedicineTable: React.FC<MedicineTableProps> = ({ medicines }) => {
  if (!medicines || medicines.length === 0) {
    return (
      <>
        <Text style={styles.medsHeading}>Rx</Text>
        <Text style={styles.medsEmpty}>No medicines prescribed.</Text>
      </>
    );
  }

  const sorted = [...medicines].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );

  return (
    <>
      <Text style={styles.medsHeading}>Rx</Text>

      {/* Header row */}
      <View style={styles.medRowHeader} fixed>
        <Text style={[styles.medCellIdx, styles.medHeaderText]}>#</Text>
        <Text style={[styles.medCellName, styles.medHeaderText]}>Medicine</Text>
        <Text style={[styles.medCellDose, styles.medHeaderText]}>Dose</Text>
        <Text style={[styles.medCellRoute, styles.medHeaderText]}>Route</Text>
        <Text style={[styles.medCellFreq, styles.medHeaderText]}>Frequency</Text>
        <Text style={[styles.medCellDuration, styles.medHeaderText]}>Duration</Text>
      </View>

      {sorted.map((med, i) => {
        const d = projectMedicineForDisplay(med);
        return (
          <View key={med.id} style={styles.medRow} wrap={false}>
            <View style={{ width: '100%' }}>
              <View style={{ flexDirection: 'row' }}>
                <Text style={styles.medCellIdx}>{i + 1}.</Text>
                <Text style={[styles.medCellName, styles.medCellText]}>
                  {d.name || '—'}
                </Text>
                <Text style={[styles.medCellDose, styles.medCellText]}>
                  {d.dosage || '—'}
                </Text>
                <Text style={[styles.medCellRoute, styles.medCellText]}>
                  {d.route || '—'}
                </Text>
                <Text style={[styles.medCellFreq, styles.medCellText]}>
                  {d.frequency || '—'}
                </Text>
                <Text style={[styles.medCellDuration, styles.medCellText]}>
                  {d.duration || '—'}
                </Text>
              </View>
              {d.instructions ? (
                <Text style={styles.medInstructions}>
                  ↳ {d.instructions}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </>
  );
};
