import type { FoldParams, OrganicParams, RippleParams, TwistParams } from '../../../types/project';
import type { ParamIssue } from '../types';
import type { ShellFamily } from './engine';

const DEG = Math.PI / 180;

/** Deterministic PRNG (mulberry32) so a seed always reproduces the same form. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Largest sample spacing (mm) that keeps the chord error of a sinusoid with
 * amplitude `amp` and wavenumber `k` (rad/mm) under a quarter of the wall
 * thickness, so straight mesh segments of the inner and outer walls never
 * clip each other: sagitta ≈ κh²/8 with κ = amp·k², solved for h.
 */
export function curvatureSpacing(amp: number, k: number, wall: number): number {
  const kappa = Math.abs(amp) * k * k;
  return kappa > 1e-9 ? Math.sqrt((2 * wall) / kappa) : Infinity;
}

/** Angular segments needed for a pattern of `count` waves with amplitude `amp` at radius r. */
function segmentsFor(count: number, amp: number, r: number, wall: number): number {
  return Math.max(8 * count, Math.ceil((2 * Math.PI * r) / curvatureSpacing(amp, count / r, wall)));
}

/** Warn when a repeating feature is too narrow for the wall to follow. */
function pitchCheck(count: number, rMax: number, wall: number, what: string, field: string): ParamIssue[] {
  const halfPitch = (Math.PI * rMax) / count;
  if (halfPitch < 2.5 * wall) {
    return [{ severity: 'warning', field, message: `${what} are only ${halfPitch.toFixed(1)} mm apart at the widest point; with a ${wall.toFixed(1)} mm wall they will partly fill in. Use fewer, or a thinner wall.` }];
  }
  return [];
}

// --- Twist / Helix ---------------------------------------------------------------

export const twistFamily: ShellFamily<TwistParams> = {
  id: 'twist',
  label: 'Twist',
  description: 'A lobed cross-section that rotates as it rises — helical ridges catch light in spirals.',
  minTransitionHeight: 5,
  defaults: () => ({ twistAngle: 120, rotation: 0, lobes: 6, lobeDepth: 12, taper: 0.12, curvature: 0.25 }),
  controls: [
    { key: 'twistAngle', kind: 'angle', label: 'Twist angle', min: -540, max: 540, step: 1, hint: 'Total rotation base → top' },
    { key: 'lobes', kind: 'number', label: 'Lobes', min: 2, max: 16, step: 1, integer: true },
    { key: 'lobeDepth', kind: 'length', label: 'Lobe depth', min: 0, max: 40, step: 0.5 },
    { key: 'rotation', kind: 'angle', label: 'Rotation', min: -180, max: 180, step: 1, hint: 'Lobe orientation at the base' },
    { key: 'taper', kind: 'number', label: 'Taper', min: -0.4, max: 0.6, step: 0.01, percent: true, hint: '+ narrows to the top' },
    { key: 'curvature', kind: 'number', label: 'Curvature', min: -1, max: 1, step: 0.01, hint: '+ barrel · − waist' },
  ],
  examples: [
    { name: 'Hex helix', params: { twistAngle: 120, lobes: 6, lobeDepth: 12, taper: 0.12, curvature: 0.25, rotation: 0 } },
    { name: 'Tri spiral', params: { twistAngle: 240, lobes: 3, lobeDepth: 18, taper: 0.2, curvature: 0, rotation: 0 } },
    { name: 'Soft torsion', params: { twistAngle: 70, lobes: 9, lobeDepth: 6, taper: 0, curvature: 0.6, rotation: 0 } },
    { name: 'Square turn', params: { twistAngle: 90, lobes: 4, lobeDepth: 16, taper: -0.15, curvature: -0.3, rotation: 45 } },
  ],
  minSegments: (p) => segmentsFor(p.lobes, p.lobeDepth / 2, p.maxDiameter / 2, p.wallThickness),
  makeField(p, env) {
    const twist = p.twistAngle * DEG;
    // Snap the base rotation to the grid so lobe crests stay on vertex columns.
    const step = (2 * Math.PI) / env.segments;
    const rot = Math.round((p.rotation * DEG) / step) * step;
    return {
      frameRotation: (u) => twist * u,
      radius(theta, u) {
        const rb = env.rMax * (1 - p.taper * u) * (1 + 0.2 * p.curvature * Math.sin(Math.PI * u));
        const a = p.lobes * (theta - twist * u - rot);
        return rb - (p.lobeDepth * (1 - Math.cos(a))) / 2;
      },
    };
  },
  check(p) {
    const issues: ParamIssue[] = [];
    if (p.lobeDepth > p.maxDiameter / 2 - 25) issues.push({ severity: 'error', field: 'lobeDepth', message: 'Lobe depth leaves too little core; reduce the depth or widen the shade.' });
    issues.push(...pitchCheck(p.lobes, p.maxDiameter / 2, p.wallThickness, 'Lobes', 'lobes'));
    return issues;
  },
};

