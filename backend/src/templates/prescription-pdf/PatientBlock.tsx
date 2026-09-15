/**
 * Patient identity on the prescription PDF (page 1).
 * Preset + field toggles from letterhead tokens. Empty fields omitted
 * except on `grid`, which keeps the hospital chart cells.
 */

import * as React from 'react';
import { View, Text } from '@react-pdf/renderer';
import { COLORS, resolvePdfAccent, styles } from './styles';
import { letterheadTypePt } from '../../types/letterhead';
import { formatAgeGender, formatGuardianLine } from './patient-identity';
import type { PrescriptionPdfLayout, PrescriptionPdfPatientData } from './types';

interface PatientBlockProps {
  data: PrescriptionPdfPatientData;
  layout?: PrescriptionPdfLayout;
}

function chunkCells<T>(cells: T[], size = 3): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < cells.length; i += size) {
    rows.push(cells.slice(i, i + size));
  }
  return rows;
}

function GridCell({
  label,
  value,
  color,
  fontSize,
}: {
  label: string;
  value: string;
  color: string;
  fontSize: number;
}): React.ReactElement {
  return (
    <View
      style={{
        flexGrow: 1,
        flexShrink: 1,
        flexBasis: 0,
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderColor: COLORS.rule,
        paddingVertical: 4,
        paddingHorizontal: 5,
      }}
    >
      <Text style={{ fontSize, color }}>
        {label} : <Text style={{ fontFamily: 'Helvetica-Bold' }}>{value}</Text>
      </Text>
    </View>
  );
}

function GridPatientBlock({
  data,
  layout,
  patientColor,
}: {
  data: PrescriptionPdfPatientData;
  layout?: PrescriptionPdfLayout;
  patientColor: string;
}): React.ReactElement {
  const cellSize = letterheadTypePt('patientMeta', layout?.patientTextSize);
  const ageGender = formatAgeGender(data.patientAge, data.patientGender);
  const visit = data.visitDateLabel.trim() || '';
  const showPhone = layout?.showPatientPhone !== false;
  const showGuardian = layout?.showPatientGuardian !== false;
  const showMrn = layout?.showPatientMrn !== false;
  const showAddress = layout?.showPatientAddress !== false;
  const phone = showPhone ? data.patientPhone?.trim() || '' : '';
  const mrn = showMrn ? data.medicalRecordNumber?.trim() || '' : '';
  const relative = showGuardian
    ? formatGuardianLine(data.guardianName, data.guardianRelation, data.patientGender) ?? ''
    : '';
  const address = showAddress ? data.address?.trim() || '' : '';

  const cells: { label: string; value: string }[] = [];
  if (showMrn) cells.push({ label: 'MRN', value: mrn });
  if (visit) cells.push({ label: 'Date', value: visit });
  if (showPhone) cells.push({ label: 'Phone', value: phone });
  cells.push({ label: 'Name', value: data.patientName });
  if (ageGender) cells.push({ label: 'Age / gender', value: ageGender });
  if (showGuardian) cells.push({ label: 'Relative', value: relative });

  return (
    <View
      style={{
        marginBottom: 20,
        borderTopWidth: 1,
        borderLeftWidth: 1,
        borderColor: COLORS.rule,
      }}
      wrap={false}
    >
      {chunkCells(cells).map((row, rowIdx) => (
        <View key={rowIdx} style={{ flexDirection: 'row' }}>
          {row.map((cell) => (
            <GridCell
              key={cell.label}
              label={cell.label}
              value={cell.value}
              color={patientColor}
              fontSize={cellSize}
            />
          ))}
        </View>
      ))}
      {address ? (
        <View style={{ flexDirection: 'row' }}>
          <GridCell
            label="Address"
            value={address}
            color={patientColor}
            fontSize={cellSize}
          />
        </View>
      ) : null}
    </View>
  );
}

export const PatientBlock: React.FC<PatientBlockProps> = ({ data, layout }) => {
  const preset = layout?.patientIdentityPreset ?? 'open_letter';
  const patientColor = resolvePdfAccent(layout?.patientColor ?? layout?.accentColor);
  const namePt = letterheadTypePt(
    preset === 'compact' ? 'patientNameCompact' : 'patientName',
    layout?.patientTextSize
  );
  const metaPt = letterheadTypePt('patientMeta', layout?.patientTextSize);

  if (preset === 'grid') {
    return <GridPatientBlock data={data} layout={layout} patientColor={patientColor} />;
  }

  const ageGender = formatAgeGender(data.patientAge, data.patientGender);
  const guardian =
    layout?.showPatientGuardian === false
      ? null
      : formatGuardianLine(data.guardianName, data.guardianRelation, data.patientGender);
  const phone =
    layout?.showPatientPhone === false ? null : data.patientPhone?.trim() || null;
  const mrn =
    layout?.showPatientMrn === false ? null : data.medicalRecordNumber?.trim() || null;
  const address =
    layout?.showPatientAddress === false ? null : data.address?.trim() || null;
  const visit = data.visitDateLabel.trim() || null;

  const meta: string[] = [];
  if (phone) meta.push(phone);
  if (guardian) meta.push(guardian);
  if (mrn) meta.push(`MRN ${mrn}`);

  const showAddress = Boolean(address);
  const showChip = Boolean(ageGender);

  if (preset === 'compact') {
    const details = [...meta, address].filter(Boolean);
    return (
      <View
        style={{ ...styles.patientIdentity, marginBottom: 10, paddingBottom: 6 }}
        wrap={false}
      >
        <Text>
          <Text style={{ ...styles.patientNameHero, fontSize: namePt, color: patientColor }}>
            {data.patientName}
          </Text>
          {showChip ? (
            <Text
              style={{
                ...styles.patientChip,
                fontSize: metaPt,
                marginLeft: 0,
                color: patientColor,
              }}
            >
              {`  ·  ${ageGender}`}
            </Text>
          ) : null}
          {visit ? (
            <Text style={{ ...styles.patientVisit, fontSize: metaPt, color: patientColor }}>
              {`  ·  ${visit}`}
            </Text>
          ) : null}
        </Text>
        {details.length > 0 ? (
          <Text
            style={{ ...styles.patientMeta, marginTop: 2, fontSize: metaPt, color: patientColor }}
          >
            {details.join('  ·  ')}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.patientIdentity} wrap={false}>
      <View style={styles.patientIdentityRow}>
        <View style={styles.patientIdentityLeft}>
          <Text style={{ ...styles.patientNameHero, fontSize: namePt, color: patientColor }}>
            {data.patientName}
          </Text>
          {showChip ? (
            <Text style={{ ...styles.patientChip, fontSize: metaPt, color: patientColor }}>
              {ageGender}
            </Text>
          ) : null}
        </View>
        {visit ? (
          <Text style={{ ...styles.patientVisit, fontSize: metaPt, color: patientColor }}>
            {visit}
          </Text>
        ) : null}
      </View>
      {meta.length > 0 ? (
        <Text style={{ ...styles.patientMeta, fontSize: metaPt, color: patientColor }}>
          {meta.join('  ·  ')}
        </Text>
      ) : null}
      {showAddress ? (
        <Text style={{ ...styles.patientMeta, fontSize: metaPt, color: patientColor }}>
          {address}
        </Text>
      ) : null}
    </View>
  );
};
