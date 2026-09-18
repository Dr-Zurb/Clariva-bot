import * as React from 'react';
import {
  Header,
  bannerBandBoxStyle,
} from '../../../src/templates/prescription-pdf/Header';
import type {
  PrescriptionPdfHeaderData,
  PrescriptionPdfLayout,
} from '../../../src/templates/prescription-pdf/types';

jest.mock('@react-pdf/renderer', () => ({
  StyleSheet: { create: (s: unknown) => s },
  View: ({
    children,
    style,
  }: {
    children?: React.ReactNode;
    style?: Record<string, unknown>;
  }) => React.createElement('view', { style }, children),
  Text: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('text', null, children),
  Image: ({ src }: { src?: unknown }) =>
    React.createElement('image', { src }),
}));

const bannerData: PrescriptionPdfHeaderData = {
  doctorName: 'Dr. Test',
  headerSrc: 'https://example.test/header.png',
};

const bannerLayout: PrescriptionPdfLayout = {
  preset: 'banner',
  pageSize: 'a4',
  accentColor: '#000000',
  preprintMarginTopMm: 40,
  preprintMarginBottomMm: 30,
};

function collectStyles(node: React.ReactNode): Array<Record<string, unknown>> {
  const styles: Array<Record<string, unknown>> = [];
  const walk = (n: React.ReactNode): void => {
    if (n == null || typeof n === 'boolean') return;
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (!React.isValidElement(n)) return;
    const props = n.props as {
      style?: Record<string, unknown>;
      children?: React.ReactNode;
    };
    if (props.style && typeof props.style === 'object') {
      styles.push(props.style);
    }
    if (props.children != null) walk(props.children);
  };
  walk(node);
  return styles;
}

describe('bannerBandBoxStyle', () => {
  it('does not pull the band into the printer unprintable edge', () => {
    const style = bannerBandBoxStyle();
    expect(style.marginBottom).toBe(10);
    expect(style).not.toHaveProperty('marginTop');
    expect(style).not.toHaveProperty('marginHorizontal');
  });
});

describe('Header banner', () => {
  it('keeps the header photo inside page padding', () => {
    const tree = Header({ data: bannerData, layout: bannerLayout });
    const styles = collectStyles(tree);
    expect(styles.some((s) => Number(s.marginTop) < 0)).toBe(false);
    expect(styles.some((s) => Number(s.marginHorizontal) < 0)).toBe(false);
  });
});