// --- Ripple / Fluted ---------------------------------------------------------------

export const rippleFamily: ShellFamily<RippleParams> = {
  id: 'ripple',
  label: 'Ripple',
  description: 'Vertical flutes like a classical column; add vertical frequency for a quilted, rippling surface.',
  minTransitionHeight: 5,
  defaults: () => ({ waveCount: 18, amplitude: 4, frequency: 0, phase: 0 }),
  controls: [
    { key: 'waveCount', kind: 'number', label: 'Wave count', min: 3, max: 64, step: 1, integer: true, hint: 'Flutes around' },
    { key: 'amplitude', kind: 'length', label: 'Amplitude', min: 0, max: 20, step: 0.25 },
    { key: 'frequency', kind: 'number', label: 'Frequency', min: 0, max: 16, step: 0.25, hint: 'Vertical waves (0 = straight)' },
    { key: 'phase', kind: 'angle', label: 'Phase', min: -180, max: 180, step: 1, hint: 'Shifts the vertical waves' },
  ],
  examples: [
    { name: 'Fluted column', params: { waveCount: 24, amplitude: 3, frequency: 0, phase: 0 } },
    { name: 'Quilted', params: { waveCount: 12, amplitude: 5, frequency: 5, phase: 0 } },
    { name: 'Shell ribs', params: { waveCount: 36, amplitude: 2.5, frequency: 0, phase: 0 } },
    { name: 'Wave bands', params: { waveCount: 8, amplitude: 6, frequency: 2.5, phase: 90 } },
  ],
  minSegments: (p) => segmentsFor(p.waveCount, p.amplitude, p.maxDiameter / 2, p.wallThickness),
  maxRowSpacing: (p) => {
    if (p.frequency <= 0) return Infinity;
    const wavelength = p.height / p.frequency;
    return Math.min(wavelength / 8, curvatureSpacing(p.amplitude, (2 * Math.PI) / wavelength, p.wallThickness));
  },
  makeField(p, env) {
    const phase = p.phase * DEG;
    return {
      radius(theta, u) {
        const m = p.frequency > 0 ? Math.cos(2 * Math.PI * p.frequency * u + phase) : 1;
        return env.rMax - p.amplitude + p.amplitude * Math.cos(p.waveCount * theta) * m;
      },
    };
  },
  check(p) {
    const issues = pitchCheck(p.waveCount, p.maxDiameter / 2, p.wallThickness, 'Flutes', 'waveCount');
    if (p.amplitude > 0 && p.amplitude < 0.6) issues.push({ severity: 'warning', field: 'amplitude', message: 'Amplitude under 0.6 mm will barely show after printing.' });
    if (p.frequency > 0) {
      const wavelength = p.height / p.frequency;
      if (wavelength < 8) issues.push({ severity: 'warning', field: 'frequency', message: `Vertical waves are only ${wavelength.toFixed(1)} mm tall; they may be steep to print.` });
    }
    return issues;
  },
};

// --- Organic / Flow ----------------------------------------------------------------

