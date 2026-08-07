/**
 * Minimal Code 128 (subset B) encoder producing SVG.
 *
 * Written in-house rather than pulling in a barcode dependency: the codes this
 * system prints (SVV-2026-000123, RM-20260715-001) are plain uppercase
 * alphanumeric + hyphen, which subset B covers completely. Keeps the dependency
 * surface small and the logic unit-testable.
 *
 * Reference: ISO/IEC 15417. Each symbol is 6 alternating bar/space widths
 * (the stop symbol has 7). Checksum = (startCode + sum(value_i * i)) mod 103.
 */

// Width patterns for Code 128 values 0..106 (106 = stop).
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
  '211214', '211232', '2331112',
];

const START_B = 104;
const STOP = 106;

/** Code 128 subset B maps printable ASCII 32..126 to values 0..94. */
function charToValue(ch: string): number {
  const code = ch.charCodeAt(0);
  if (code < 32 || code > 126) {
    throw new Error(`Character '${ch}' (code ${code}) is not encodable in Code 128 subset B`);
  }
  return code - 32;
}

/**
 * Returns the full symbol value sequence: [START_B, ...data, checksum, STOP].
 * Exported for testing - the checksum is the part most worth asserting on.
 */
export function code128Values(text: string): number[] {
  if (!text) throw new Error('Cannot encode an empty string');

  const dataValues = Array.from(text).map(charToValue);

  // Checksum: start value, plus each data value weighted by its 1-based position.
  let sum = START_B;
  dataValues.forEach((value, index) => {
    sum += value * (index + 1);
  });
  const checksum = sum % 103;

  return [START_B, ...dataValues, checksum, STOP];
}

export interface Code128SvgOptions {
  /** Width of one module (narrowest bar) in px. Default 2. */
  moduleWidth?: number;
  /** Bar height in px. Default 60. */
  height?: number;
  /** Print the human-readable text under the bars. Default true. */
  includeText?: boolean;
  /** Quiet zone in modules on each side. Spec minimum is 10. Default 10. */
  quietZone?: number;
}

/**
 * Encodes `text` as a Code 128-B barcode and returns a standalone SVG string.
 */
export function code128Svg(text: string, options: Code128SvgOptions = {}): string {
  const moduleWidth = options.moduleWidth ?? 2;
  const height = options.height ?? 60;
  const includeText = options.includeText ?? true;
  const quietZone = options.quietZone ?? 10;

  const values = code128Values(text);

  // Flatten symbol patterns into alternating bar/space widths, starting with a bar.
  const bars: Array<{ x: number; width: number }> = [];
  let cursor = quietZone;

  for (const value of values) {
    const pattern = PATTERNS[value];
    for (let i = 0; i < pattern.length; i++) {
      const width = parseInt(pattern[i], 10);
      // Even index = bar, odd index = space.
      if (i % 2 === 0) {
        bars.push({ x: cursor, width });
      }
      cursor += width;
    }
  }

  const totalModules = cursor + quietZone;
  const svgWidth = totalModules * moduleWidth;
  const textHeight = includeText ? 18 : 0;
  const svgHeight = height + textHeight;

  const rects = bars
    .map(
      (bar) =>
        `<rect x="${(bar.x * moduleWidth).toFixed(2)}" y="0" ` +
        `width="${(bar.width * moduleWidth).toFixed(2)}" height="${height}" fill="#000"/>`,
    )
    .join('');

  const label = includeText
    ? `<text x="${(svgWidth / 2).toFixed(2)}" y="${height + 14}" ` +
      `font-family="monospace" font-size="13" text-anchor="middle" fill="#000">` +
      `${escapeXml(text)}</text>`
    : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth.toFixed(2)}" ` +
    `height="${svgHeight}" viewBox="0 0 ${svgWidth.toFixed(2)} ${svgHeight}">` +
    `<rect width="100%" height="100%" fill="#fff"/>${rects}${label}</svg>`
  );
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
