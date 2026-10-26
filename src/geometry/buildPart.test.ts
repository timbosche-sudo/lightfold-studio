import { beforeAll, describe, expect, it } from 'vitest';
import { buildPart, type BuildJob } from './buildPart';
import { defaultCollarParams, deriveCollarDimensions } from './collar/collar';
import { loadKernel, type Kernel, toManifold } from './kernel/manifoldKernel';
import { BAMBU_P1S } from './presets';
import { parseBinaryStl, writeBinaryStl } from './export/stl';
import { validateMesh } from './validation/validateMesh';
import { computeBounds, signedVolume } from './core/mesh';
import type { CollarParams } from '../types/project';


/** Largest vertex radius in the insertion band (excludes the wider shoulder). */
function insertionRadius(mesh: { positions: Float32Array }, zMin: number, zMax: number, rLimit: number): number {
  let rMax = 0;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const z = mesh.positions[i + 2];
    const r = Math.hypot(mesh.positions[i], mesh.positions[i + 1]);
    if (z >= zMin - 1e-4 && z <= zMax + 1e-4 && r < rLimit) rMax = Math.max(rMax, r);
  }
  return rMax;
}

let kernel: Kernel;
beforeAll(async () => {
  kernel = await loadKernel();
});

const collarJob = (collar: CollarParams, extra: Partial<BuildJob> = {}): BuildJob => ({
  job: { part: 'collar', collar },
  quality: 'fabrication',
  orientation: 'installed',
  printer: BAMBU_P1S,
  materialPreset: 'pla-0.4',
  ...extra,
});

describe('collar build', () => {
  it('default collar is a valid watertight solid with expected dimensions', () => {
    const p = defaultCollarParams();
    const { mesh, report } = buildPart(collarJob(p), kernel);
    const failing = report.checks.filter((c) => c.status === 'error');
    expect(failing).toEqual([]);
    const b = computeBounds(mesh);
    expect(b.max[2] - b.min[2]).toBeCloseTo(12.7 + 3.175, 4);
    expect(b.max[0]).toBeCloseTo(p.shoulderOuterDiameter / 2, 3);
    expect(report.stats.genus).toBe(1);
  });

  it('insertion outer radius equals (ID - clearance)/2 in the mesh', () => {
    const p = defaultCollarParams();
    const { mesh } = buildPart(collarJob(p), kernel);
    const d = deriveCollarDimensions(p);
    const rMax = insertionRadius(mesh, p.leadInChamfer, p.insertionHeight, (d.insertionOuterRadius + d.shoulderOuterRadius) / 2);
    expect(rMax).toBeCloseTo(d.insertionOuterRadius, 4);
    expect(rMax * 2).toBeCloseTo(99.6125, 4);
  });

  it('exports an STL that reparses to the same watertight solid', () => {
    const { mesh } = buildPart(collarJob(defaultCollarParams()), kernel);
    const stl = writeBinaryStl(mesh, 'test');
    const { mesh: back, header } = parseBinaryStl(stl);
    expect(header).toBe('test');
    expect(back.indices.length).toBe(mesh.indices.length);
    const r = validateMesh(back, { kernel });
    expect(r.checks.filter((c) => c.status === 'error')).toEqual([]);
    expect(signedVolume(back)).toBeCloseTo(signedVolume(mesh), 0);
    const m = toManifold(kernel, back);
    expect(m.status()).toBe('NoError');
    expect(m.volume()).toBeCloseTo(signedVolume(mesh), 0);
    m.delete();
  });

  it('inverted orientation keeps volume and sits on z = 0', () => {
    const p = defaultCollarParams();
    const a = buildPart(collarJob(p), kernel);
    const b = buildPart(collarJob(p, { orientation: 'inverted' }), kernel);
    expect(b.report.fatal).toBe(false);
    expect(computeBounds(b.mesh).min[2]).toBeCloseTo(0, 5);
    expect(signedVolume(b.mesh)).toBeCloseTo(signedVolume(a.mesh), 3);
  });

  it('is deterministic', () => {
    const p = defaultCollarParams();
    const a = buildPart(collarJob(p), kernel).mesh;
    const b = buildPart(collarJob(p), kernel).mesh;
    expect(new Uint8Array(writeBinaryStl(a))).toEqual(new Uint8Array(writeBinaryStl(b)));
  });

  it('applies key, lip and magnet pockets as a single valid solid', () => {
    const base = defaultCollarParams();
    const p: CollarParams = {
      ...base,
      shoulderOuterDiameter: 110,
      retentionLip: { enabled: true, width: 1.5, height: 1.2 },
      alignmentKey: { enabled: true, width: 3, depth: 1.5 },
      magnetPockets: { enabled: true, count: 3, diameter: 3, depth: 1.5 },
    };
    const plain = buildPart(collarJob({ ...p, alignmentKey: { ...p.alignmentKey, enabled: false }, magnetPockets: { ...p.magnetPockets, enabled: false } }), kernel);
    const { report, mesh } = buildPart(collarJob(p), kernel);
    expect(report.checks.filter((c) => c.status === 'error')).toEqual([]);
    expect(report.stats.components).toBe(1);
    const pocketVol = 3 * Math.PI * 1.5 ** 2 * 1.5;
    const keyVol = 1.5 * 3 * (12.7 - 0.6 - 0.2); // approx; rib meets a curved wall
    const delta = signedVolume(mesh) - signedVolume(plain.mesh);
    expect(delta).toBeGreaterThan(keyVol - pocketVol - 10);
    expect(delta).toBeLessThan(keyVol - pocketVol + 10);
  });

  it('rejects parameters that would drop the collar into the base', () => {
    const p = { ...defaultCollarParams(), shoulderOuterDiameter: 95 };
    expect(buildPart(collarJob(p), kernel).report.fatal).toBe(true);
  });
});

describe('fit-test rings', () => {
  for (const [clearance, od] of [[0.2, 99.8125], [0.4, 99.6125], [0.6, 99.4125]] as const) {
    it(`clearance ${clearance} mm gives OD ${od} mm and a valid solid`, () => {
      const collar = defaultCollarParams();
      const { mesh, report } = buildPart(
        {
          job: { part: 'fit-test', collar, fitTest: { height: 10, includeShoulder: true, idNotches: true }, clearance, label: 2 },
          quality: 'fabrication',
          orientation: 'installed',
          printer: BAMBU_P1S,
          materialPreset: 'pla-0.4',
        },
        kernel,
      );
      expect(report.checks.filter((c) => c.status === 'error')).toEqual([]);
      const b = computeBounds(mesh);
      expect(b.max[2] - b.min[2]).toBeCloseTo(10 + collar.shoulderHeight, 4);
      const d = deriveCollarDimensions({ ...collar, fitClearance: clearance });
      const rMax = insertionRadius(mesh, collar.leadInChamfer, 10, (d.insertionOuterRadius + d.shoulderOuterRadius) / 2);
      expect(rMax * 2).toBeCloseTo(od, 3);
    });
  }

  it('builds a ring without shoulder', () => {
    const { report } = buildPart(
      {
        job: { part: 'fit-test', collar: defaultCollarParams(), fitTest: { height: 5, includeShoulder: false, idNotches: true }, clearance: 0.4, label: 3 },
        quality: 'preview',
        orientation: 'installed',
        printer: BAMBU_P1S,
        materialPreset: 'pla-0.4',
      },
      kernel,
    );
    expect(report.checks.filter((c) => c.status === 'error')).toEqual([]);
  });
});
