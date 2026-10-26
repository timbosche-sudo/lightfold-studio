import type { CylinderFamilyParams, CylinderShadeParams, ShadeCommonParams } from '../../types/project';
import { inToMm } from '../../utils/units';
import { checkProfile, revolveProfile, type Profile2D } from '../core/revolve';
import type { ParamIssue, Polyline, ShadeContext, ShadeGenerator, ShadeSummary } from './types';
import { SEGMENTS } from '../core/quality';

/** Normalised transition t ∈ [0,1] → blend ∈ [0,1], and its derivative. */
function ease(profile: CylinderShadeParams['transitionProfile'], t: number): { f: number; df: number } {
  if (profile === 'linear') return { f: t, df: 1 };
  // Cosine ease: zero slope where it meets the shoulder and the body,
  // so the wall leaves the collar vertically and joins the body tangentially.
  return { f: (1 - Math.cos(Math.PI * t)) / 2, df: (Math.PI / 2) * Math.sin(Math.PI * t) };
}

interface Sample {
  z: number;
  r: number;
  /** dr/dz of the outer surface. */
  slope: number;
}

function outerSamples(p: CylinderShadeParams, ctx: ShadeContext, rows: number): Sample[] {
  const z0 = ctx.attachment.z;
  const r0 = ctx.attachment.radius;
  const dr = p.maxDiameter / 2 - r0;
  const ht = Math.min(p.transitionHeight, p.height);
  const samples: Sample[] = [];
  if (Math.abs(dr) < 1e-6 || ht < 1e-6) {
    // Straight cylinder (or an abrupt step, rejected by check()).
    samples.push({ z: z0, r: r0 + (ht < 1e-6 ? dr : 0), slope: 0 });
  } else {
    for (let k = 0; k <= rows; k++) {
      const t = k / rows;
      const { f, df } = ease(p.transitionProfile, t);
      samples.push({ z: z0 + ht * t, r: r0 + dr * f, slope: (dr * df) / ht });
    }
  }
  const top = z0 + p.height;
  if (top - samples[samples.length - 1].z > 1e-6) samples.push({ z: top, r: r0 + dr, slope: 0 });
  return samples;
}

/** Closed (r, z) cross-section of the shade wall, CCW, including the overlap tab. */
export function cylinderShadeProfile(p: CylinderShadeParams, ctx: ShadeContext, rows: number, withTab = true): Profile2D {
  const outer = outerSamples(p, ctx, rows);
  // Offset along the surface normal so the wall is `wallThickness` thick
  // everywhere, not just where it is vertical.
  const inner = outer.map((s) => ({ z: s.z, r: s.r - p.wallThickness * Math.sqrt(1 + s.slope * s.slope) }));
  const zBottom = ctx.attachment.z - ctx.overlapDepth;
  const pts: [number, number][] = [];
  if (withTab) {
    pts.push([inner[0].r, zBottom]);
    pts.push([outer[0].r, zBottom]);
  }
  for (const s of outer) pts.push([s.r, s.z]);
  for (let i = inner.length - 1; i >= 0; i--) pts.push([inner[i].r, inner[i].z]);
  return pts;
}

/** Shared dimensions: 9" overall with the default 5/8" collar, 5" body, 1" transition. */
export function defaultCommonParams(): ShadeCommonParams {
  return {
    height: inToMm(9) - inToMm(1 / 2 + 1 / 8),
    maxDiameter: inToMm(5),
    wallThickness: 1.2,
    transitionHeight: inToMm(1),
  };
}

