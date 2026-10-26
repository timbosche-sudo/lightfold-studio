import type { CollarOrientation, CollarParams, FitTestParams, MaterialPresetId, PrinterProfile, ShadeDesign } from '../types/project';
import type { MeshData } from './core/mesh';
import { flipForPrinting } from './core/mesh';
import { checkProfile, revolveProfile } from './core/revolve';
import { checkCollarParams, collarProfile, deriveCollarDimensions, type ParamIssue } from './collar/collar';
import type { Kernel } from './kernel/manifoldKernel';
import { fromManifold, toManifold, withScope } from './kernel/manifoldKernel';
import type { ValidationCheck, ValidationReport } from './validation/validateMesh';
import { validateMesh } from './validation/validateMesh';
import { PRINT_PRESETS, type PrintPreset } from './presets';
import { activeShade } from './generators/registry';
import type { ShadeContext, ShadeSummary } from './generators/types';
import type { Manifold } from 'manifold-3d';

export type Quality = 'preview' | 'fabrication';

export const SEGMENTS: Record<Quality, number> = { preview: 144, fabrication: 360 };

export type PartJob =
  | { part: 'assembly'; collar: CollarParams; shade: ShadeDesign }
  | { part: 'collar'; collar: CollarParams }
  | { part: 'fit-test'; collar: CollarParams; fitTest: FitTestParams; clearance: number; label: number };

export interface BuildJob {
  job: PartJob;
  quality: Quality;
  /** Collar / fit-test only. Assemblies always export as installed (collar on the bed). */
  orientation: CollarOrientation;
  printer: PrinterProfile;
  materialPreset: MaterialPresetId;
}

export interface BuildResult {
  mesh: MeshData;
  report: ValidationReport;
  /** Present for assemblies. */
  shade?: ShadeSummary;
  timings: { buildMs: number; validateMs: number };
}

/** Collar parameters actually used for a job (fit-test overrides). */
export function effectiveCollar(job: PartJob): { collar: CollarParams; includeShoulder: boolean } {
  if (job.part !== 'fit-test') return { collar: job.collar, includeShoulder: true };
  return {
    collar: {
      ...job.collar,
      fitClearance: job.clearance,
      insertionHeight: job.fitTest.height,
      retentionLip: { ...job.collar.retentionLip, enabled: false },
      magnetPockets: { ...job.collar.magnetPockets, enabled: false },
    },
    includeShoulder: job.fitTest.includeShoulder,
  };
}

/** How far a shade reaches down into the shoulder to fuse with it. */
export function shadeOverlapDepth(collar: CollarParams): number {
  return Math.min(1, collar.shoulderHeight * 0.5);
}

export function shadeContext(collar: CollarParams, preset: PrintPreset): ShadeContext {
  const d = deriveCollarDimensions(collar);
  return { collar: d, attachment: d.attachment, overlapDepth: shadeOverlapDepth(collar), preset };
}

function issueChecks(label: string, idPrefix: string, issues: ParamIssue[], passMessage: string): ValidationCheck[] {
  if (issues.length === 0) return [{ id: idPrefix, label, status: 'pass', message: passMessage }];
  return issues.map((i, n) => ({ id: `${idPrefix}-${n}-${i.field}`, label, status: i.severity === 'error' ? 'error' : 'warning', message: i.message }));
}

type Keep = <M extends { delete(): void }>(m: M) => M;

