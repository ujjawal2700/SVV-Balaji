import { code128Values, code128Svg } from './code128';

const START_B = 104;
const STOP = 106;

describe('code128Values', () => {
  it('produces the documented checksum for the reference string "Wikipedia"', () => {
    // ISO/IEC 15417 worked example - check symbol is 88.
    const values = code128Values('Wikipedia');
    expect(values[0]).toBe(START_B);
    expect(values[values.length - 1]).toBe(STOP);
    expect(values[values.length - 2]).toBe(88);
  });

  it('wraps the frame around the data values', () => {
    const values = code128Values('AB');
    // 'A' = 65-32 = 33, 'B' = 66-32 = 34
    expect(values).toEqual([START_B, 33, 34, (START_B + 33 * 1 + 34 * 2) % 103, STOP]);
  });

  it('encodes a farmer traceability code, hyphens included', () => {
    const values = code128Values('SVV-2026-000001');
    // start + 15 data symbols + checksum + stop
    expect(values).toHaveLength(18);
    expect(values[0]).toBe(START_B);
    expect(values[values.length - 1]).toBe(STOP);
  });

  it('keeps the checksum within the valid 0-102 range across many codes', () => {
    for (let i = 1; i <= 500; i++) {
      const code = `SVV-2026-${String(i).padStart(6, '0')}`;
      const values = code128Values(code);
      const checksum = values[values.length - 2];
      expect(checksum).toBeGreaterThanOrEqual(0);
      expect(checksum).toBeLessThanOrEqual(102);
    }
  });

  it('rejects an empty string', () => {
    expect(() => code128Values('')).toThrow(/empty/i);
  });

  it('rejects characters outside Code 128 subset B', () => {
    expect(() => code128Values('SVVé')).toThrow(/not encodable/i);
  });
});

describe('code128Svg', () => {
  it('renders a well-formed SVG', () => {
    const svg = code128Svg('SVV-2026-000001');
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg.trim()).toMatch(/<\/svg>$/);
    expect(svg).toContain('<rect');
  });

  it('includes the human-readable label by default and omits it when asked', () => {
    expect(code128Svg('SVV-2026-000001')).toContain('SVV-2026-000001</text>');
    expect(code128Svg('SVV-2026-000001', { includeText: false })).not.toContain('<text');
  });

  it('scales width with moduleWidth', () => {
    const narrow = code128Svg('SVV-2026-000001', { moduleWidth: 1 });
    const wide = code128Svg('SVV-2026-000001', { moduleWidth: 4 });
    const widthOf = (svg: string) => Number(svg.match(/width="([\d.]+)"/)![1]);
    expect(widthOf(wide)).toBeCloseTo(widthOf(narrow) * 4, 1);
  });

  it('escapes XML-significant characters in the label', () => {
    const svg = code128Svg('A&B<C');
    expect(svg).toContain('A&amp;B&lt;C');
    expect(svg).not.toMatch(/>A&B<C</);
  });
});
