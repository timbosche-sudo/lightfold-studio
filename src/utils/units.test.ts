import { describe, expect, it } from 'vitest';
import { formatLength, inchFraction, inToMm, mmToIn, parseLength } from './units';

describe('units', () => {
  it('converts 3 15/16 in to 100.0125 mm', () => {
    expect(inToMm(3 + 15 / 16)).toBeCloseTo(100.0125, 10);
    expect(mmToIn(100.0125)).toBeCloseTo(3.9375, 10);
  });

  it('parses decimals, fractions and suffixes', () => {
    expect(parseLength('3 15/16', 'in')).toBeCloseTo(100.0125, 10);
    expect(parseLength('15/16"', 'mm')).toBeCloseTo(23.8125, 10);
    expect(parseLength('100.0125', 'mm')).toBeCloseTo(100.0125, 10);
    expect(parseLength('3.9375 in', 'mm')).toBeCloseTo(100.0125, 10);
    expect(parseLength('1 cm', 'in')).toBeCloseTo(10, 10);
    expect(parseLength('.5', 'in')).toBeCloseTo(12.7, 10);
    expect(parseLength('abc', 'mm')).toBeNull();
    expect(parseLength('', 'mm')).toBeNull();
  });

  it('formats inch fractions', () => {
    expect(inchFraction(3.9375)).toBe('3 15/16"');
    expect(inchFraction(0.0625)).toBe('1/16"');
    expect(inchFraction(0.123)).toBeNull();
    expect(formatLength(12.7, 'in')).toBe('0.5"');
    expect(formatLength(12.7, 'mm')).toBe('12.7 mm');
  });
});
