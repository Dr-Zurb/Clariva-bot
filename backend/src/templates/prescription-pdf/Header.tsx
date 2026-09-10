/**
 * Letterhead block for the prescription PDF (T3.15 + clinic-branding-v1).
 *
 * Renders ONCE at the top of page 1. `preprinted` preset returns null
 * (the page padding reserves the clinic's own printed letterhead).
 */

import * as React from 'react';
import { View, Text, Image } from '@react-pdf/renderer';
import { letterheadImageFitCss, letterheadTypePt, logoSizePx } from '../../types/letterhead';
import { letterheadHeading } from './letterhead-heading';
import { mmToPt, resolvePdfAccent, styles } from './styles';
import type { PrescriptionPdfHeaderData, PrescriptionPdfLayout } from './types';

interface HeaderProps {
  data: PrescriptionPdfHeaderData;
  layout?: PrescriptionPdfLayout;
}

function logoSource(
  data: PrescriptionPdfHeaderData
): PrescriptionPdfHeaderData['logoSrc'] | string | null {
  if (data.logoSrc) return data.logoSrc;
  if (data.logoUrl) return data.logoUrl;
  return null;
}

function IdentityBlock({
  data,
  align = 'left',
  chrome,
  textSize,
}: {
  data: PrescriptionPdfHeaderData;
  align?: 'left' | 'center' | 'right';
  chrome: string;
  textSize?: import('../../types/letterhead').LetterheadTextSize;
}): React.ReactElement {
  const { qualifications, specialty, registrationNumber, clinicAddress } = data;
  const title = letterheadHeading(data.doctorName, data.clinicName);
  const textAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';
  const titleSize = letterheadTypePt('headerTitle', textSize);
  const metaSize = letterheadTypePt('headerMeta', textSize);
  return (
    <View
      style={{
        ...styles.doctorBlock,
        alignItems: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
      }}
    >
      <Text style={{ ...styles.doctorName, fontSize: titleSize, textAlign, color: chrome }}>
        {title}
      </Text>
      {qualifications ? (
        <Text style={{ ...styles.doctorMeta, fontSize: metaSize, textAlign, color: chrome }}>
          {qualifications}
        </Text>
      ) : null}
      {specialty ? (
        <Text style={{ ...styles.doctorMeta, fontSize: metaSize, textAlign, color: chrome }}>
          {specialty}
        </Text>
      ) : null}
      {registrationNumber ? (
        <Text style={{ ...styles.doctorMeta, fontSize: metaSize, textAlign, color: chrome }}>
          Reg. No.: {registrationNumber}
        </Text>
      ) : null}
      {clinicAddress ? (
        <Text
          style={{
            ...styles.clinicAddress,
            fontSize: metaSize,
            textAlign,
            marginTop: 4,
            color: chrome,
          }}
        >
          {clinicAddress}
        </Text>
      ) : null}
    </View>
  );
}

function headerBandSource(
  data: PrescriptionPdfHeaderData
): PrescriptionPdfHeaderData['headerSrc'] | null {
  return data.headerSrc ?? null;
}

/** In-flow box. Negative inset bled the band into the printer clip zone. */
export function bannerBandBoxStyle(): { marginBottom: number } {
  return { marginBottom: 10 };
}

export const Header: React.FC<HeaderProps> = ({ data, layout }) => {
  if (layout?.preset === 'preprinted') return null;

  if (layout?.preset === 'banner') {
    const band = headerBandSource(data);
    if (band) {
      const heightMm = layout.headerHeightMm ?? 35;
      return (
        <View style={bannerBandBoxStyle()} wrap={false}>
          <Image
            src={band}
            style={{
              width: '100%',
              height: mmToPt(heightMm),
              objectFit: letterheadImageFitCss(layout.headerFit ?? 'stretch'),
            }}
          />
        </View>
      );
    }
  }

  const src = logoSource(data);
  const chrome = resolvePdfAccent(layout?.chromeColor ?? layout?.accentColor);
  const logoPx = logoSizePx(layout?.logoSize ?? 'medium');
  const logoStyle = { ...styles.logo, width: logoPx, height: logoPx };

  if (layout?.preset === 'centred') {
    return (
      <View style={{ ...styles.header, flexDirection: 'column', alignItems: 'center' }}>
        {src ? (
          <Image src={src} style={{ ...logoStyle, marginRight: 0, marginBottom: 8 }} />
        ) : null}
        <IdentityBlock
          data={data}
          align="center"
          chrome={chrome}
          textSize={layout?.headerTextSize}
        />
      </View>
    );
  }

  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        {src ? <Image src={src} style={logoStyle} /> : null}
      </View>
      <IdentityBlock
        data={data}
        align="right"
        chrome={chrome}
        textSize={layout?.headerTextSize}
      />
    </View>
  );
};
