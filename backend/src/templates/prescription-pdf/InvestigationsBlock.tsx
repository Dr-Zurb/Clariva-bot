/**
 * Investigations on the patient PDF: 2-column tick list when the
 * orders parse as discrete tests; package members nest under the
 * package name; paragraph fallback otherwise.
 */

import * as React from 'react';
import { View, Text } from '@react-pdf/renderer';
import { letterheadTypePt, type LetterheadTextSize } from '../../types/letterhead';
import { styles } from './styles';
import {
  layoutInvestigationsForRx,
  rowsFromInvestigationItems,
  type InvestigationsRxRow,
} from './investigations-rx-layout';

interface InvestigationsBlockProps {
  body: string | null | undefined;
  accentColor?: string | null;
  textSize?: LetterheadTextSize;
}

export const InvestigationsBlock: React.FC<InvestigationsBlockProps> = ({
  body,
  accentColor,
  textSize,
}) => {
  const layout = layoutInvestigationsForRx(body);
  if (!layout) return null;

  const labelSize = letterheadTypePt('bodyLabel', textSize);
  const bodySize = letterheadTypePt('bodyText', textSize);
  const labelStyle = accentColor
    ? [styles.sectionLabel, { color: accentColor, fontSize: labelSize }]
    : [styles.sectionLabel, { fontSize: labelSize }];

  const tick = (
    item: string,
    i: number,
    variant: 'major' | 'member' = 'major',
  ): React.ReactElement => (
    <View key={`${i}-${item}`} style={styles.invCell} wrap={false}>
      <View
        style={variant === 'member' ? styles.invTickMember : styles.invTick}
      />
      <Text style={[styles.sectionBody, { fontSize: bodySize, flex: 1 }]}>
        {item}
      </Text>
    </View>
  );

  const renderRow = (
    row: InvestigationsRxRow,
    key: string,
  ): React.ReactElement => {
    if (row.kind === 'pair') {
      return (
        <View key={key} style={styles.invGrid}>
          {row.labels.map((item, i) => tick(item, i))}
        </View>
      );
    }
    return (
      <View key={key} wrap={false}>
        <View style={styles.invPackage} wrap={false}>
          <View style={styles.invTick} />
          <Text
            style={[
              styles.sectionBody,
              styles.invPackageLabel,
              { fontSize: bodySize },
            ]}
          >
            {row.label}
          </Text>
        </View>
        {row.members.length > 0 ? (
          <View style={styles.invMembers}>
            {row.members.map((item, i) => tick(item, i, 'member'))}
          </View>
        ) : null}
      </View>
    );
  };

  if (layout.kind === 'paragraph') {
    return (
      <View style={styles.section}>
        <View wrap={false} minPresenceAhead={24}>
          <Text style={labelStyle}>Investigations</Text>
          <Text style={[styles.sectionBody, { fontSize: bodySize }]}>
            {layout.text}
          </Text>
        </View>
      </View>
    );
  }

  const rows = rowsFromInvestigationItems(layout.items);
  const first = rows[0];
  const rest = rows.slice(1);

  return (
    <View style={styles.section}>
      <View wrap={false} minPresenceAhead={24}>
        <Text style={labelStyle}>Investigations</Text>
        {first ? renderRow(first, 'inv-row-0') : null}
      </View>
      {rest.map((row, i) => renderRow(row, `inv-row-${i + 1}`))}
      {layout.note ? (
        <Text style={[styles.invNote, { fontSize: bodySize }]}>
          {layout.note}
        </Text>
      ) : null}
    </View>
  );
};
