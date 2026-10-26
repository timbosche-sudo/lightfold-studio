import type { ShadeCommonParams } from '../../../types/project';
import { sweepLoops } from '../../core/sweep';
import { SEGMENTS } from '../../core/quality';
import type {
  ControlSpec,
  FamilyExample,
  ParamIssue,
  Polyline,
  ShadeBuildResult,
  ShadeContext,
  ShadeGenerator,
  ShadeSummary,
} from '../types';

/**
 * Radial-shell engine shared by the sculptural families.
 *
 * A family describes its outer surface as a radius r = F(θ, u) at angle θ and
 * normalised shade height u ∈ [0, 1]. The engine then:
 *   1. fits F inside the maximum-diameter envelope (uniform radial scale),
 *   2. blends it out of the collar shoulder circle over the transition height
 *      with a cosine ease (zero slope at the shoulder, so the wall leaves the
 *      collar vertically and flush),
 *   3. clamps pinched regions to a minimum printable radius,
 *   4. offsets the inner wall radially by t·√(1 + (∂r/r∂θ)² + (∂r/∂z)²) so the
 *      wall is ~t thick measured normal to the surface,
 *   5. stitches outer wall, top rim, inner wall and the overlap tab into one
 *      closed loop per angular column and sweeps them into a watertight solid.
 *
 * Because every height slice is a single star-shaped loop and the inner radius
 * is strictly less than the outer at every sample, the walls cannot cross by
 * construction. Exports still run the full self-intersection test.
 */

export interface FieldEnv {
  /** Envelope radius (maxDiameter / 2). */
  rMax: number;
  /** Collar shoulder outer radius (where the shade starts). */
  rShoulder: number;
  height: number;
  wallThickness: number;
  /** Angular segments of the grid being sampled. */
  segments: number;
}

export interface ShellField {
  /** Outer radius in design space at world angle θ (radians) and height u ∈ [0, 1]. */
  radius(theta: number, u: number): number;
  /**
   * Rotation (radians) of the sampling grid at height u, so creases and lobes
   * that twist stay on grid columns. Must be 0 at u = 0.
   */
  frameRotation?(u: number): number;
}

export interface ShellFamily<F> {
  id: string;
  label: string;
  description: string;
  controls: ControlSpec[];
  examples: FamilyExample<F>[];
  minTransitionHeight: number;
  defaults(): F;
  /** Angular segment counts are rounded up to a multiple of this (e.g. 2 × folds). */
  segmentMultiple?(p: ShadeCommonParams & F): number;
  /** Fewest angular segments that resolve the pattern (≈ 8 per wave). */
  minSegments?(p: ShadeCommonParams & F): number;
  /** Largest row spacing (mm) that resolves the pattern vertically. */
  maxRowSpacing?(p: ShadeCommonParams & F): number;
  makeField(p: ShadeCommonParams & F, env: FieldEnv): ShellField;
  check?(p: ShadeCommonParams & F, ctx: ShadeContext): ParamIssue[];
}

/** Smallest inner radius the engine allows (mm); keeps an opening and a printable core. */
export const MIN_INNER_RADIUS = 12;
/** Cap on the normal-offset factor; beyond it the wall cannot follow the form. */
const MAX_OFFSET_FACTOR = 3.5;

interface Resolution {
  baseSegments: number;
  rowSpacing: number;
  minTransitionRows: number;
  /** Limits on pattern-driven refinement (keeps previews responsive). */
  maxSegments: number;
  minRowSpacing: number;
  /** Fraction of the family's requested density to honour (coarse sketches need less). */
  detail: number;
  /** Most grid samples (segments × rows); beyond it rows are spaced out. */
  maxSamples: number;
}

const RESOLUTION: Record<'coarse' | 'preview' | 'fabrication', Resolution> = {
  coarse: { baseSegments: 96, rowSpacing: 6, minTransitionRows: 6, maxSegments: 256, minRowSpacing: 1.5, detail: 0.5, maxSamples: 12_000 },
  preview: { baseSegments: 120, rowSpacing: 3.5, minTransitionRows: 10, maxSegments: 480, minRowSpacing: 0.8, detail: 1, maxSamples: 50_000 },
  fabrication: { baseSegments: SEGMENTS.fabrication, rowSpacing: 1.25, minTransitionRows: 24, maxSegments: 960, minRowSpacing: 0.4, detail: 1.5, maxSamples: 200_000 },
};

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : (1 - Math.cos(Math.PI * t)) / 2);

