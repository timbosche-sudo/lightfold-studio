import { describe, expect, it } from 'vitest';
import { newProject, normalizeProject } from './projectFactory';

describe('project schema', () => {
  it('round-trips through JSON', () => {
    const p = newProject('Test');
    p.collar.fitClearance = 0.3;
    const back = normalizeProject(JSON.parse(JSON.stringify(p)));
    expect(back).toEqual(p);
  });

  it('fills missing fields from defaults', () => {
    const p = normalizeProject({ schemaVersion: 1, name: 'Partial', collar: { baseInteriorDiameter: 110 } });
    expect(p.collar.baseInteriorDiameter).toBe(110);
    expect(p.collar.fitClearance).toBe(0.4);
    expect(p.calibration.testClearances).toEqual([0.2, 0.4, 0.6]);
    expect(p.fabrication.printer.buildVolume).toEqual([256, 256, 256]);
  });

  it('rejects unknown schema versions and garbage', () => {
    expect(() => normalizeProject({ schemaVersion: 99 })).toThrow();
    expect(() => normalizeProject('nope')).toThrow();
  });
});

describe('Phase 1 → Phase 2 migration', () => {
  it('gives Phase 1 projects (shade: null) the default shade, keeping collar settings', () => {
    const p1 = { ...newProject('Old'), shade: null } as unknown as Record<string, unknown>;
    (p1.collar as { fitClearance: number }).fitClearance = 0.6;
    p1.revisions = [{ id: 'r1', savedAt: '2026-01-01', label: 'Saved', content: { ...(p1 as object), shade: null } }];
    const p = normalizeProject(JSON.parse(JSON.stringify(p1)));
    expect(p.shade.family).toBe('cylinder');
    expect(p.shade.common.wallThickness).toBe(1.2);
    expect(p.collar.fitClearance).toBe(0.6);
    expect(p.revisions[0].content.shade.family).toBe('cylinder');
  });
});

describe('Phase 2 → Phase 3 migration', () => {
  it('moves shared dimensions out of the cylinder params and adds the new families', () => {
    const p2 = {
      ...newProject('Phase 2'),
      shade: { family: 'cylinder', cylinder: { height: 150, maxDiameter: 140, wallThickness: 1.6, transitionHeight: 30, transitionProfile: 'linear' } },
    } as unknown as Record<string, unknown>;
    const p = normalizeProject(JSON.parse(JSON.stringify(p2)));
    expect(p.shade.family).toBe('cylinder');
    expect(p.shade.common).toEqual({ height: 150, maxDiameter: 140, wallThickness: 1.6, transitionHeight: 30 });
    expect(p.shade.cylinder).toEqual({ transitionProfile: 'linear' });
    expect(p.shade.twist.lobes).toBeGreaterThan(1);
    expect(p.shade.fold.foldCount).toBeGreaterThan(2);
  });

  it('keeps Phase 3 family settings and rejects non-finite values', () => {
    const p = newProject('P3');
    p.shade.family = 'organic';
    p.shade.organic.seed = 99;
    expect(normalizeProject(JSON.parse(JSON.stringify(p))).shade.organic.seed).toBe(99);
    const bad = JSON.parse(JSON.stringify(p));
    bad.shade.twist.lobes = null;
    // Wrong-typed values fall back to defaults rather than corrupting the design.
    expect(normalizeProject(bad).shade.twist.lobes).toBe(6);
  });
});
