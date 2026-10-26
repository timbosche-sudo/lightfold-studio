import { useMemo } from 'react';
import { useProjectStore } from '../../state/projectStore';
import { useViewStore } from '../../state/viewStore';
import { useGeometryStore } from '../../state/geometryStore';
import { deriveCollarDimensions } from '../../geometry/collar/collar';
import { PRINT_PRESETS } from '../../geometry/presets';
import { shadeContext } from '../../geometry/buildPart';
import { FAMILY_ORDER, SHADE_GENERATORS, shadeFor } from '../../geometry/generators/registry';
import { formatLength } from '../../utils/units';
import { LengthField, Readout, Section } from '../../components/controls/controls';
import type { ShadeDesign, ShadeFamilyId } from '../../types/project';
import { FamilySketch } from './FamilySketch';
import { FamilyControls, varyParams } from './FamilyControls';

/** Approximate density for a solid-printed PLA estimate (g/cm³). */
const PLA_DENSITY = 1.24;

export function FormStudio() {
  const collar = useProjectStore((s) => s.project.collar);
  const shade = useProjectStore((s) => s.project.shade);
  const units = useProjectStore((s) => s.project.units);
  const locked = useProjectStore((s) => s.project.collarLocked);
  const printer = useProjectStore((s) => s.project.fabrication.printer);
  const presetId = useProjectStore((s) => s.project.fabrication.materialPreset);
  const updateCommon = useProjectStore((s) => s.updateShadeCommon);
  const updateFamily = useProjectStore((s) => s.updateFamily);
  const setFamily = useProjectStore((s) => s.setFamily);
  const view = useViewStore();
  const result = useGeometryStore((s) => s.result);

  const preset = PRINT_PRESETS[presetId];
  const ctx = useMemo(() => shadeContext(collar, preset), [collar, preset]);
  const d = deriveCollarDimensions(collar);
  const family = shade.family;
  const { generator, params } = shadeFor(shade, family);
  const issues = useMemo(() => generator.check(params, ctx), [generator, params, ctx]);
  const summary = useMemo(() => generator.summarize(params, ctx), [generator, params, ctx]);
  const c = shade.common;
  const bad = (field: string) => issues.some((i) => i.field === field && i.severity === 'error');
  const fmt = (mm: number) => formatLength(mm, units);
  const maxPrintable = Math.min(printer.buildVolume[0], printer.buildVolume[1]) - 2 * printer.safetyMargin;
  const maxHeight = printer.buildVolume[2] - 2 * printer.safetyMargin - d.totalHeight;
  const familyValues = shade[family] as unknown as Record<string, unknown>;
  const setFamilyValue = (key: string, value: number | string) => updateFamily(family, { [key]: value } as never);
  const live = view.part === 'assembly' && result?.shade && !result.draft ? result : null;

  const selectFamily = (f: ShadeFamilyId) => {
    setFamily(f);
    // Sculpted families need room to grow out of the collar.
    const need = SHADE_GENERATORS[f].minTransitionHeight;
    if (c.transitionHeight < need) updateCommon({ transitionHeight: need });
    view.showPart('assembly');
  };

  const applyExample = (params: Partial<ShadeDesign[ShadeFamilyId]>) => updateFamily(family, params as never);

  return (
    <div className="workspace">
      <header className="ws-head">
        <h2>Form Studio</h2>
        <span className="phase-tag">{generator.label}</span>
      </header>

      {view.part !== 'assembly' ? (
        <div className="callout">
          The viewport is showing the {view.part === 'collar' ? 'collar only' : 'fit-test ring'}.
          <button type="button" className="btn small" onClick={() => view.showPart('assembly')}>Show lampshade</button>
        </div>
      ) : null}

      <div className="family-picker" role="radiogroup" aria-label="Shade family">
        {FAMILY_ORDER.map((f) => (
          <button key={f} type="button" role="radio" aria-checked={family === f} className={`family-card ${family === f ? 'active' : ''}`} onClick={() => selectFamily(f)}>
            <FamilySketch design={shade} family={f} ctx={ctx} width={62} height={46} />
            <span>{SHADE_GENERATORS[f].label}</span>
          </button>
        ))}
      </div>
      <p className="family-desc">{generator.description}</p>

      {issues.length > 0 ? (
        <ul className="issue-list">
          {issues.map((i, n) => (
            <li key={n} className={i.severity}>{i.message}</li>
          ))}
        </ul>
      ) : null}

      <Section title="Examples">
        <div className="example-strip">
          {generator.examples.map((ex) => {
            const exDesign = { ...shade, [family]: { ...(shade[family] as object), ...ex.params } } as ShadeDesign;
            return (
              <button key={ex.name} type="button" className="example-card" onClick={() => applyExample(ex.params)}>
                <FamilySketch design={exDesign} family={family} ctx={ctx} width={64} height={46} />
                <span>{ex.name}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Sculpt">
        {generator.controls.length > 1 ? (
          <div className="btn-row compact sculpt-actions">
            <button type="button" className="btn small" onClick={() => updateFamily(family, varyParams(generator.controls, familyValues) as never)}>Vary</button>
            <button type="button" className="btn small ghost" onClick={() => updateFamily(family, generator.defaults() as never)}>Reset {generator.label.toLowerCase()}</button>
          </div>
        ) : null}
        <FamilyControls controls={generator.controls} values={familyValues} invalid={bad} onChange={setFamilyValue} />
      </Section>

      <Section title="Dimensions">
        <LengthField label="Shade height" value={c.height} min={20} max={Math.max(maxHeight, c.height)} step={0.5} invalid={bad('height')} onChange={(height) => updateCommon({ height })} hint="Above the collar" />
        <LengthField label="Overall height" value={c.height + d.totalHeight} min={d.totalHeight + 20} max={Math.max(maxHeight, c.height) + d.totalHeight} step={0.5} onChange={(v) => updateCommon({ height: v - d.totalHeight })} hint="Collar + shade" />
        <LengthField label="Maximum diameter" value={c.maxDiameter} min={d.shoulderOuterRadius * 2} max={Math.max(maxPrintable, c.maxDiameter)} step={0.5} invalid={bad('maxDiameter')} onChange={(maxDiameter) => updateCommon({ maxDiameter })} hint="Envelope — the form never exceeds it" />
        {family === 'cylinder' ? (
          <button type="button" className="btn small ghost" onClick={() => updateCommon({ maxDiameter: d.shoulderOuterRadius * 2 })}>Match shoulder (straight cylinder)</button>
        ) : null}
        <LengthField label="Wall thickness" value={c.wallThickness} min={0.4} max={Math.max(4, c.wallThickness)} step={0.05} invalid={bad('wallThickness')} onChange={(wallThickness) => updateCommon({ wallThickness })} hint={`Min ${preset.minWall} mm · rec. ${preset.recommendedWall} mm`} />
        <LengthField label="Transition height" value={c.transitionHeight} min={0} max={Math.max(c.height, 1)} step={0.5} invalid={bad('transitionHeight')} onChange={(transitionHeight) => updateCommon({ transitionHeight })} hint={generator.minTransitionHeight ? `Grows out of the collar · min ${generator.minTransitionHeight} mm` : 'Grows out of the collar'} />
      </Section>

      <Section title="Fabrication insight">
        <Readout label="Overall size" value={`⌀ ${fmt(summary.envelopeRadius * 2)} × ${fmt(summary.topZ)}`} />
        <Readout label="Top opening" value={`⌀ ${fmt(summary.topOpeningDiameter)}`} />
        <Readout
          label="Steepest wall"
          value={`${summary.maxOverhangDeg.toFixed(0)}° from vertical${summary.overhangFraction ? ` · ${(summary.overhangFraction * 100).toFixed(1)}% > ${preset.maxOverhangDeg}°` : ''}`}
        />
        {summary.envelopeScale !== undefined && summary.envelopeScale < 0.999 ? <Readout label="Fitted to envelope" value={`scaled to ${(summary.envelopeScale * 100).toFixed(0)}%`} /> : null}
        <Readout label="Collar" value={locked ? 'Locked (calibrated)' : 'Editable in Fabrication'} />
        {live ? (
          <>
            {live.shade?.minWallEstimate !== undefined ? <Readout label="Thinnest wall (measured)" value={fmt(live.shade.minWallEstimate)} /> : null}
            <Readout label="Solid volume" value={`${(live.report.stats.volume / 1000).toFixed(1)} cm³ · ≈ ${((live.report.stats.volume / 1000) * PLA_DENSITY).toFixed(0)} g PLA if solid`} />
            <Readout
              label="Validation (preview)"
              value={live.report.fatal ? `${live.report.checks.filter((x) => x.status === 'error').length} fatal issue(s)` : live.report.warningCount ? `Valid · ${live.report.warningCount} warning(s)` : 'Valid printable solid'}
            />
          </>
        ) : (
          <Readout label="Validation" value="Updating…" />
        )}
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => view.set({ workspace: 'fabrication' })}>Collar & export…</button>
        </div>
        <p className="note">Every export is rebuilt at full resolution and re-checked, including the self-intersection test. The material estimate assumes a solid wall.</p>
      </Section>
    </div>
  );
}