/** Collar key / pocket / notch features, applied to an existing solid. */
function applyCollarFeatures(kernel: Kernel, keep: Keep, solid: Manifold, job: PartJob, collar: CollarParams, includeShoulder: boolean): Manifold {
  const { Manifold } = kernel;
  const d = deriveCollarDimensions(collar);
  const key = collar.alignmentKey;
  if (key.enabled) {
    // Rib on the insertion OD at +X, embedded 0.5 mm into the wall and up into the shoulder.
    const zTop = includeShoulder ? collar.insertionHeight + 0.5 : collar.insertionHeight;
    const zBottom = collar.leadInChamfer + 0.2;
    const rib = keep(Manifold.cube([key.depth + 0.5, key.width, zTop - zBottom], false).translate([d.insertionOuterRadius - 0.5, -key.width / 2, zBottom]));
    solid = keep(solid.add(rib));
  }
  const mag = collar.magnetPockets;
  if (mag.enabled && includeShoulder) {
    const rMid = (d.insertionOuterRadius + d.shoulderOuterRadius) / 2;
    const cutters: Manifold[] = [];
    for (let i = 0; i < mag.count; i++) {
      const ang = (360 / mag.count) * i + 180 / mag.count;
      cutters.push(keep(Manifold.cylinder(mag.depth + 0.5, mag.diameter / 2, mag.diameter / 2, 32).translate([rMid, 0, collar.insertionHeight - 0.5]).rotate([0, 0, ang])));
    }
    solid = keep(solid.subtract(keep(Manifold.union(cutters))));
  }
  if (job.part === 'fit-test' && job.fitTest.idNotches) {
    const top = includeShoulder ? d.totalHeight : collar.insertionHeight;
    const rEdge = includeShoulder ? d.shoulderOuterRadius : d.insertionOuterRadius;
    const depth = Math.min(1.0, (includeShoulder ? d.shoulderLedge : collar.wallThickness) * 0.5);
    const notchH = Math.min(1.0, (includeShoulder ? collar.shoulderHeight : collar.insertionHeight) * 0.4);
    const cutters: Manifold[] = [];
    for (let i = 0; i < job.label; i++) {
      cutters.push(keep(Manifold.cube([depth + 1, 1.0, notchH + 1], false).translate([rEdge - depth, -0.5, top - notchH]).rotate([0, 0, 90 + i * 8])));
    }
    solid = keep(solid.subtract(keep(Manifold.union(cutters))));
  }
  return solid;
}

/**
 * Build the requested part from parameters, then validate the real mesh.
 * The Manifold kernel is required for assemblies and collar features.
 */
export function buildPart(req: BuildJob, kernel: Kernel | null): BuildResult {
  const t0 = performance.now();
  const preset = PRINT_PRESETS[req.materialPreset];
  const { job } = req;
  const { collar, includeShoulder } = effectiveCollar(job);
  const segments = SEGMENTS[req.quality];
  const d = deriveCollarDimensions(collar);

  const collarIssues = checkCollarParams(collar, preset.minWall, preset.recommendedWall);
  if (job.part === 'fit-test' && job.fitTest.height <= collar.leadInChamfer * 2) {
    collarIssues.push({ severity: 'error', field: 'fitTest', message: 'Fit-test height must exceed twice the lead-in chamfer.' });
  }
  const profile = collarProfile(collar, { includeShoulder });
  const profileProblems = checkProfile(profile);
  const extra: ValidationCheck[] = issueChecks('Collar parameters', 'params', collarIssues, 'All collar parameters are within limits.');
  extra.push({
    id: 'profile',
    label: 'Collar cross-section',
    status: profileProblems.length ? 'error' : 'pass',
    message: profileProblems.length ? profileProblems.join(' ') : 'Cross-section is a simple closed polygon.',
  });

  let mesh = revolveProfile(profile, segments);
  let shadeSummary: ShadeSummary | undefined;
  let collarVolume: number | null = null;

  const needsKernel =
    job.part === 'assembly' ||
    collar.alignmentKey.enabled ||
    collar.magnetPockets.enabled ||
    (job.part === 'fit-test' && job.fitTest.idNotches);

  if (needsKernel && !profileProblems.length) {
    if (!kernel) {
      extra.push({ id: 'kernel-required', label: 'Geometry kernel', status: 'error', message: 'Manifold kernel unavailable; shade union and collar features could not be built.' });
    } else {
      let shadeMesh: MeshData | null = null;
      if (job.part === 'assembly') {
        const ctx = shadeContext(collar, preset);
        const { generator, params } = activeShade(job.shade);
        shadeSummary = generator.summarize(params, ctx);
        const shadeIssues = generator.check(params, ctx);
        extra.push(...issueChecks('Shade parameters', 'shade-params', shadeIssues, `${generator.label} shade parameters are within limits.`));
        try {
          shadeMesh = generator.build(params, ctx, { segments, quality: req.quality });
        } catch (e) {
          extra.push({ id: 'shade-build', label: 'Shade geometry', status: 'error', message: (e as Error).message });
        }
      }
      try {
        mesh = withScope((keep) => {
          let collarSolid = keep(toManifold(kernel, mesh));
          collarSolid = applyCollarFeatures(kernel, keep, collarSolid, job, collar, includeShoulder);
          let solid = collarSolid;
          if (shadeMesh) {
            const shade = keep(toManifold(kernel, shadeMesh));
            if (shade.status() !== 'NoError') throw new Error(`shade solid rejected (${shade.status()})`);
            solid = keep(collarSolid.add(shade));
            collarVolume = collarSolid.volume();
            // Everything below the attachment plane must still be exactly the collar.
            const below = keep(solid.trimByPlane([0, 0, -1], -d.attachment.z));
            const delta = Math.abs(below.volume() - collarVolume);
            const tol = Math.max(1e-6 * collarVolume, 1e-3);
            extra.push({
              id: 'collar-preserved',
              label: 'Collar unchanged by shade',
              status: delta <= tol ? 'pass' : 'error',
              message: delta <= tol ? 'Geometry below the attachment plane is identical in volume to the standalone collar.' : `Shade alters the collar region by ${delta.toFixed(3)} mm³.`,
            });
          }
          const status = solid.status();
          if (status !== 'NoError') throw new Error(status);
          return fromManifold(solid);
        });
        extra.push({
          id: 'features',
          label: 'Boolean operations',
          status: 'pass',
          message: job.part === 'assembly' ? 'Shade and collar fused into one solid by the Manifold kernel.' : 'Key, pocket and notch features merged by the Manifold kernel.',
        });
      } catch (e) {
        extra.push({ id: 'features', label: 'Boolean operations', status: 'error', message: `Boolean operation failed: ${(e as Error).message}` });
      }
    }
  }

  if (job.part === 'assembly' && shadeSummary) extra.push(...assemblyChecks(mesh, d.attachment, shadeSummary));

  if (job.part !== 'assembly' && req.orientation === 'inverted') mesh = flipForPrinting(mesh);
  const t1 = performance.now();
  const report = validateMesh(mesh, {
    kernel,
    buildVolume: req.printer.buildVolume,
    safetyMargin: req.printer.safetyMargin,
    extraChecks: extra,
  });
  const t2 = performance.now();
  return { mesh, report, shade: shadeSummary, timings: { buildMs: t1 - t0, validateMs: t2 - t1 } };
}