export interface ShellGrid {
  N: number;
  rows: number; // M + 1
  z: Float64Array;
  phi: Float64Array;
  R: Float64Array;
  rIn: Float64Array;
  envelopeScale: number;
  pinched: number;
  /** Smallest (capped / required) offset ratio: the wall keeps this fraction of its thickness. */
  minOffsetRatio: number;
  innerTooSmall: number;
  maxOverhangDeg: number;
  overhangFraction: number;
  maxRadius: number;
  /** The pattern needed more samples than the budget allowed at this level. */
  simplified: boolean;
}

function segmentCount<F>(family: ShellFamily<F>, p: ShadeCommonParams & F, res: Resolution): number {
  const m = Math.max(1, Math.round(family.segmentMultiple?.(p) ?? 1));
  const wanted = Math.min(Math.max(res.baseSegments, (family.minSegments?.(p) ?? 0) * res.detail), res.maxSegments);
  return Math.max(m, Math.ceil(wanted / m) * m);
}

function rowHeights<F>(family: ShellFamily<F>, p: ShadeCommonParams & F, z0: number, base: Resolution, segments: number): { z: Float64Array; simplified: boolean } {
  const familySpacing = family.maxRowSpacing?.(p);
  let spacing = familySpacing ? Math.max(base.minRowSpacing, Math.min(base.rowSpacing, familySpacing / base.detail)) : base.rowSpacing;
  // Stay within the sample budget by spacing rows out.
  const budgetSpacing = (segments * p.height) / base.maxSamples;
  const simplified = budgetSpacing > spacing * 1.001 && spacing < base.rowSpacing;
  spacing = Math.max(spacing, budgetSpacing);
  const res = { ...base, rowSpacing: spacing };
  const H = p.height;
  const ht = Math.min(Math.max(p.transitionHeight, 0), H);
  const nt = ht > 0 ? Math.max(res.minTransitionRows, Math.ceil(ht / res.rowSpacing)) : 0;
  const nb = H - ht > 1e-9 ? Math.max(1, Math.ceil((H - ht) / res.rowSpacing)) : 0;
  const z = new Float64Array(nt + nb + 1);
  for (let i = 0; i <= nt; i++) z[i] = z0 + (ht * i) / Math.max(nt, 1);
  for (let k = 1; k <= nb; k++) z[nt + k] = z0 + ht + ((H - ht) * k) / nb;
  return { z, simplified };
}

