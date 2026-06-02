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
import { styles } from './styles';

interface SectionBlockProps {
  label: string;
  body: string | null | undefined;
}

export const SectionBlock: React.FC<SectionBlockProps> = ({ label, body }) => {
  if (!body || !body.trim()) return null;
  return (
    <View style={styles.section} wrap={false}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <Text style={styles.sectionBody}>{body.trim()}</Text>
    </View>
  );
};
