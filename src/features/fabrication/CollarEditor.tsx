import { useProjectStore } from '../../state/projectStore';
import { LengthField, NumberField, Readout, Section, Toggle } from '../../components/controls/controls';
import { checkCollarParams, defaultCollarParams, deriveCollarDimensions } from '../../geometry/collar/collar';
import { PRINT_PRESETS } from '../../geometry/presets';
import { formatLength } from '../../utils/units';

export function CollarEditor() {
  const collar = useProjectStore((s) => s.project.collar);
  const locked = useProjectStore((s) => s.project.collarLocked);
  const units = useProjectStore((s) => s.project.units);
  const preset = useProjectStore((s) => PRINT_PRESETS[s.project.fabrication.materialPreset]);
  const update = useProjectStore((s) => s.updateCollar);
  const setLocked = useProjectStore((s) => s.setCollarLocked);
  const d = deriveCollarDimensions(collar);
  const issues = checkCollarParams(collar, preset.minWall, preset.recommendedWall);
  const bad = (field: string) => issues.some((i) => i.field === field && i.severity === 'error');
  const fmt = (mm: number) => formatLength(mm, units);

  return (
    <>
      <div className={`lock-banner ${locked ? 'locked' : ''}`}>
        <Toggle
          label={locked ? 'Collar geometry locked' : 'Collar geometry editable'}
          description={locked ? 'Calibrated fit is protected. Unlock to edit.' : 'Lock after calibrating so the fit cannot change accidentally.'}
          checked={locked}
          onChange={setLocked}
        />
      </div>

      {issues.length > 0 ? (
        <ul className="issue-list">
          {issues.map((i, n) => (
            <li key={n} className={i.severity}>{i.message}</li>
          ))}
        </ul>
      ) : null}

      <Section title="Base & fit">
        <LengthField
          label="Base interior diameter"
          value={collar.baseInteriorDiameter}
          min={60}
          max={160}
          step={0.01}
          disabled={locked}
          invalid={bad('baseInteriorDiameter')}
          onChange={(v) => update({ baseInteriorDiameter: v })}
          hint="Measured clear opening"
        />
        <LengthField
          label="Diametral fit clearance"
          value={collar.fitClearance}
          min={0}
          max={2}
          step={0.01}
          disabled={locked}
          invalid={bad('fitClearance')}
          onChange={(v) => update({ fitClearance: v })}
        />
        <Readout label="Insertion outside diameter" value={fmt(d.insertionOuterDiameter)} />
      </Section>

      <Section title="Insertion region">
        <LengthField label="Insertion height" value={collar.insertionHeight} min={3} max={40} step={0.1} disabled={locked} invalid={bad('insertionHeight')} onChange={(v) => update({ insertionHeight: v })} />
        <LengthField label="Wall thickness" value={collar.wallThickness} min={0.4} max={6} step={0.01} disabled={locked} invalid={bad('wallThickness')} onChange={(v) => update({ wallThickness: v })} />
        <LengthField
          label="Inner diameter"
          value={d.innerDiameter}
          min={d.insertionOuterDiameter - 12}
          max={d.insertionOuterDiameter - 0.8}
          step={0.01}
          disabled={locked}
          onChange={(v) => update({ wallThickness: (d.insertionOuterDiameter - v) / 2 })}
          hint="Sets wall thickness"
        />
        <LengthField label="Lead-in chamfer" value={collar.leadInChamfer} min={0} max={2} step={0.05} disabled={locked} invalid={bad('leadInChamfer')} onChange={(v) => update({ leadInChamfer: v })} />
      </Section>

      <Section title="Upper shoulder">
        <LengthField label="Shoulder height" value={collar.shoulderHeight} min={0.8} max={15} step={0.05} disabled={locked} invalid={bad('shoulderHeight')} onChange={(v) => update({ shoulderHeight: v })} />
        <LengthField
          label="Shoulder outer diameter"
          value={collar.shoulderOuterDiameter}
          min={collar.baseInteriorDiameter - 4}
          max={collar.baseInteriorDiameter + 40}
          step={0.05}
          disabled={locked}
          invalid={bad('shoulderOuterDiameter')}
          onChange={(v) => update({ shoulderOuterDiameter: v })}
          hint="Set from the base rim"
        />
        <LengthField
          label="Radial overlap on rim"
          value={d.shoulderRadialOverlap}
          min={-2}
          max={20}
          step={0.05}
          disabled={locked}
          onChange={(v) => update({ shoulderOuterDiameter: collar.baseInteriorDiameter + 2 * v })}
          hint="Sets shoulder OD"
        />
        <Readout label="Shade attachment boundary" value={`⌀ ${fmt(d.attachment.radius * 2)} at z ${fmt(d.attachment.z)}`} />
        <p className="note">The shade grows from this edge, flush with the outside wall of the shoulder. Shade settings are in Form Studio.</p>
      </Section>

      <Section title="Optional features" defaultOpen={false}>
        <Toggle label="Inner retention lip" description="Inward ledge at the top of the bore" checked={collar.retentionLip.enabled} disabled={locked} onChange={(enabled) => update({ retentionLip: { ...collar.retentionLip, enabled } })} />
        {collar.retentionLip.enabled ? (
          <>
            <LengthField label="Lip width" value={collar.retentionLip.width} min={0.4} max={6} disabled={locked} onChange={(width) => update({ retentionLip: { ...collar.retentionLip, width } })} />
            <LengthField label="Lip height" value={collar.retentionLip.height} min={0.4} max={8} disabled={locked} onChange={(height) => update({ retentionLip: { ...collar.retentionLip, height } })} />
          </>
        ) : null}
        <Toggle label="Alignment key" description="Vertical rib at 0°; needs a matching slot in the base" checked={collar.alignmentKey.enabled} disabled={locked} onChange={(enabled) => update({ alignmentKey: { ...collar.alignmentKey, enabled } })} />
        {collar.alignmentKey.enabled ? (
          <>
            <LengthField label="Key width" value={collar.alignmentKey.width} min={0.8} max={10} disabled={locked} onChange={(width) => update({ alignmentKey: { ...collar.alignmentKey, width } })} />
            <LengthField label="Key depth" value={collar.alignmentKey.depth} min={0.4} max={5} disabled={locked} onChange={(depth) => update({ alignmentKey: { ...collar.alignmentKey, depth } })} />
          </>
        ) : null}
        <Toggle label="Magnet / sensor pockets" description="Future shade identification. Underside of shoulder." checked={collar.magnetPockets.enabled} disabled={locked} onChange={(enabled) => update({ magnetPockets: { ...collar.magnetPockets, enabled } })} />
        {collar.magnetPockets.enabled ? (
          <>
            <NumberField label="Pocket count" value={collar.magnetPockets.count} min={1} max={12} integer disabled={locked} onChange={(count) => update({ magnetPockets: { ...collar.magnetPockets, count } })} />
            <LengthField label="Pocket diameter" value={collar.magnetPockets.diameter} min={1} max={10} disabled={locked} onChange={(diameter) => update({ magnetPockets: { ...collar.magnetPockets, diameter } })} />
            <LengthField label="Pocket depth" value={collar.magnetPockets.depth} min={0.4} max={6} disabled={locked} onChange={(depth) => update({ magnetPockets: { ...collar.magnetPockets, depth } })} />
          </>
        ) : null}
      </Section>

      <button
        type="button"
        className="btn ghost"
        disabled={locked}
        onClick={() => {
          if (confirm('Reset all collar parameters to defaults?')) update(defaultCollarParams());
        }}
      >
        Reset collar to defaults
      </button>
    </>
  );
}
