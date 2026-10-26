import { beforeAll, describe, expect, it } from 'vitest';
import { buildPart, shadeContext, type BuildJob } from './buildPart';
import { defaultCollarParams, deriveCollarDimensions } from './collar/collar';
import { loadKernel, type Kernel, toManifold } from './kernel/manifoldKernel';
import { BAMBU_P1S, PRINT_PRESETS } from './presets';
import { defaultShadeDesign } from './generators/registry';
import { cylinderShade, cylinderShadeProfile, defaultCommonParams } from './generators/cylinder';
import { checkProfile, revolveProfile } from './core/revolve';
import { computeBounds, signedVolume } from './core/mesh';
import { parseBinaryStl, writeBinaryStl } from './export/stl';
import { validateMesh } from './validation/validateMesh';
import type { CollarParams, CylinderShadeParams, ShadeDesign } from '../types/project';

let kernel: Kernel;
beforeAll(async () => {
  kernel = await loadKernel();
});

/** Full cylinder parameters (shared dimensions + family). */
const cyl = (patch: Partial<CylinderShadeParams> = {}): CylinderShadeParams => ({ ...defaultCommonParams(), ...cylinderShade.defaults(), ...patch });

const shadeWith = (patch: Partial<CylinderShadeParams>): ShadeDesign => {
  const s = defaultShadeDesign();
  const { transitionProfile, ...common } = patch;
  return { ...s, common: { ...s.common, ...common }, cylinder: { transitionProfile: transitionProfile ?? s.cylinder.transitionProfile } };
};

const job = (collar: CollarParams, shade: ShadeDesign, quality: BuildJob['quality'] = 'fabrication'): BuildJob => ({
  job: { part: 'assembly', collar, shade },
  quality,
  orientation: 'inverted', // ignored for assemblies
  printer: BAMBU_P1S,
  materialPreset: 'pla-0.4',
});

const errors = (r: ReturnType<typeof buildPart>) => r.report.checks.filter((c) => c.status === 'error');

/** Volume of the part of a mesh below z, via the kernel. */
function volumeBelow(mesh: Parameters<typeof toManifold>[1], z: number): number {
  const m = toManifold(kernel, mesh);
  const below = m.trimByPlane([0, 0, -1], -z);
  const v = below.volume();
  m.delete();
  below.delete();
  return v;
}

