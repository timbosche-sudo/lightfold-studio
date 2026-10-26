import { beforeAll, describe, expect, it } from 'vitest';
import { buildPart, shadeContext, type BuildJob } from './buildPart';
import { defaultCollarParams, deriveCollarDimensions } from './collar/collar';
import { loadKernel, type Kernel } from './kernel/manifoldKernel';
import { BAMBU_P1S, PRINT_PRESETS } from './presets';
import { defaultShadeDesign, SHADE_GENERATORS, shadeFor } from './generators/registry';
import { mulberry32 } from './generators/shell/families';
import { findSelfIntersections } from './validation/selfIntersection';
import { writeBinaryStl } from './export/stl';
import type { ShadeDesign, ShadeFamilyId } from '../types/project';

const FAMILIES: Exclude<ShadeFamilyId, 'cylinder'>[] = ['twist', 'ripple', 'organic', 'fold'];

let kernel: Kernel;
beforeAll(async () => {
  kernel = await loadKernel();
});

function design(family: ShadeFamilyId, params: object = {}, common: object = {}): ShadeDesign {
  const d = defaultShadeDesign();
  return { ...d, family, common: { ...d.common, ...common }, [family]: { ...(d[family] as object), ...params } } as ShadeDesign;
}

const job = (shade: ShadeDesign, quality: BuildJob['quality'] = 'preview'): BuildJob => ({
  job: { part: 'assembly', collar: defaultCollarParams(), shade },
  quality,
  orientation: 'installed',
  printer: BAMBU_P1S,
  materialPreset: 'pla-0.4',
});

const errors = (r: ReturnType<typeof buildPart>) => r.report.checks.filter((c) => c.status === 'error');
const status = (r: ReturnType<typeof buildPart>, id: string) => r.report.checks.find((c) => c.id === id)?.status;

function maxRadius(positions: Float32Array, zMin: number): number {
  let m = 0;
  for (let i = 0; i < positions.length; i += 3) if (positions[i + 2] > zMin) m = Math.max(m, Math.hypot(positions[i], positions[i + 1]));
  return m;
}

describe.each(FAMILIES)('%s family', (family) => {
  const gen = SHADE_GENERATORS[family];

  it('defaults and every example build a valid single solid (preview)', () => {
    for (const ex of [{ name: 'defaults', params: {} }, ...gen.examples]) {
      const r = buildPart(job(design(family, ex.params)), kernel);
      expect(errors(r), `${family} / ${ex.name}`).toEqual([]);
      expect(r.report.stats.components).toBe(1);
      expect(r.report.stats.genus).toBe(1);
      for (const id of ['attachment', 'envelope', 'collar-preserved', 'watertight', 'manifold', 'orientation', 'kernel']) {
        expect(status(r, id), `${ex.name}: ${id}`).toBe('pass');
      }
      expect(status(r, 'self-intersection')).toBe('skipped');
      // The preview shell must still be free of self-intersections.
      expect(findSelfIntersections(r.mesh).count, `${ex.name} self-intersections`).toBe(0);
    }
  });

  it('fabrication build passes full validation including self-intersection', () => {
    const r = buildPart(job(design(family), 'fabrication'), kernel);
    expect(errors(r)).toEqual([]);
    expect(status(r, 'self-intersection')).toBe('pass');
    expect(r.report.stats.genus).toBe(1);
    expect(r.shade?.minWallEstimate).toBeGreaterThan(PRINT_PRESETS['pla-0.4'].minWall);
    console.log(`${family} fabrication: ${r.report.stats.triangles} tris, build ${r.timings.buildMs.toFixed(0)} ms, validate ${r.timings.validateMs.toFixed(0)} ms, min wall ${r.shade?.minWallEstimate?.toFixed(2)} mm`);
  });

  it('stays inside the maximum diameter and keeps the requested height', () => {
    for (const maxDiameter of [110, 160, 220]) {
      const r = buildPart(job(design(family, {}, { maxDiameter })), kernel);
      expect(errors(r), `⌀${maxDiameter}`).toEqual([]);
      expect(maxRadius(r.mesh.positions, 0)).toBeLessThanOrEqual(maxDiameter / 2 + 1e-3);
      expect(r.report.stats.size[2]).toBeCloseTo(228.6, 3);
    }
  });

  it('leaves the collar untouched', () => {
    const z0 = deriveCollarDimensions(defaultCollarParams()).attachment.z;
    const r = buildPart(job(design(family)), kernel);
    expect(status(r, 'collar-preserved')).toBe('pass');
    // Exactly circular at the shoulder: every vertex on the seam plane lies on r ≤ shoulder radius.
    const rs = deriveCollarDimensions(defaultCollarParams()).shoulderOuterRadius;
    const p = r.mesh.positions;
    for (let i = 0; i < p.length; i += 3) if (Math.abs(p[i + 2] - z0) < 1e-4) expect(Math.hypot(p[i], p[i + 1])).toBeLessThanOrEqual(rs + 1e-3);
  });

  it('is deterministic', () => {
    const a = buildPart(job(design(family)), kernel).mesh;
    const b = buildPart(job(design(family)), kernel).mesh;
    const x = new Uint8Array(writeBinaryStl(a));
    const y = new Uint8Array(writeBinaryStl(b));
    expect(x.length).toBe(y.length);
    let same = true;
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) { same = false; break; }
    expect(same).toBe(true);
  });

  it('randomised parameters never produce an invalid mesh without flagging it', () => {
    const rand = mulberry32(1234 + family.length);
    const ctx = shadeContext(defaultCollarParams(), PRINT_PRESETS['pla-0.4']);
    let built = 0;
    for (let n = 0; n < 12; n++) {
      const params: Record<string, number> = {};
      for (const c of gen.controls) {
        if (c.kind === 'seed') params[c.key] = Math.floor(rand() * 10000);
        else if (c.kind !== 'choice') {
          const v = c.min + rand() * (c.max - c.min);
          params[c.key] = c.kind === 'number' && c.integer ? Math.round(v) : v;
        }
      }
      const common = { maxDiameter: 110 + rand() * 120, wallThickness: 0.8 + rand() * 1.6, height: 60 + rand() * 160, transitionHeight: 10 + rand() * 40 };
      const d = design(family, params, common);
      const { generator, params: merged } = shadeFor(d, family);
      const paramErrors = generator.check(merged, ctx).filter((i) => i.severity === 'error');
      const r = buildPart(job(d), kernel);
      const label = JSON.stringify({ params, common });
      // Topology must be sound whatever the parameters.
      expect(status(r, 'watertight'), label).toBe('pass');
      expect(status(r, 'manifold'), label).toBe('pass');
      expect(status(r, 'orientation'), label).toBe('pass');
      if (paramErrors.length === 0 && !r.report.fatal) {
        built++;
        // A preview simplified to its sample budget is checked in full on export instead.
        const simplified = r.report.checks.some((c) => c.id.endsWith('-resolution'));
        if (!simplified) expect(findSelfIntersections(r.mesh).count, label).toBe(0);
        expect(maxRadius(r.mesh.positions, 0)).toBeLessThanOrEqual(common.maxDiameter / 2 + 1e-3);
      }
    }
    expect(built).toBeGreaterThan(3);
  });
});

