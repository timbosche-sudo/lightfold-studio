import type { CollarOrientation, CollarParams, FitTestParams, MaterialPresetId, PrinterProfile } from '../types/project';
import type { MeshData } from './core/mesh';
import { flipForPrinting } from './core/mesh';
import { checkProfile, revolveProfile } from './core/revolve';
import { checkCollarParams, collarProfile, deriveCollarDimensions } from './collar/collar';
import type { Kernel } from './kernel/manifoldKernel';
import { fromManifold, toManifold, withScope } from './kernel/manifoldKernel';
import type { ValidationCheck, ValidationReport } from './validation/validateMesh';
import { validateMesh } from './validation/validateMesh';
import { PRINT_PRESETS } from './presets';

export type Quality = 'preview' | 'fabrication';

export const SEGMENTS: Record<Quality, number> = { preview: 144, fabrication: 360 };

export type PartJob =
  | { part: 'collar'; collar: CollarParams }
  | { part: 'fit-test'; collar: CollarParams; fitTest: FitTestParams; clearance: number; label: number };

export interface BuildJob {
  job: PartJob;
  quality: Quality;
  /** 'installed' keeps the as-assembled pose (z = 0 at insertion bottom). */
  orientation: CollarOrientation;
  printer: PrinterProfile;
  materialPreset: MaterialPresetId;
}

export interface BuildResult {
  mesh: MeshData;
  report: ValidationReport;
  timings: { buildMs: number; validateMs: number };
}

/** Collar parameters actually used for a job (fit-test overrides). */
export function effectiveCollar(job: PartJob): { collar: CollarParams; includeShoulder: boolean } {
  if (job.part === 'collar') return { collar: job.collar, includeShoulder: true };
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

function paramChecks(issues: ReturnType<typeof checkCollarParams>): ValidationCheck[] {
  if (issues.length === 0) {
    return [{ id: 'params', label: 'Collar parameters', status: 'pass', message: 'All collar parameters are within limits.' }];
  }
  return issues.map((i, n) => ({ id: `param-${n}-${i.field}`, label: 'Collar parameters', status: i.severity === 'error' ? 'error' : 'warning', message: i.message }));
}

/**
 * Build the requested part from parameters, then validate the real mesh.
 * Requires the Manifold kernel when Boolean features are enabled.
 */
export function buildPart(req: BuildJob, kernel: Kernel | null): BuildResult {
  const t0 = performance.now();
  const preset = PRINT_PRESETS[req.materialPreset];
  const { collar, includeShoulder } = effectiveCollar(req.job);
  const issues = checkCollarParams(collar, preset.minWall, preset.recommendedWall);
  if (req.job.part === 'fit-test' && req.job.fitTest.height <= collar.leadInChamfer * 2) {
    issues.push({ severity: 'error', field: 'fitTest', message: 'Fit-test height must exceed twice the lead-in chamfer.' });
  }
  const profile = collarProfile(collar, { includeShoulder });
  const profileProblems = checkProfile(profile);
  const extra: ValidationCheck[] = paramChecks(issues);
  extra.push({
    id: 'profile',
    label: 'Collar cross-section',
    status: profileProblems.length ? 'error' : 'pass',
    message: profileProblems.length ? profileProblems.join(' ') : 'Cross-section is a simple closed polygon.',
  });

  let mesh = revolveProfile(profile, SEGMENTS[req.quality]);
  const d = deriveCollarDimensions(collar);
  const needsBoolean =
    !profileProblems.length &&
    (collar.alignmentKey.enabled || collar.magnetPockets.enabled || (req.job.part === 'fit-test' && req.job.fitTest.idNotches));

  if (needsBoolean) {
    if (!kernel) {
      extra.push({ id: 'features', label: 'Boolean features', status: 'error', message: 'Geometry kernel unavailable; key, pockets and notches could not be applied.' });
    } else {
      try {
        mesh = withScope((keep) => {
          let solid = keep(toManifold(kernel, mesh));
          const { Manifold } = kernel;
          const key = collar.alignmentKey;
          if (key.enabled) {
            // Rib on the insertion OD at +X, embedded 0.5 mm into the wall and up into the shoulder.
            const zTop = includeShoulder ? collar.insertionHeight + 0.5 : collar.insertionHeight;
            const zBottom = collar.leadInChamfer + 0.2;
            const radial = key.depth + 0.5;
            const rib = keep(
              Manifold.cube([radial, key.width, zTop - zBottom], false).translate([d.insertionOuterRadius - 0.5, -key.width / 2, zBottom]),
            );
            solid = keep(solid.add(rib));
          }
          const mag = collar.magnetPockets;
          if (mag.enabled && includeShoulder) {
            const rMid = (d.insertionOuterRadius + d.shoulderOuterRadius) / 2;
            const cutters = [];
            for (let i = 0; i < mag.count; i++) {
              const ang = (360 / mag.count) * i + 180 / mag.count;
              cutters.push(
                keep(
                  Manifold.cylinder(mag.depth + 0.5, mag.diameter / 2, mag.diameter / 2, 32)
                    .translate([rMid, 0, collar.insertionHeight - 0.5])
                    .rotate([0, 0, ang]),
                ),
              );
            }
            solid = keep(solid.subtract(keep(Manifold.union(cutters))));
          }
          if (req.job.part === 'fit-test' && req.job.fitTest.idNotches) {
            const top = includeShoulder ? d.totalHeight : collar.insertionHeight;
            const rEdge = includeShoulder ? d.shoulderOuterRadius : d.insertionOuterRadius;
            const depth = Math.min(1.0, (includeShoulder ? d.shoulderLedge : collar.wallThickness) * 0.5);
            const notchH = Math.min(1.0, (includeShoulder ? collar.shoulderHeight : collar.insertionHeight) * 0.4);
            const cutters = [];
            for (let i = 0; i < req.job.label; i++) {
              cutters.push(
                keep(
                  Manifold.cube([depth + 1, 1.0, notchH + 1], false)
                    .translate([rEdge - depth, -0.5, top - notchH])
                    .rotate([0, 0, 90 + i * 8]),
                ),
              );
            }
            solid = keep(solid.subtract(keep(Manifold.union(cutters))));
          }
          const status = solid.status();
          if (status !== 'NoError') throw new Error(status);
          return fromManifold(solid);
        });
        extra.push({ id: 'features', label: 'Boolean features', status: 'pass', message: 'Key, pocket and notch features merged by the Manifold kernel.' });
      } catch (e) {
        extra.push({ id: 'features', label: 'Boolean features', status: 'error', message: `Boolean feature operation failed: ${(e as Error).message}` });
      }
    }
  }

  if (req.orientation === 'inverted') mesh = flipForPrinting(mesh);
  const t1 = performance.now();
  const report = validateMesh(mesh, {
    kernel,
    buildVolume: req.printer.buildVolume,
    safetyMargin: req.printer.safetyMargin,
    extraChecks: extra,
  });
  const t2 = performance.now();
  return { mesh, report, timings: { buildMs: t1 - t0, validateMs: t2 - t1 } };
}
