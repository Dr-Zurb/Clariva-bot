/**
 * Letterhead block for the prescription PDF (T3.15).
 *
 * Renders ONCE at the top of page 1 (and is included in the
 * `<Document>`'s top-of-page slot via PrescriptionDocument; the
 * footer repeats per page, the header does NOT — Decision: keep
 * page 2+ uncluttered to maximise content area).
 *
 * Letterhead fallbacks per Decision T3-D4 + master-batch decision 16:
 *   - missing logo_url            → text-only header (no broken-image marker)
 *   - missing clinic_name         → fall back to doctor display name only
 *   - missing clinic_address      → omit the address line
 *   - missing registration_number → omit the reg-no line
 */

import * as React from 'react';
import { View, Text, Image } from '@react-pdf/renderer';
import { styles } from './styles';
import type { PrescriptionPdfHeaderData } from './types';

interface HeaderProps {
  data: PrescriptionPdfHeaderData;
}

export const Header: React.FC<HeaderProps> = ({ data }) => {
  const {
    doctorName,
    qualifications,
    specialty,
    registrationNumber,
    clinicName,
    clinicAddress,
    logoUrl,
  } = data;

  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        {logoUrl ? (
          // The Image renderer in @react-pdf/renderer fetches by URL
          // server-side. If the fetch fails (404, network), it throws
          // at render time. We wrap in a try/catch upstream by
          // setting logoUrl=null in the service when the URL is
          // unreachable — the Image element itself can't gracefully
          // degrade.
          <Image src={logoUrl} style={styles.logo} />
        ) : null}
        <View style={styles.doctorBlock}>
          <Text style={styles.doctorName}>{doctorName}</Text>
          {qualifications ? (
            <Text style={styles.doctorMeta}>{qualifications}</Text>
          ) : null}
          {specialty ? <Text style={styles.doctorMeta}>{specialty}</Text> : null}
          {registrationNumber ? (
            <Text style={styles.doctorMeta}>Reg. No.: {registrationNumber}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.clinicBlock}>
        {clinicName ? <Text style={styles.clinicName}>{clinicName}</Text> : null}
        {clinicAddress ? (
          <Text style={styles.clinicAddress}>{clinicAddress}</Text>
        ) : null}
      </View>
    </View>
  );
};
