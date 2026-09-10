import { letterheadHeading } from '../../../src/templates/prescription-pdf/letterhead-heading';
import { letterheadImageFitCss, letterheadTypePt } from '../../../src/types/letterhead';

describe('letterheadHeading', () => {
  it('uses practice name so Classic is not two doctor names', () => {
    expect(letterheadHeading('Dr. Zurb', 'Dr Abhishek Sahil')).toBe(
      'Dr Abhishek Sahil'
    );
  });

  it('falls back to the doctor name when practice name is empty', () => {
    expect(letterheadHeading('Dr. Test', '  ')).toBe('Dr. Test');
  });
});

describe('letterheadImageFitCss', () => {
  it('maps product tokens to CSS object-fit', () => {
    expect(letterheadImageFitCss('fit')).toBe('contain');
    expect(letterheadImageFitCss('fill')).toBe('cover');
    expect(letterheadImageFitCss('stretch')).toBe('fill');
    expect(letterheadImageFitCss(undefined)).toBe('cover');
  });
});

describe('letterheadTypePt', () => {
  it('maps text-size tokens to print points', () => {
    expect(letterheadTypePt('headerTitle', 'small')).toBe(12);
    expect(letterheadTypePt('headerTitle', 'medium')).toBe(14);
    expect(letterheadTypePt('headerTitle', 'large')).toBe(17);
    expect(letterheadTypePt('bodyLabel', 'large')).toBeGreaterThan(
      letterheadTypePt('bodyLabel', 'medium')
    );
    expect(letterheadTypePt('bodyText', undefined)).toBe(10);
  });
});
