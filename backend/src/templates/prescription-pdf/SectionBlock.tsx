/**
 * Labeled section wrapper used for CC / HOPI / Diagnosis /
 * Investigations / Follow-up / Patient education / Clinical notes
 * (T3.15).
 *
 * Conventions (pinned):
 *   - Empty / null body → render nothing (don't reserve space).
 *     This matches the "skipped sections render as omitted entirely"
 *     half of the source-plan convention. Cleaner, denser PDFs for
 *     short Rx.
 *   - Label is uppercase + brand accent color; body is regular ink
 *     color. Spacing is consistent across all sections.
 *   - Long bodies wrap and flow to the next page automatically via
 *     @react-pdf/renderer's flexbox.
 */

import * as React from 'react';
import { View, Text } from '@react-pdf/renderer';
import { letterheadTypePt, type LetterheadTextSize } from '../../types/letterhead';
import { styles } from './styles';

interface SectionBlockProps {
  label: string;
  body: string | null | undefined;
  accentColor?: string | null;
  textSize?: LetterheadTextSize;
}

export const SectionBlock: React.FC<SectionBlockProps> = ({
  label,
  body,
  accentColor,
  textSize,
}) => {
  if (!body || !body.trim()) return null;
  const labelSize = letterheadTypePt('bodyLabel', textSize);
  const bodySize = letterheadTypePt('bodyText', textSize);
  return (
    <View style={styles.section} wrap={false}>
      <Text
        style={
          accentColor
            ? [styles.sectionLabel, { color: accentColor, fontSize: labelSize }]
            : [styles.sectionLabel, { fontSize: labelSize }]
        }
      >
        {label}
      </Text>
      <Text style={[styles.sectionBody, { fontSize: bodySize }]}>{body.trim()}</Text>
    </View>
  );
};
