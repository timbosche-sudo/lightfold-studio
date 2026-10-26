import { useGeometryStore } from '../../state/geometryStore';
import { useProjectStore } from '../../state/projectStore';
import { useViewStore } from '../../state/viewStore';
import { deriveCollarDimensions } from '../../geometry/collar/collar';
import { formatLength } from '../../utils/units';

export function ViewportHud() {
  const { result, building, error } = useGeometryStore();
  const collar = useProjectStore((s) => s.project.collar);
  const calibration = useProjectStore((s) => s.project.calibration);
  const units = useProjectStore((s) => s.project.units);
  const showDims = useViewStore((s) => s.showDimensions);
  const part = useViewStore((s) => s.part);
  const fitIndex = useViewStore((s) => s.fitTestIndex);
  const showBase = useViewStore((s) => s.showBase);

  const errors = result?.report.checks.filter((c) => c.status === 'error').length ?? 0;
  const warnings = result?.report.checks.filter((c) => c.status === 'warning').length ?? 0;
  const clearance = part === 'fit-test' ? calibration.testClearances[Math.min(fitIndex, calibration.testClearances.length - 1)] : collar.fitClearance;
  const d = deriveCollarDimensions({ ...collar, fitClearance: clearance ?? collar.fitClearance });

  return (
    <>
      <div className="hud hud-status">
        {error ? (
          <span className="badge error">Build failed: {error}</span>
        ) : !result ? (
          <span className="badge">Loading geometry kernel…</span>
        ) : errors ? (
          <span className="badge error">{errors} fatal issue{errors > 1 ? 's' : ''}</span>
        ) : (
          <span className="badge ok">Valid solid{warnings ? ` · ${warnings} warning${warnings > 1 ? 's' : ''}` : ''}</span>
        )}
        {building ? <span className="badge subtle">updating…</span> : null}
        <span className="badge subtle">
          {part === 'fit-test' ? `Fit-test ring #${fitIndex + 1}` : 'Collar'}
          {result ? ` · ${result.report.stats.triangles.toLocaleString()} tris · preview` : ''}
        </span>
      </div>
      {showDims && result ? (
        <div className="hud hud-dims">
          <div><span>Insertion OD</span><strong>{formatLength(d.insertionOuterDiameter, units)}</strong></div>
          <div><span>Base ID</span><strong>{formatLength(collar.baseInteriorDiameter, units)}</strong></div>
          <div><span>Clearance</span><strong>{formatLength(clearance ?? 0, units)}</strong></div>
          <div><span>Shoulder OD</span><strong>{formatLength(collar.shoulderOuterDiameter, units)}</strong></div>
          <div><span>Height</span><strong>{formatLength(result.report.stats.size[2], units)}</strong></div>
          {showBase ? <div className="note">Blue ghost = reference base (not generated)</div> : null}
        </div>
      ) : null}
    </>
  );
}