describe('cylinder shade generator', () => {
  const ctx = shadeContext(defaultCollarParams(), PRINT_PRESETS['pla-0.4']);

  it('defaults give a 9 inch overall height and a 5 inch body', () => {
    const s = cyl();
    expect(ctx.attachment.z + s.height).toBeCloseTo(228.6, 6);
    expect(s.maxDiameter).toBeCloseTo(127, 6);
    expect(cylinderShade.check(s, ctx).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('profiles are simple closed polygons for smooth, linear and straight variants', () => {
    for (const patch of [{}, { transitionProfile: 'linear' as const }, { maxDiameter: ctx.attachment.radius * 2 }, { transitionHeight: 150 }]) {
      const p = cyl(patch);
      expect(checkProfile(cylinderShadeProfile(p, ctx, 24))).toEqual([]);
    }
  });

  it('starts exactly at the shoulder outer radius', () => {
    const prof = cylinderShadeProfile(cyl(), ctx, 16);
    const atSeam = prof.filter(([, z]) => Math.abs(z - ctx.attachment.z) < 1e-9).map(([r]) => r);
    expect(Math.max(...atSeam)).toBeCloseTo(ctx.attachment.radius, 9);
  });

  it('keeps the specified wall thickness normal to the surface', () => {
    const p = cyl({ transitionProfile: 'linear' });
    const mesh = revolveProfile(cylinderShadeProfile(p, ctx, 8), 64);
    expect(validateMesh(mesh).fatal).toBe(false);
    // Linear flare: horizontal offset = t * sqrt(1 + slope²).
    const prof = cylinderShadeProfile(p, ctx, 8);
    const slope = (p.maxDiameter / 2 - ctx.attachment.radius) / p.transitionHeight;
    const midOuter = prof.find(([, z]) => Math.abs(z - (ctx.attachment.z + p.transitionHeight / 2)) < 1e-9 && true)!;
    const midInner = prof.filter(([, z]) => Math.abs(z - midOuter[1]) < 1e-9).map(([r]) => r);
    expect(Math.max(...midInner) - Math.min(...midInner)).toBeCloseTo(p.wallThickness * Math.sqrt(1 + slope * slope), 9);
  });

  it('rejects a body narrower than the shoulder, a too-thin wall and an over-tall transition', () => {
    const fields = (patch: Partial<CylinderShadeParams>) =>
      cylinderShade.check(cyl(patch), ctx).filter((i) => i.severity === 'error').map((i) => i.field);
    expect(fields({ maxDiameter: 90 })).toContain('maxDiameter');
    expect(fields({ wallThickness: 0.5 })).toContain('wallThickness');
    expect(fields({ wallThickness: 6 })).toContain('wallThickness');
    expect(fields({ transitionHeight: 400 })).toContain('transitionHeight');
    expect(fields({ transitionHeight: 0 })).toContain('transitionHeight');
  });

  it('warns about steep transitions', () => {
    const issues = cylinderShade.check(cyl({ maxDiameter: 200, transitionHeight: 20 }), ctx);
    expect(issues.some((i) => i.severity === 'warning' && i.field === 'transitionHeight')).toBe(true);
  });
});

describe('shade + collar assembly', () => {
  it('default assembly is one watertight solid with all checks passing', () => {
    const r = buildPart(job(defaultCollarParams(), defaultShadeDesign()), kernel);
    expect(errors(r)).toEqual([]);
    expect(r.report.stats.components).toBe(1);
    expect(r.report.stats.genus).toBe(1);
    for (const id of ['attachment', 'envelope', 'collar-preserved', 'watertight', 'manifold', 'self-intersection', 'kernel']) {
      expect(r.report.checks.find((c) => c.id === id)?.status, id).toBe('pass');
    }
    const b = computeBounds(r.mesh);
    expect(b.min[2]).toBeCloseTo(0, 6);
    expect(b.max[2]).toBeCloseTo(228.6, 3);
    expect(b.max[0] - b.min[0]).toBeCloseTo(127, 2);
  });

  it('straight cylinder volume = collar + exact shell above the shoulder', () => {
    const collar = defaultCollarParams();
    const d = deriveCollarDimensions(collar);
    const H = 150;
    const t = 1.6;
    const shade = shadeWith({ maxDiameter: d.shoulderOuterRadius * 2, height: H, wallThickness: t, transitionHeight: 0 });
    const r = buildPart(job(collar, shade), kernel);
    expect(errors(r)).toEqual([]);
    const collarOnly = buildPart({ ...job(collar, shade), job: { part: 'collar', collar } }, kernel);
    const n = 360;
    // Revolved polygons: area factor (n/2π)·sin(2π/n) relative to true circles.
    const k = (n / (2 * Math.PI)) * Math.sin((2 * Math.PI) / n);
    const shell = k * Math.PI * (d.shoulderOuterRadius ** 2 - (d.shoulderOuterRadius - t) ** 2) * H;
    expect(signedVolume(r.mesh)).toBeCloseTo(signedVolume(collarOnly.mesh) + shell, 0);
  });

  it('collar is unchanged when shade parameters change', () => {
    const collar = defaultCollarParams();
    const z0 = deriveCollarDimensions(collar).attachment.z;
    const collarVol = signedVolume(buildPart({ ...job(collar, defaultShadeDesign()), job: { part: 'collar', collar } }, kernel).mesh);
    for (const patch of [{}, { height: 80, maxDiameter: 180, transitionHeight: 60 }, { wallThickness: 2.5, transitionProfile: 'linear' as const }]) {
      const r = buildPart(job(collar, shadeWith(patch)), kernel);
      expect(errors(r)).toEqual([]);
      expect(volumeBelow(r.mesh, z0)).toBeCloseTo(collarVol, 2);
    }
  });

  it('respects the maximum diameter', () => {
    for (const maxDiameter of [110, 150, 200]) {
      const r = buildPart(job(defaultCollarParams(), shadeWith({ maxDiameter, transitionHeight: 80 })), kernel);
      expect(errors(r)).toEqual([]);
      const p = r.mesh.positions;
      let rMax = 0;
      for (let i = 0; i < p.length; i += 3) rMax = Math.max(rMax, Math.hypot(p[i], p[i + 1]));
      expect(rMax).toBeLessThanOrEqual(maxDiameter / 2 + 1e-4);
      expect(rMax).toBeGreaterThan(maxDiameter / 2 - 1e-3);
    }
  });

  it('stays valid with collar features, a retention lip and other collar sizes', () => {
    const collar: CollarParams = {
      ...defaultCollarParams(),
      baseInteriorDiameter: 120,
      shoulderOuterDiameter: 130,
      retentionLip: { enabled: true, width: 1.5, height: 1.2 },
      alignmentKey: { enabled: true, width: 3, depth: 1.5 },
      magnetPockets: { enabled: true, count: 3, diameter: 2.5, depth: 1.5 },
    };
    const r = buildPart(job(collar, shadeWith({ maxDiameter: 160 })), kernel);
    expect(errors(r)).toEqual([]);
    expect(r.report.stats.components).toBe(1);
  });

  it('exported assembly STL re-parses as a watertight solid', () => {
    const r = buildPart(job(defaultCollarParams(), defaultShadeDesign()), kernel);
    const { mesh } = parseBinaryStl(writeBinaryStl(r.mesh));
    const v = validateMesh(mesh, { kernel });
    expect(v.checks.filter((c) => c.status === 'error')).toEqual([]);
    expect(signedVolume(mesh)).toBeCloseTo(signedVolume(r.mesh), 0);
  });

  it('flags a shade that does not fit the printer', () => {
    const r = buildPart(job(defaultCollarParams(), shadeWith({ height: 260 })), kernel);
    expect(r.report.checks.find((c) => c.id === 'build-volume')?.status).toBe('error');
    expect(r.report.fatal).toBe(true);
  });

  it('marks invalid shade parameters as fatal', () => {
    const r = buildPart(job(defaultCollarParams(), shadeWith({ maxDiameter: 80 })), kernel);
    expect(r.report.fatal).toBe(true);
  });

  it('preview builds fast enough for interactive use', () => {
    const t = performance.now();
    const r = buildPart(job(defaultCollarParams(), defaultShadeDesign(), 'preview'), kernel);
    const ms = performance.now() - t;
    expect(errors(r)).toEqual([]);
    console.log(`preview assembly: ${r.report.stats.triangles} tris in ${ms.toFixed(0)} ms (build ${r.timings.buildMs.toFixed(0)}, validate ${r.timings.validateMs.toFixed(0)})`);
    const f = buildPart(job(defaultCollarParams(), defaultShadeDesign()), kernel);
    console.log(`fabrication assembly: ${f.report.stats.triangles} tris (build ${f.timings.buildMs.toFixed(0)}, validate ${f.timings.validateMs.toFixed(0)})`);
  });
});
