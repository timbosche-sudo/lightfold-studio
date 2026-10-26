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