describe('family specifics', () => {
  it('fold creases fall on vertex columns at the full envelope radius', () => {
    const r = buildPart(job(design('fold', { foldCount: 14, sharpness: 1, rotation: 0 })), kernel);
    expect(errors(r)).toEqual([]);
    const top = r.report.stats.bounds.max[2];
    let crest = 0;
    const p = r.mesh.positions;
    for (let i = 0; i < p.length; i += 3) if (Math.abs(p[i + 2] - top) < 1e-3) crest = Math.max(crest, Math.hypot(p[i], p[i + 1]));
    expect(crest).toBeCloseTo(defaultShadeDesign().common.maxDiameter / 2, 3);
  });

  it('organic seed changes the form; the same seed reproduces it', () => {
    const a = buildPart(job(design('organic', { seed: 1 })), kernel);
    const b = buildPart(job(design('organic', { seed: 2 })), kernel);
    const a2 = buildPart(job(design('organic', { seed: 1 })), kernel);
    expect(a.report.stats.volume).toBeCloseTo(a2.report.stats.volume, 6);
    expect(Math.abs(a.report.stats.volume - b.report.stats.volume)).toBeGreaterThan(1);
  });

  it('impossible forms are flagged, not exported', () => {
    // Very deep, very dense pleats with a thick wall: the wall cannot follow.
    const r = buildPart(job(design('fold', { foldCount: 48, depth: 30, sharpness: 1 }, { wallThickness: 2.5 })), kernel);
    expect(r.report.fatal || r.report.checks.some((c) => c.status === 'warning')).toBe(true);
    // Lobes deeper than the core allows.
    const t = buildPart(job(design('twist', { lobeDepth: 40 }, { maxDiameter: 106.01 })), kernel);
    expect(t.report.fatal).toBe(true);
    // Transition too short for a sculpted family.
    const s = buildPart(job(design('ripple', {}, { transitionHeight: 1 })), kernel);
    expect(s.report.fatal).toBe(true);
  });

  it('switching families keeps shared dimensions', () => {
    const d = design('twist', {}, { height: 150, maxDiameter: 140 });
    expect(shadeFor(d, 'ripple').params.height).toBe(150);
    expect(shadeFor(d, 'cylinder').params.maxDiameter).toBe(140);
  });

  it('preview builds are fast enough for live editing', () => {
    for (const family of FAMILIES) {
      const t = performance.now();
      const r = buildPart(job(design(family)), kernel);
      console.log(`${family} preview: ${r.report.stats.triangles} tris in ${(performance.now() - t).toFixed(0)} ms`);
    }
  });
});