/** Sample the full shell (outer and inner radius on a θ × z grid). */
export function sampleShell<F>(
  family: ShellFamily<F>,
  p: ShadeCommonParams & F,
  ctx: ShadeContext,
  level: keyof typeof RESOLUTION,
): ShellGrid {
  const res = RESOLUTION[level];
  const N = segmentCount(family, p, res);
  const z0 = ctx.attachment.z;
  const rS = ctx.attachment.radius;
  const rMax = p.maxDiameter / 2;
  const t = p.wallThickness;
  const field = family.makeField(p, { rMax, rShoulder: rS, height: p.height, wallThickness: t, segments: N });
  const { z, simplified } = rowHeights(family, p, z0, res, N);
  const rows = z.length;
  const ht = Math.min(Math.max(p.transitionHeight, 0), p.height);
  const phi = new Float64Array(rows);
  const F = new Float64Array(rows * N);
  const dTheta = (2 * Math.PI) / N;

  let maxF = 0;
  for (let i = 0; i < rows; i++) {
    const u = (z[i] - z0) / p.height;
    phi[i] = i === 0 ? 0 : field.frameRotation?.(u) ?? 0;
    for (let j = 0; j < N; j++) {
      const v = field.radius((j / N) * Math.PI * 2 + phi[i], u);
      F[i * N + j] = v;
      if (v > maxF) maxF = v;
    }
  }
  const envelopeScale = maxF > rMax ? rMax / maxF : 1;

  const rPinch = MIN_INNER_RADIUS + t * MAX_OFFSET_FACTOR;
  const R = new Float64Array(rows * N);
  let pinched = 0;
  let maxRadius = 0;
  for (let i = 0; i < rows; i++) {
    const w = ht > 0 ? ease((z[i] - z0) / ht) : i === 0 ? 0 : 1;
    for (let j = 0; j < N; j++) {
      let r = rS + (F[i * N + j] * envelopeScale - rS) * w;
      if (r < rPinch && i > 0) {
        r = rPinch;
        pinched++;
      }
      R[i * N + j] = r;
      if (r > maxRadius) maxRadius = r;
    }
  }

  // Slopes, inner offset and overhang.
  const rIn = new Float64Array(rows * N);
  let minOffsetRatio = 1;
  let innerTooSmall = 0;
  let maxSinOverhang = 0;
  let steepArea = 0;
  let totalArea = 0;
  const sinLimit = Math.sin((ctx.preset.maxOverhangDeg * Math.PI) / 180);
  const at = (i: number, j: number) => R[i * N + ((j + N) % N)];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < N; j++) {
      const r = at(i, j);
      const dThF = (at(i, j + 1) - r) / dTheta;
      const dThB = (r - at(i, j - 1)) / dTheta;
      const dThC = (dThF + dThB) / 2;
      // Moving up a column also moves the angle by Δφ; remove that to get ∂r/∂z at fixed θ.
      let dzF = 0;
      let dzB = 0;
      if (i < rows - 1) {
        const dThNext = (at(i + 1, j + 1) - at(i + 1, j - 1)) / (2 * dTheta);
        dzF = (at(i + 1, j) - r - ((dThC + dThNext) / 2) * (phi[i + 1] - phi[i])) / (z[i + 1] - z[i]);
      }
      if (i > 0) {
        const dThPrev = (at(i - 1, j + 1) - at(i - 1, j - 1)) / (2 * dTheta);
        dzB = (r - at(i - 1, j) - ((dThC + dThPrev) / 2) * (phi[i] - phi[i - 1])) / (z[i] - z[i - 1]);
      }
      if (i === 0) dzB = dzF;
      if (i === rows - 1) dzF = dzB;
      const gTh = Math.max(Math.abs(dThF), Math.abs(dThB)) / r;
      const gZ = Math.max(Math.abs(dzF), Math.abs(dzB));
      let factor = Math.sqrt(1 + gTh * gTh + gZ * gZ);
      if (factor > MAX_OFFSET_FACTOR) {
        minOffsetRatio = Math.min(minOffsetRatio, MAX_OFFSET_FACTOR / factor);
        factor = MAX_OFFSET_FACTOR;
      }
      const inner = r - t * factor;
      if (inner < MIN_INNER_RADIUS) innerTooSmall++;
      rIn[i * N + j] = Math.max(inner, Math.min(MIN_INNER_RADIUS, r - 0.2));

      if (i > 0 && i < rows - 1) {
        const dzC = (dzF + dzB) / 2;
        const gThC = dThC / r;
        const norm = Math.sqrt(1 + gThC * gThC + dzC * dzC);
        const sinA = Math.abs(dzC) / norm;
        const area = r * dTheta * ((z[i + 1] - z[i - 1]) / 2) * norm;
        totalArea += area;
        if (sinA > sinLimit) steepArea += area;
        if (sinA > maxSinOverhang) maxSinOverhang = sinA;
      }
    }
  }

  return {
    N,
    rows,
    z,
    phi,
    R,
    rIn,
    envelopeScale,
    pinched,
    minOffsetRatio,
    innerTooSmall,
    maxOverhangDeg: (Math.asin(Math.min(1, maxSinOverhang)) * 180) / Math.PI,
    overhangFraction: totalArea > 0 ? steepArea / totalArea : 0,
    maxRadius: Math.max(maxRadius, rS),
    simplified,
  };
}