/** Checks on the finished assembly mesh: flush attachment and envelope compliance. */
function assemblyChecks(mesh: MeshData, attachment: { z: number; radius: number }, shade: ShadeSummary): ValidationCheck[] {
  const p = mesh.positions;
  const tolZ = 1e-3;
  let rAtSeam = 0;
  let rAbove = 0;
  for (let i = 0; i < p.length; i += 3) {
    const z = p[i + 2];
    const r = Math.hypot(p[i], p[i + 1]);
    if (Math.abs(z - attachment.z) < tolZ) rAtSeam = Math.max(rAtSeam, r);
    if (z > attachment.z + tolZ) rAbove = Math.max(rAbove, r);
  }
  const flushErr = Math.abs(rAtSeam - attachment.radius);
  const envelopeOver = rAbove - shade.envelopeRadius;
  return [
    {
      id: 'attachment',
      label: 'Flush shade attachment',
      status: flushErr < 0.01 ? 'pass' : 'error',
      message:
        flushErr < 0.01
          ? `Shade outer surface meets the shoulder at ⌀ ${(attachment.radius * 2).toFixed(3)} mm with no step or gap.`
          : `Outer surface at the attachment plane is ⌀ ${(rAtSeam * 2).toFixed(3)} mm; expected ⌀ ${(attachment.radius * 2).toFixed(3)} mm.`,
    },
    {
      id: 'envelope',
      label: 'Within maximum diameter',
      status: envelopeOver <= 1e-3 ? 'pass' : 'error',
      message:
        envelopeOver <= 1e-3
          ? `Largest shade diameter ${(rAbove * 2).toFixed(2)} mm is within the ${(shade.envelopeRadius * 2).toFixed(2)} mm envelope.`
          : `Shade reaches ⌀ ${(rAbove * 2).toFixed(2)} mm, outside the ${(shade.envelopeRadius * 2).toFixed(2)} mm envelope.`,
    },
  ];
}