export const organicFamily: ShellFamily<OrganicParams> = {
  id: 'organic',
  label: 'Organic',
  description: 'A swelling, softly irregular vessel. The seed reproduces the exact same flow every time.',
  minTransitionHeight: 10,
  minSegments: (p) => 8 * Math.max(2, Math.round(2 + (1 - p.smoothness) * 6)),
  defaults: () => ({ bulge: 12, asymmetry: 0.5, curvature: 0.1, smoothness: 0.7, seed: 7 }),
  controls: [
    { key: 'bulge', kind: 'length', label: 'Bulge', min: -15, max: 40, step: 0.5, hint: '− pinches the waist' },
    { key: 'asymmetry', kind: 'number', label: 'Asymmetry', min: 0, max: 1, step: 0.01, percent: true },
    { key: 'curvature', kind: 'number', label: 'Curvature', min: -1, max: 1, step: 0.01, hint: 'Moves the bulge down / up' },
    { key: 'smoothness', kind: 'number', label: 'Smoothness', min: 0, max: 1, step: 0.01, percent: true },
    { key: 'seed', kind: 'seed', label: 'Seed' },
  ],
  examples: [
    { name: 'Calm vessel', params: { bulge: 18, asymmetry: 0.1, curvature: -0.2, smoothness: 0.9, seed: 3 } },
    { name: 'Pebble', params: { bulge: 10, asymmetry: 0.6, curvature: 0, smoothness: 0.75, seed: 21 } },
    { name: 'Flowing lean', params: { bulge: 8, asymmetry: 0.85, curvature: 0.5, smoothness: 0.9, seed: 42 } },
    { name: 'Wild growth', params: { bulge: 12, asymmetry: 0.9, curvature: -0.1, smoothness: 0.2, seed: 108 } },
  ],
  makeField(p, env) {
    const rand = mulberry32(Math.round(p.seed) * 2654435761);
    // Periodic harmonic flow: k = 1..K around the axis, each drifting and
    // breathing up the height. Fewer, gentler harmonics as smoothness rises.
    const K = Math.max(2, Math.round(2 + (1 - p.smoothness) * 6));
    const harmonics = Array.from({ length: K }, (_, n) => {
      const k = n + 1;
      return {
        k,
        amp: (0.4 + 0.6 * rand()) / Math.pow(k, 0.8 + 1.4 * p.smoothness),
        phase: rand() * 2 * Math.PI,
        drift: (rand() - 0.5) * 2 * Math.PI * (1.2 - p.smoothness),
        breath: 0.5 + rand() * (2.5 - 2 * p.smoothness),
        breathPhase: rand() * 2 * Math.PI,
      };
    });
    const norm = harmonics.reduce((s, h) => s + h.amp, 0);
    const peakU = 0.5 * Math.pow(2, p.curvature * 0.8); // where the bulge peaks
    const expo = Math.log(0.5) / Math.log(Math.min(0.95, Math.max(0.05, peakU)));
    const flowAmp = p.asymmetry * 0.26 * env.rMax;
    const base = env.rMax - Math.max(p.bulge, 0);
    return {
      radius(theta, u) {
        let flow = 0;
        for (const h of harmonics) {
          const breathe = 0.65 + 0.35 * Math.sin(2 * Math.PI * h.breath * u + h.breathPhase);
          flow += h.amp * breathe * Math.cos(h.k * theta + h.phase + h.drift * u);
        }
        // The flow fades in with height so the transition from the collar stays calm.
        const fade = Math.min(1, u * 4);
        return base + p.bulge * Math.sin(Math.PI * Math.pow(u, expo)) + flowAmp * fade * (flow / norm);
      },
    };
  },
};

// --- Fold / Pleat ------------------------------------------------------------------

export const foldFamily: ShellFamily<FoldParams> = {
  id: 'fold',
  label: 'Fold',
  description: 'Pleated paper: crisp radial creases with flat facets between, optionally spiralling.',
  minTransitionHeight: 8,
  defaults: () => ({ foldCount: 12, depth: 10, sharpness: 0.9, rotation: 0 }),
  controls: [
    { key: 'foldCount', kind: 'number', label: 'Fold count', min: 3, max: 48, step: 1, integer: true },
    { key: 'depth', kind: 'length', label: 'Depth', min: 0, max: 30, step: 0.5, hint: 'Ridge to valley' },
    { key: 'sharpness', kind: 'number', label: 'Sharpness', min: 0, max: 1, step: 0.01, percent: true, hint: 'Soft → crisp creases' },
    { key: 'rotation', kind: 'angle', label: 'Rotation', min: -180, max: 180, step: 1, hint: 'Pleat spiral base → top' },
  ],
  examples: [
    { name: 'Paper pleat', params: { foldCount: 16, depth: 9, sharpness: 1, rotation: 0 } },
    { name: 'Spiral pleat', params: { foldCount: 12, depth: 10, sharpness: 0.95, rotation: 60 } },
    { name: 'Soft folds', params: { foldCount: 9, depth: 12, sharpness: 0.3, rotation: 0 } },
    { name: 'Accordion', params: { foldCount: 28, depth: 5, sharpness: 1, rotation: 20 } },
  ],
  // Every ridge and valley falls exactly on a vertex column, so creases stay crisp.
  segmentMultiple: (p) => 2 * Math.round(p.foldCount),
  // Crisp folds need only ridge + valley columns; soft folds need a smooth curve.
  minSegments: (p) =>
    p.sharpness >= 0.999
      ? 2 * Math.round(p.foldCount)
      : segmentsFor(Math.round(p.foldCount), (p.depth / 2) * (1 - p.sharpness), p.maxDiameter / 2, p.wallThickness),
  makeField(p, env) {
    const spiral = p.rotation * DEG;
    const n = Math.round(p.foldCount);
    return {
      frameRotation: (u) => spiral * u,
      radius(theta, u) {
        const x = n * (theta - spiral * u);
        const t = ((x / Math.PI) % 2 + 2) % 2; // 0 at a ridge, 1 at a valley
        const tri = 1 - 2 * Math.min(t, 2 - t);
        const s = (1 - p.sharpness) * Math.cos(x) + p.sharpness * tri;
        return env.rMax - (p.depth * (1 - s)) / 2;
      },
    };
  },
  check(p) {
    const issues = pitchCheck(p.foldCount, p.maxDiameter / 2, p.wallThickness, 'Folds', 'foldCount');
    if (p.depth > p.maxDiameter / 2 - 25) issues.push({ severity: 'error', field: 'depth', message: 'Fold depth leaves too little core; reduce the depth or widen the shade.' });
    return issues;
  },
};