function vertex(g: ShellGrid, i: number, j: number, inner: boolean): [number, number, number] {
  const theta = (j / g.N) * Math.PI * 2 + g.phi[i];
  const r = (inner ? g.rIn : g.R)[i * g.N + j];
  return [r * Math.cos(theta), r * Math.sin(theta), g.z[i]];
}

/** Watertight mesh: per column loop = tab inner, tab outer, outer rows up, inner rows down. */
export function meshShell(g: ShellGrid, ctx: ShadeContext, withTab = true) {
  const { N, rows } = g;
  const tab = withTab ? 2 : 0;
  const L = tab + 2 * rows;
  const positions = new Float32Array(N * L * 3);
  const zTab = ctx.attachment.z - ctx.overlapDepth;
  const rS = ctx.attachment.radius;
  for (let j = 0; j < N; j++) {
    // Same angle expression as revolveProfile so tab vertices coincide with the collar's.
    const theta0 = (j / N) * Math.PI * 2;
    const c0 = Math.cos(theta0);
    const s0 = Math.sin(theta0);
    let o = j * L * 3;
    if (withTab) {
      const rIn0 = g.rIn[j];
      positions[o++] = rIn0 * c0; positions[o++] = rIn0 * s0; positions[o++] = zTab;
      positions[o++] = rS * c0; positions[o++] = rS * s0; positions[o++] = zTab;
    }
    for (let i = 0; i < rows; i++) {
      const [x, y, zz] = vertex(g, i, j, false);
      positions[o++] = x; positions[o++] = y; positions[o++] = zz;
    }
    for (let i = rows - 1; i >= 0; i--) {
      const [x, y, zz] = vertex(g, i, j, true);
      positions[o++] = x; positions[o++] = y; positions[o++] = zz;
    }
  }
  return sweepLoops(positions, N, L);
}

// --- wall thickness estimate ------------------------------------------------

type V3 = [number, number, number];

/** Squared distance from p to triangle abc (Ericson, Real-Time Collision Detection 5.1.5). */
function pointTriangleDist2(p: V3, a: V3, b: V3, c: V3): number {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const dot = (u: number[], v: number[]) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const d2 = (q: number[]) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
  const d1 = dot(ab, ap), d2_ = dot(ac, ap);
  if (d1 <= 0 && d2_ <= 0) return d2(a);
  const bp = [p[0] - b[0], p[1] - b[1], p[2] - b[2]];
  const d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return d2(b);
  const vc = d1 * d4 - d3 * d2_;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return d2([a[0] + v * ab[0], a[1] + v * ab[1], a[2] + v * ab[2]]);
  }
  const cp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  const d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return d2(c);
  const vb = d5 * d2_ - d1 * d6;
  if (vb <= 0 && d2_ >= 0 && d6 <= 0) {
    const w = d2_ / (d2_ - d6);
    return d2([a[0] + w * ac[0], a[1] + w * ac[1], a[2] + w * ac[2]]);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return d2([b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2])]);
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  return d2([a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w]);
}

/**
 * Thinnest wall: distance from inner-wall vertices to the nearby outer-wall
 * triangles (±2 rows / columns). Row 0 is excluded (it sits on the collar).
 */
export function estimateMinWall(g: ShellGrid, stride: number): number {
  const { N, rows } = g;
  let best = Infinity;
  for (let i = 1; i < rows; i += stride) {
    for (let j = 0; j < N; j += stride) {
      const p = vertex(g, i, j, true);
      let local = Infinity;
      for (let di = -2; di <= 1; di++) {
        const a = i + di;
        if (a < 0 || a + 1 >= rows) continue;
        for (let dj = -2; dj <= 1; dj++) {
          const b = (j + dj + N) % N;
          const b1 = (b + 1) % N;
          const v00 = vertex(g, a, b, false), v10 = vertex(g, a + 1, b, false);
          const v11 = vertex(g, a + 1, b1, false), v01 = vertex(g, a, b1, false);
          local = Math.min(local, pointTriangleDist2(p, v00, v11, v10), pointTriangleDist2(p, v00, v01, v11));
        }
      }
      if (local < best) best = local;
    }
  }
  return Math.sqrt(best);
}

// --- generator adapter ---------------------------------------------------------

