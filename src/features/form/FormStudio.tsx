import { useProjectStore } from '../../state/projectStore';
import { useViewStore } from '../../state/viewStore';
import { useGeometryStore } from '../../state/geometryStore';
import { deriveCollarDimensions } from '../../geometry/collar/collar';
import { PRINT_PRESETS } from '../../geometry/presets';
import { shadeContext } from '../../geometry/buildPart';
import { cylinderShade } from '../../geometry/generators/cylinder';
import { formatLength } from '../../utils/units';
import { LengthField, Readout, Section, Segmented } from '../../components/controls/controls';
import type { TransitionProfile } from '../../types/project';

/** Approximate density for a solid-printed PLA estimate (g/cm³). */
const PLA_DENSITY = 1.24;

export function FormStudio() {
  const collar = useProjectStore((s) => s.project.collar);
  const shade = useProjectStore((s) => s.project.shade);
  const units = useProjectStore((s) => s.project.units);
  const locked = useProjectStore((s) => s.project.collarLocked);
  const printer = useProjectStore((s) => s.project.fabrication.printer);
  const preset = useProjectStore((s) => PRINT_PRESETS[s.project.fabrication.materialPreset]);
  const update = useProjectStore((s) => s.updateCylinderShade);
  const view = useViewStore();
  const result = useGeometryStore((s) => s.result);

  const p = shade.cylinder;
  const d = deriveCollarDimensions(collar);
  const ctx = shadeContext(collar, preset);
  const issues = cylinderShade.check(p, ctx);
  const summary = cylinderShade.summarize(p, ctx);
  const bad = (field: string) => issues.some((i) => i.field === field && i.severity === 'error');
  const fmt = (mm: number) => formatLength(mm, units);
  const maxPrintable = Math.min(printer.buildVolume[0], printer.buildVolume[1]) - 2 * printer.safetyMargin;
  const maxHeight = printer.buildVolume[2] - 2 * printer.safetyMargin - d.totalHeight;
  const assemblyShown = view.part === 'assembly' && result?.shade;

  return (
    <div className="workspace">
      <header className="ws-head">
        <h2>Form Studio</h2>
        <span className="phase-tag">Family: Cylinder</span>
      </header>

      {view.part !== 'assembly' ? (
        <div className="callout">
          The viewport is showing the {view.part === 'collar' ? 'collar only' : 'fit-test ring'}.
          <button type="button" className="btn small" onClick={() => view.showPart('assembly')}>Show lampshade</button>
        </div>
      ) : null}

      {issues.length > 0 ? (
        <ul className="issue-list">
          {issues.map((i, n) => (
            <li key={n} className={i.severity}>{i.message}</li>
          ))}
        </ul>
      ) : null}

      <Section title="Shade dimensions">
        <LengthField
          label="Shade height"
          value={p.height}
          min={10}
          max={Math.max(maxHeight, p.height)}
          step={0.5}
          invalid={bad('height')}
          onChange={(height) => update({ height })}
          hint="Above the collar"
        />
        <LengthField
          label="Overall height"
          value={p.height + d.totalHeight}
          min={d.totalHeight + 10}
          max={Math.max(maxHeight, p.height) + d.totalHeight}
          step={0.5}
          onChange={(v) => update({ height: v - d.totalHeight })}
          hint="Collar + shade"
        />
        <LengthField
          label="Maximum diameter"
          value={p.maxDiameter}
          min={d.shoulderOuterRadius * 2}
          max={Math.max(maxPrintable, p.maxDiameter)}
          step={0.5}
          invalid={bad('maxDiameter')}
          onChange={(maxDiameter) => update({ maxDiameter })}
          hint="Body outside ⌀"
        />
        <button type="button" className="btn small ghost" onClick={() => update({ maxDiameter: d.shoulderOuterRadius * 2 })}>
          Match shoulder (straight cylinder)
        </button>
        <LengthField
          label="Wall thickness"
          value={p.wallThickness}
          min={0.4}
          max={Math.max(4, p.wallThickness)}
          step={0.05}
          invalid={bad('wallThickness')}
          onChange={(wallThickness) => update({ wallThickness })}
          hint={`Min ${preset.minWall} mm · rec. ${preset.recommendedWall} mm`}
        />
      </Section>

      <Section title="Base transition">
        <p className="note">How the wall moves from the collar shoulder (⌀ {fmt(d.shoulderOuterRadius * 2)}) out to the body diameter.</p>
        <LengthField
          label="Transition height"
          value={p.transitionHeight}
          min={0}
          max={Math.max(p.height, 1)}
          step={0.5}
          invalid={bad('transitionHeight')}
          onChange={(transitionHeight) => update({ transitionHeight })}
        />
        <div className="field">
          <div className="field-head"><label>Profile</label></div>
          <Segmented<TransitionProfile>
            value={p.transitionProfile}
            label="Transition profile"
            options={[
              { value: 'smooth', label: 'Smooth' },
              { value: 'linear', label: 'Linear' },
            ]}
            onChange={(transitionProfile) => update({ transitionProfile })}
          />
        </div>
        <Readout label="Steepest wall angle" value={`${summary.maxOverhangDeg.toFixed(1)}° from vertical (limit ${preset.maxOverhangDeg}°)`} />
      </Section>

      <Section title="Summary">
        <Readout label="Overall size" value={`⌀ ${fmt(summary.envelopeRadius * 2)} × ${fmt(summary.topZ)}`} />
        <Readout label="Top opening" value={`⌀ ${fmt(summary.topOpeningDiameter)}`} />
        <Readout label="Attachment" value={`⌀ ${fmt(d.attachment.radius * 2)} at ${fmt(d.attachment.z)}`} />
        <Readout label="Collar" value={locked ? 'Locked (calibrated)' : 'Editable in Fabrication'} />
        {assemblyShown ? (
          <>
            <Readout label="Solid volume" value={`${(result.report.stats.volume / 1000).toFixed(1)} cm³`} />
            <Readout label="Material if printed solid" value={`≈ ${((result.report.stats.volume / 1000) * PLA_DENSITY).toFixed(0)} g PLA`} />
            <Readout
              label="Validation (preview)"
              value={result.report.fatal ? `${result.report.checks.filter((c) => c.status === 'error').length} fatal issue(s)` : result.report.warningCount ? `Valid · ${result.report.warningCount} warning(s)` : 'Valid printable solid'}
            />
          </>
        ) : null}
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => view.set({ workspace: 'fabrication' })}>Collar & export…</button>
          <button type="button" className="btn ghost" onClick={() => update(cylinderShade.defaults())}>Reset shade</button>
        </div>
        <p className="note">The material estimate assumes a fully solid wall; your slicer's figure will differ. Crumpled, twisted, louvered and other families arrive in Phases 3–4.</p>
      </Section>
    </div>
  );
}