export const cylinderShade: ShadeGenerator<CylinderFamilyParams> = {
  id: 'cylinder',
  label: 'Cylinder',
  description: 'A clean shell that flares from the collar to a straight body.',
  minTransitionHeight: 0,
  controls: [
    {
      key: 'transitionProfile',
      kind: 'choice',
      label: 'Transition profile',
      options: [
        { value: 'smooth', label: 'Smooth' },
        { value: 'linear', label: 'Linear' },
      ],
    },
  ],
  examples: [
    { name: 'Smooth flare', params: { transitionProfile: 'smooth' } },
    { name: 'Conical flare', params: { transitionProfile: 'linear' } },
  ],

  defaults() {
    return { transitionProfile: 'smooth' };
  },

  summarize(p, ctx): ShadeSummary {
    const samples = outerSamples(p, ctx, 64);
    const maxSlope = samples.reduce((m, s) => Math.max(m, Math.abs(s.slope)), 0);
    return {
      envelopeRadius: Math.max(ctx.attachment.radius, p.maxDiameter / 2),
      topZ: ctx.attachment.z + p.height,
      topOpeningDiameter: p.maxDiameter - 2 * p.wallThickness,
      maxOverhangDeg: (Math.atan(maxSlope) * 180) / Math.PI,
    };
  },

  check(p, ctx): ParamIssue[] {
    const issues: ParamIssue[] = [];
    const err = (field: string, message: string) => issues.push({ severity: 'error', field, message });
    const warn = (field: string, message: string) => issues.push({ severity: 'warning', field, message });
    const shoulderD = ctx.attachment.radius * 2;

    if (!(p.height >= 10)) err('height', 'Shade height must be at least 10 mm.');
    if (p.maxDiameter < shoulderD - 1e-6) {
      err('maxDiameter', `Maximum diameter must be at least the collar shoulder diameter (${shoulderD.toFixed(2)} mm); the shade starts flush with the shoulder.`);
    }
    if (p.wallThickness < ctx.preset.minWall) {
      err('wallThickness', `Shade wall is below the ${ctx.preset.minWall.toFixed(2)} mm minimum for the selected print preset.`);
    } else if (p.wallThickness < ctx.preset.recommendedWall) {
      warn('wallThickness', `Shade wall is below the ${ctx.preset.recommendedWall.toFixed(2)} mm recommended for the selected print preset; it will be fragile.`);
    }
    // The base of the wall sits on the shoulder top; it must not overhang the bore.
    const s = cylinderShade.summarize(p, ctx);
    const baseSlope = p.transitionProfile === 'linear' && p.transitionHeight > 0 ? (p.maxDiameter / 2 - ctx.attachment.radius) / p.transitionHeight : 0;
    const innerAtBase = ctx.attachment.radius - p.wallThickness * Math.sqrt(1 + baseSlope * baseSlope);
    if (innerAtBase < ctx.collar.innerRadius + 0.2) {
      err('wallThickness', `Shade wall (${(ctx.attachment.radius - innerAtBase).toFixed(2)} mm at the base) is wider than the collar shoulder (${(ctx.attachment.radius - ctx.collar.innerRadius).toFixed(2)} mm).`);
    }
    if (p.transitionHeight < 0) err('transitionHeight', 'Transition height cannot be negative.');
    if (p.transitionHeight > p.height) err('transitionHeight', 'Transition height cannot exceed the shade height.');
    if (p.maxDiameter - shoulderD > 1e-6 && p.transitionHeight < 1) {
      err('transitionHeight', 'A wider body needs a transition height of at least 1 mm; a flat step would be an unsupported ledge.');
    } else if (s.maxOverhangDeg > ctx.preset.maxOverhangDeg) {
      warn('transitionHeight', `Transition wall reaches ${s.maxOverhangDeg.toFixed(0)}° from vertical; above ${ctx.preset.maxOverhangDeg}° it will likely need supports. Increase the transition height.`);
    }
    if (p.transitionProfile === 'linear' && p.maxDiameter - shoulderD > 1e-6) {
      warn('transitionProfile', 'A linear transition leaves a crease where it meets the shoulder and body; the smooth profile is continuous.');
    }
    return issues;
  },

  build(p, ctx, opts) {
    const rows = opts.quality === 'fabrication' ? 48 : 16;
    const profile = cylinderShadeProfile(p, ctx, rows, !opts.draft);
    const problems = checkProfile(profile);
    if (problems.length) throw new Error(`Shade cross-section invalid: ${problems.join(' ')}`);
    const segments = SEGMENTS[opts.quality];
    return {
      mesh: revolveProfile(profile, segments),
      segments,
      summary: { ...cylinderShade.summarize(p, ctx), minWallEstimate: p.wallThickness, envelopeScale: 1 },
      issues: [],
    };
  },

  sketch(p, ctx, us) {
    const samples = outerSamples(p, ctx, 24);
    const radiusAt = (z: number) => {
      for (let i = 1; i < samples.length; i++) {
        if (z <= samples[i].z) {
          const a = samples[i - 1], b = samples[i];
          return a.r + ((b.r - a.r) * (z - a.z)) / Math.max(b.z - a.z, 1e-9);
        }
      }
      return samples[samples.length - 1].r;
    };
    const sections: Polyline[] = us.map((u) => {
      const r = radiusAt(ctx.attachment.z + u * p.height);
      return Array.from({ length: 48 }, (_, i) => [r * Math.cos((i / 48) * 2 * Math.PI), r * Math.sin((i / 48) * 2 * Math.PI)] as [number, number]);
    });
    const right: Polyline = samples.map((s) => [s.r, s.z - ctx.attachment.z]);
    const silhouette: Polyline = [...right.map(([r, z]) => [-r, z] as [number, number]), ...right.reverse()];
    return { sections, silhouette };
  },
};