function summaryOf(g: ShellGrid, p: ShadeCommonParams, ctx: ShadeContext, minWall?: number): ShadeSummary {
  let topMin = Infinity;
  const top = (g.rows - 1) * g.N;
  for (let j = 0; j < g.N; j++) topMin = Math.min(topMin, g.rIn[top + j]);
  return {
    envelopeRadius: g.maxRadius,
    topZ: ctx.attachment.z + p.height,
    topOpeningDiameter: topMin * 2,
    maxOverhangDeg: g.maxOverhangDeg,
    overhangFraction: g.overhangFraction,
    minWallEstimate: minWall,
    envelopeScale: g.envelopeScale,
  };
}

function commonChecks(p: ShadeCommonParams, ctx: ShadeContext, minTransition: number): ParamIssue[] {
  const issues: ParamIssue[] = [];
  const err = (field: string, message: string) => issues.push({ severity: 'error', field, message });
  const warn = (field: string, message: string) => issues.push({ severity: 'warning', field, message });
  const shoulderD = ctx.attachment.radius * 2;
  if (!(p.height >= 20)) err('height', 'Shade height must be at least 20 mm for sculptural families.');
  if (p.maxDiameter < shoulderD - 1e-6) {
    err('maxDiameter', `Maximum diameter must be at least the collar shoulder diameter (${shoulderD.toFixed(2)} mm); the shade starts flush with the shoulder.`);
  }
  if (p.wallThickness < ctx.preset.minWall) {
    err('wallThickness', `Shade wall is below the ${ctx.preset.minWall.toFixed(2)} mm minimum for the selected print preset.`);
  } else if (p.wallThickness < ctx.preset.recommendedWall) {
    warn('wallThickness', `Shade wall is below the ${ctx.preset.recommendedWall.toFixed(2)} mm recommended for the selected print preset; it will be fragile.`);
  }
  if (ctx.attachment.radius - p.wallThickness < ctx.collar.innerRadius + 0.2) {
    err('wallThickness', `Shade wall is wider than the collar shoulder (${(ctx.attachment.radius - ctx.collar.innerRadius).toFixed(2)} mm).`);
  }
  if (p.transitionHeight < minTransition) {
    err('transitionHeight', `This family needs at least ${minTransition} mm of transition to grow smoothly out of the collar.`);
  }
  if (p.transitionHeight > p.height) err('transitionHeight', 'Transition height cannot exceed the shade height.');
  return issues;
}

function geometricIssues(g: ShellGrid, p: ShadeCommonParams, ctx: ShadeContext, minWall: number | undefined): ParamIssue[] {
  const issues: ParamIssue[] = [];
  // Where the surface is too steep for the wall to follow, it thins by this ratio.
  const steepWall = p.wallThickness * g.minOffsetRatio;
  if (steepWall < ctx.preset.minWall) {
    issues.push({
      severity: 'error',
      field: 'form',
      message: `Parts of the surface are so steep the wall would thin to ${steepWall.toFixed(2)} mm (minimum ${ctx.preset.minWall} mm) and could fold through itself. Reduce depth, amplitude or frequency, or use fewer, wider features.`,
    });
  } else if (g.minOffsetRatio < 0.85) {
    issues.push({ severity: 'warning', field: 'form', message: `The steepest areas thin the wall to about ${steepWall.toFixed(2)} mm.` });
  }
  if (g.innerTooSmall > 0) {
    issues.push({ severity: 'error', field: 'form', message: `The inner wall pinches below ${MIN_INNER_RADIUS * 2} mm diameter. Reduce depth, taper or wall thickness.` });
  } else if (g.pinched > 0) {
    issues.push({ severity: 'warning', field: 'form', message: `The form was clamped at ${(2 * (MIN_INNER_RADIUS + p.wallThickness * MAX_OFFSET_FACTOR)).toFixed(0)} mm diameter where it pinched too narrow.` });
  }
  if (minWall !== undefined) {
    if (minWall < ctx.preset.minWall * 0.95) {
      issues.push({ severity: 'error', field: 'wallThickness', message: `Measured wall thins to ${minWall.toFixed(2)} mm — below the ${ctx.preset.minWall} mm printable minimum. The form is too sharp or deep for this wall.` });
    } else if (minWall < p.wallThickness * 0.85) {
      issues.push({ severity: 'warning', field: 'wallThickness', message: `Measured wall thins to ${minWall.toFixed(2)} mm where folds are sharpest (target ${p.wallThickness.toFixed(2)} mm).` });
    }
  }
  if (g.maxOverhangDeg > ctx.preset.maxOverhangDeg && g.overhangFraction > 0.002) {
    issues.push({
      severity: 'warning',
      field: 'overhang',
      message: `${(g.overhangFraction * 100).toFixed(1)}% of the surface is steeper than ${ctx.preset.maxOverhangDeg}° (max ${g.maxOverhangDeg.toFixed(0)}°). Expect to need supports or a gentler form.`,
    });
  }
  if (g.simplified) {
    issues.push({ severity: 'warning', field: 'resolution', message: 'Very fine detail: this mesh is simplified to stay responsive. Exports are checked in full, so any problem it causes will be reported there.' });
  }
  if (g.envelopeScale < 0.85) {
    issues.push({ severity: 'warning', field: 'maxDiameter', message: `The form was scaled to ${(g.envelopeScale * 100).toFixed(0)}% to fit the maximum diameter.` });
  }
  return issues;
}

