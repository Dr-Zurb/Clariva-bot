/**
 * Shared @react-pdf/renderer styles for the prescription PDF
 * (EHR Sub-batch B2 / T3.15).
 *
 * Single styles object so size / color / spacing tokens stay in
 * lockstep across header, body, and footer. All values in `pt`
 * (1pt ≈ 0.353mm). A4 page is 595×842 pt; with 36pt margins on all
 * sides we have ~523pt of usable width.
 */

import { StyleSheet } from '@react-pdf/renderer';
import { ACCENT_COLOR_RE, DEFAULT_LETTERHEAD_ACCENT } from '../../types/letterhead';

/** Convert millimetres to PDF points (1pt = 1/72 in). */
export function mmToPt(mm: number): number {
  return (mm * 72) / 25.4;
}

/** Valid `#RRGGBB` or the letterhead default. */
export function resolvePdfAccent(raw?: string | null): string {
  const trimmed = raw?.trim() ?? '';
  return ACCENT_COLOR_RE.test(trimmed) ? trimmed : DEFAULT_LETTERHEAD_ACCENT;
}

export const COLORS = {
  ink:        '#0F172A', // slate-900 — body text
  muted:      '#64748B', // slate-500 — secondary labels
  hairline:   '#E2E8F0', // slate-200 — table rules / dividers
  rule:       '#000000', // letterhead header / patient / footer rules
  accent:     '#000000', // default Rx / section labels
  surfaceAlt: '#F8FAFC', // slate-50  — table header / zebra rows
};

export const styles = StyleSheet.create({
  // Page chrome ----------------------------------------------------------
  page: {
    paddingTop: 36,
    paddingBottom: 56, // leave room for repeating footer
    paddingHorizontal: 36,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: COLORS.ink,
    lineHeight: 1.35,
  },

  // Header ---------------------------------------------------------------
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.rule,
    marginBottom: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  logo: {
    width: 56,
    height: 56,
    marginRight: 12,
    objectFit: 'contain',
  },
  doctorBlock: {
    flexDirection: 'column',
  },
  doctorName: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
  },
  doctorMeta: {
    fontSize: 9,
    color: COLORS.muted,
  },
  clinicBlock: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    maxWidth: 220,
  },
  clinicName: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
  },
  clinicAddress: {
    fontSize: 9,
    color: COLORS.muted,
    textAlign: 'right',
  },

  // Patient identity (open letter) ---------------------------------------
  patientIdentity: {
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.rule,
  },
  patientIdentityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  patientIdentityLeft: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexGrow: 1,
    flexShrink: 1,
    paddingRight: 12,
  },
  patientNameHero: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.ink,
  },
  patientChip: {
    fontSize: 9,
    color: COLORS.muted,
    marginLeft: 8,
    marginBottom: 1,
  },
  patientVisit: {
    fontSize: 9,
    color: COLORS.muted,
  },
  patientMeta: {
    fontSize: 9,
    color: COLORS.muted,
    marginTop: 4,
  },

  // Section blocks (CC / HOPI / Dx / etc.) -------------------------------
  section: {
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 9,
    color: COLORS.accent,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  sectionBody: {
    fontSize: 10,
    color: COLORS.ink,
    // Long words (drug names, URLs) shouldn't overflow the page.
    // @react-pdf supports the `wordBreak` style on Text via the
    // generic CSS fallback path; if the rendering library doesn't
    // recognise the property it's a no-op rather than an error.
  },
  invGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  invPackage: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
    marginBottom: 2,
  },
  invPackageLabel: {
    flex: 1,
    letterSpacing: 0.2,
  },
  invMembers: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingLeft: 12,
    marginBottom: 4,
  },
  invCell: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingRight: 8,
    marginBottom: 3,
  },
  invTick: {
    width: 7,
    height: 7,
    borderWidth: 0.8,
    borderColor: COLORS.ink,
    marginRight: 5,
    marginTop: 2,
  },
  invTickMember: {
    width: 5.5,
    height: 5.5,
    borderWidth: 0.8,
    borderColor: COLORS.ink,
    borderRadius: 3,
    marginRight: 5,
    marginTop: 3,
  },
  invNote: {
    fontSize: 10,
    color: COLORS.ink,
    marginTop: 4,
  },

  // Medicine table -------------------------------------------------------
  medsHeading: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 6,
    marginBottom: 6,
  },
  medRowHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceAlt,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.hairline,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  medRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: 0.5,
    borderColor: COLORS.hairline,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  medCellIdx: {
    width: '6%',
    fontSize: 9,
    color: COLORS.muted,
  },
  medCellName: {
    width: '30%',
    paddingRight: 4,
  },
  medCellDose: {
    width: '14%',
    paddingRight: 4,
  },
  medCellRoute: {
    width: '12%',
    paddingRight: 4,
  },
  medCellFreq: {
    width: '18%',
    paddingRight: 4,
  },
  medCellDuration: {
    width: '20%',
    paddingRight: 4,
  },
  medHeaderText: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  medCellText: {
    fontSize: 10,
  },
  medInstructions: {
    fontSize: 9,
    color: COLORS.muted,
    marginTop: 2,
    fontStyle: 'italic',
  },
  medsEmpty: {
    fontSize: 10,
    color: COLORS.muted,
    fontStyle: 'italic',
    marginVertical: 4,
  },

  // Footer (repeating) ---------------------------------------------------
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    fontSize: 8,
    color: COLORS.muted,
    borderTopWidth: 1,
    borderTopColor: COLORS.rule,
    paddingTop: 8,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signatureLine: {
    marginTop: 24, // visual room for handwritten signature on print
    borderTopWidth: 0.5,
    borderTopColor: COLORS.ink,
    width: 180,
    paddingTop: 2,
    fontSize: 9,
    color: COLORS.ink,
  },

  // Page number ----------------------------------------------------------
  pageNumber: {
    fontSize: 8,
    color: COLORS.muted,
  },
});
