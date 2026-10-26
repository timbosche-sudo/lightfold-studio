import type { DisplayUnits } from '../types/project';

export const MM_PER_INCH = 25.4;

export const inToMm = (inches: number): number => inches * MM_PER_INCH;
export const mmToIn = (mm: number): number => mm / MM_PER_INCH;

export function toDisplay(mm: number, units: DisplayUnits): number {
  return units === 'mm' ? mm : mmToIn(mm);
}

export function fromDisplay(value: number, units: DisplayUnits): number {
  return units === 'mm' ? value : inToMm(value);
}

/** Nearest fraction with a power-of-two denominator up to 64ths, if close enough. */
export function inchFraction(inches: number, tolerance = 0.0005): string | null {
  const sign = inches < 0 ? '-' : '';
  const abs = Math.abs(inches);
  const whole = Math.floor(abs + 1e-9);
  const frac = abs - whole;
  const sixtyFourths = Math.round(frac * 64);
  if (Math.abs(frac - sixtyFourths / 64) > tolerance) return null;
  if (sixtyFourths === 0) return `${sign}${whole}"`;
  if (sixtyFourths === 64) return `${sign}${whole + 1}"`;
  let num = sixtyFourths;
  let den = 64;
  while (num % 2 === 0) {
    num /= 2;
    den /= 2;
  }
  return whole > 0 ? `${sign}${whole} ${num}/${den}"` : `${sign}${num}/${den}"`;
}

export function formatLength(mm: number, units: DisplayUnits, digits?: number): string {
  if (!Number.isFinite(mm)) return '—';
  if (units === 'mm') return `${roundTo(mm, digits ?? 3)} mm`;
  return `${roundTo(mmToIn(mm), digits ?? 4)}"`;
}

/** Value-only string for numeric inputs (no unit suffix). */
export function formatInputValue(mm: number, units: DisplayUnits): string {
  return String(roundTo(toDisplay(mm, units), units === 'mm' ? 4 : 5));
}

export function roundTo(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/**
 * Parse a length typed by the user. Accepts decimals, mixed fractions
 * ("3 15/16"), plain fractions ("15/16") and optional unit suffixes
 * (mm, cm, in, ", inch). Unsuffixed values use the current display units.
 * Returns millimetres, or null if unparseable.
 */
export function parseLength(input: string, units: DisplayUnits): number | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  let unit: DisplayUnits | 'cm' = units;
  const suffix = s.match(/(mm|cm|inches|inch|in|"|”)$/);
  if (suffix) {
    const u = suffix[1];
    unit = u === 'mm' ? 'mm' : u === 'cm' ? 'cm' : 'in';
    s = s.slice(0, -u.length).trim();
  }
  let value: number | null = null;
  const mixed = s.match(/^(-?\d+(?:\.\d+)?)\s+(\d+)\s*\/\s*(\d+)$/);
  const frac = s.match(/^(-?\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const f = Number(mixed[2]) / Number(mixed[3]);
    value = whole < 0 ? whole - f : whole + f;
  } else if (frac) {
    value = Number(frac[1]) / Number(frac[2]);
  } else if (/^-?(\d+\.?\d*|\.\d+)$/.test(s)) {
    value = Number(s);
  }
  if (value === null || !Number.isFinite(value)) return null;
  if (unit === 'cm') return value * 10;
  return fromDisplay(value, unit);
}