/** Wrap a shell family as a standard ShadeGenerator. */
export function createShellGenerator<F>(family: ShellFamily<F>): ShadeGenerator<F> {
  return {
    id: family.id,
    label: family.label,
    description: family.description,
    controls: family.controls,
    examples: family.examples,
    minTransitionHeight: family.minTransitionHeight,
    defaults: family.defaults,

    check(p, ctx) {
      const issues = commonChecks(p, ctx, family.minTransitionHeight);
      if (issues.some((i) => i.severity === 'error')) return issues;
      issues.push(...(family.check?.(p, ctx) ?? []));
      // A coarse sample catches impossible forms before any mesh is built.
      const g = sampleShell(family, p, ctx, 'coarse');
      issues.push(...geometricIssues(g, p, ctx, undefined).filter((i) => i.field !== 'overhang'));
      return issues;
    },

    summarize(p, ctx) {
      return summaryOf(sampleShell(family, p, ctx, 'coarse'), p, ctx);
    },

    build(p, ctx, opts): ShadeBuildResult {
      const g = sampleShell(family, p, ctx, opts.quality);
      const minWall = opts.draft ? undefined : estimateMinWall(g, opts.quality === 'fabrication' ? 1 : 3);
      return {
        mesh: meshShell(g, ctx, !opts.draft),
        segments: g.N,
        summary: summaryOf(g, p, ctx, minWall),
        issues: geometricIssues(g, p, ctx, minWall),
      };
    },

    sketch(p, ctx, us) {
      const g = sampleShell(family, p, ctx, 'coarse');
      const sections: Polyline[] = us.map((u) => {
        const zt = ctx.attachment.z + u * p.height;
        let i = 0;
        while (i < g.rows - 1 && g.z[i + 1] <= zt) i++;
        return Array.from({ length: g.N }, (_, j) => {
          const [x, y] = vertex(g, i, j, false);
          return [x, y] as [number, number];
        });
      });
      // Side silhouette: the outer radius at θ = π (left) and θ = 0 (right).
      const field = family.makeField(p, { rMax: p.maxDiameter / 2, rShoulder: ctx.attachment.radius, height: p.height, wallThickness: p.wallThickness, segments: g.N });
      const ht = Math.min(p.transitionHeight, p.height);
      const side = (theta: number) =>
        Array.from(g.z, (zz) => {
          const u = (zz - ctx.attachment.z) / p.height;
          const w = ht > 0 ? ease((zz - ctx.attachment.z) / ht) : 1;
          const r = ctx.attachment.radius + (field.radius(theta, u) * g.envelopeScale - ctx.attachment.radius) * w;
          return [r, zz - ctx.attachment.z] as [number, number];
        });
      const left = side(Math.PI).map(([r, zz]) => [-r, zz] as [number, number]);
      const right = side(0).reverse();
      return { sections, silhouette: [...left, ...right] };
    },
  };
}
