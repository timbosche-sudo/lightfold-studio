import { describe, expect, it } from 'vitest';
import { checkCollarParams, collarProfile, defaultCollarParams, deriveCollarDimensions, DEFAULT_BASE_INTERIOR_DIAMETER } from './collar';
import { checkProfile } from '../core/revolve';

describe('collar dimensions', () => {
  it('uses the specified defaults', () => {
    const p = defaultCollarParams();
    expect(DEFAULT_BASE_INTERIOR_DIAMETER).toBeCloseTo(100.0125, 10);
    expect(p.baseInteriorDiameter).toBeCloseTo(100.0125, 10);
    expect(p.fitClearance).toBe(0.4);
    expect(p.insertionHeight).toBeCloseTo(12.7, 10);
    expect(p.wallThickness).toBeCloseTo(1.5875, 10);
    expect(p.shoulderHeight).toBeCloseTo(3.175, 10);
    expect(p.retentionLip.enabled || p.alignmentKey.enabled || p.magnetPockets.enabled).toBe(false);
  });

  it('applies diametral clearance to the base interior diameter', () => {
    const p = defaultCollarParams();
    for (const [c, od] of [[0.2, 99.8125], [0.4, 99.6125], [0.6, 99.4125]] as const) {
      expect(deriveCollarDimensions({ ...p, fitClearance: c }).insertionOuterDiameter).toBeCloseTo(od, 10);
    }
  });

  it('recalculates when base diameter changes', () => {
    const p = { ...defaultCollarParams(), baseInteriorDiameter: 120, shoulderOuterDiameter: 126 };
    const d = deriveCollarDimensions(p);
    expect(d.insertionOuterDiameter).toBeCloseTo(119.6, 10);
    expect(d.innerDiameter).toBeCloseTo(119.6 - 2 * 1.5875, 10);
    expect(d.shoulderRadialOverlap).toBeCloseTo(3, 10);
  });

  it('places the attachment boundary at the shoulder top outer edge', () => {
    const p = defaultCollarParams();
    const d = deriveCollarDimensions(p);
    expect(d.attachment.z).toBeCloseTo(12.7 + 3.175, 10);
    expect(d.attachment.radius).toBeCloseTo(p.shoulderOuterDiameter / 2, 10);
  });

  it('produces valid profiles with and without lip and shoulder', () => {
    const p = defaultCollarParams();
    expect(checkProfile(collarProfile(p))).toEqual([]);
    expect(checkProfile(collarProfile(p, { includeShoulder: false }))).toEqual([]);
    expect(checkProfile(collarProfile({ ...p, retentionLip: { enabled: true, width: 1.5, height: 1.2 } }))).toEqual([]);
    expect(checkProfile(collarProfile({ ...p, leadInChamfer: 0 }))).toEqual([]);
  });

  it('flags a shoulder that would drop into the base', () => {
    const p = { ...defaultCollarParams(), shoulderOuterDiameter: 99 };
    const issues = checkCollarParams(p, 0.8, 1.2);
    expect(issues.some((i) => i.severity === 'error' && i.field === 'shoulderOuterDiameter')).toBe(true);
  });

  it('defaults produce no errors', () => {
    expect(checkCollarParams(defaultCollarParams(), 0.8, 1.2).filter((i) => i.severity === 'error')).toEqual([]);
  });
});
