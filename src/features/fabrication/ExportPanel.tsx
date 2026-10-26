import { useState } from 'react';
import { useProjectStore } from '../../state/projectStore';
import { useGeometryStore } from '../../state/geometryStore';
import { useViewStore } from '../../state/viewStore';
import { LengthField, Section, Segmented, Toggle } from '../../components/controls/controls';
import { PRINT_PRESETS } from '../../geometry/presets';
import { exportAssembly, exportCollar, type ExportOutcome } from '../../services/exportService';
import type { CollarOrientation, MaterialPresetId } from '../../types/project';
import { ValidationReportView } from './ValidationReportView';

export function PrintSetup() {
  const fab = useProjectStore((s) => s.project.fabrication);
  const update = useProjectStore((s) => s.updateFabrication);
  const preset = PRINT_PRESETS[fab.materialPreset];
  return (
    <Section title="Printer & material" defaultOpen={false}>
      <div className="field">
        <div className="field-head"><label>Print preset</label></div>
        <select value={fab.materialPreset} onChange={(e) => update({ materialPreset: e.target.value as MaterialPresetId })}>
          {Object.values(PRINT_PRESETS).map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <p className="note">
          Minimum wall {preset.minWall} mm (error below), recommended {preset.recommendedWall} mm, layer {preset.layerHeight} mm. Guidance only — always verify in Bambu Studio.
        </p>
      </div>
      <p className="note">
        {fab.printer.name}: {fab.printer.buildVolume.join(' × ')} mm nominal build volume.
      </p>
      <LengthField label="Build volume safety margin" value={fab.printer.safetyMargin} min={0} max={20} step={0.5} onChange={(safetyMargin) => update({ printer: { ...fab.printer, safetyMargin } })} />
      <div className="field">
        <div className="field-head"><label>Collar export orientation</label></div>
        <Segmented<CollarOrientation>
          value={fab.collarOrientation}
          options={[
            { value: 'inverted', label: 'Shoulder on bed' },
            { value: 'installed', label: 'As installed' },
          ]}
          onChange={(collarOrientation) => update({ collarOrientation })}
        />
        <p className="note">
          Shoulder-on-bed avoids the shoulder underside overhang and puts the lead-in chamfer at the top. Applies to collar and fit-test exports.
        </p>
      </div>
    </Section>
  );
}

export function ExportPanel({ outcome, onOutcome }: { outcome: ExportOutcome | null; onOutcome: (o: ExportOutcome) => void }) {
  const preview = useGeometryStore((s) => s.result);
  const recordExport = useProjectStore((s) => s.recordExport);
  const history = useProjectStore((s) => s.project.fabrication.exportHistory);
  const part = useViewStore((s) => s.part);
  const [diagnostic, setDiagnostic] = useState(false);
  const [busy, setBusy] = useState<'assembly' | 'collar' | null>(null);

  const doExport = async (kind: 'assembly' | 'collar') => {
    setBusy(kind);
    try {
      const project = useProjectStore.getState().project;
      const o = kind === 'assembly' ? await exportAssembly(project, diagnostic) : await exportCollar(project, diagnostic);
      if (o.ok) {
        recordExport({ kind, filename: o.filename!, triangles: o.result?.report.stats.triangles ?? 0, diagnostic: !!o.result?.report.fatal });
      }
      onOutcome(o);
    } catch (e) {
      onOutcome({ ok: false, message: `Export failed: ${(e as Error).message}` });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Section title="Export">
        <button type="button" className="btn primary" disabled={busy !== null} onClick={() => doExport('assembly')}>
          {busy === 'assembly' ? 'Building fabrication mesh…' : 'Export lampshade STL (shade + collar)'}
        </button>
        <button type="button" className="btn" disabled={busy !== null} onClick={() => doExport('collar')}>
          {busy === 'collar' ? 'Building fabrication mesh…' : 'Export collar only STL'}
        </button>
        <Toggle
          label="Diagnostic export"
          description="Allow exporting geometry with fatal errors, for troubleshooting only. Filename is marked DIAGNOSTIC."
          checked={diagnostic}
          onChange={setDiagnostic}
        />
        <p className="note">
          Exports are rebuilt at fabrication resolution (360 segments) and re-validated before download. Binary STL, millimetres.
          The lampshade exports as one fused solid standing on the collar, as installed. Shade-only and multipart exports with joints arrive in Phase 8.
        </p>
        {outcome ? (
          <div className={`callout ${outcome.ok ? 'ok' : 'error'}`}>
            {outcome.message}
            {outcome.download ? (
              <a className="btn small" href={outcome.download.url} download={outcome.download.filename}>
                Download again
              </a>
            ) : null}
          </div>
        ) : null}
        {outcome?.result ? <ValidationReportView report={outcome.result.report} title="Last export — fabrication mesh" /> : null}
      </Section>

      {preview ? (
        <Section title={`Live validation — ${part === 'fit-test' ? 'fit-test ring' : part === 'collar' ? 'collar' : 'lampshade'} preview`}>
          <ValidationReportView report={preview.report} title="Preview mesh (144 segments)" />
          <p className="note">Build {preview.timings.buildMs.toFixed(0)} ms · validate {preview.timings.validateMs.toFixed(0)} ms (in worker)</p>
        </Section>
      ) : null}

      <Section title="Export history" defaultOpen={false}>
        {history.length === 0 ? (
          <p className="note">No exports yet.</p>
        ) : (
          <ul className="history">
            {history.map((h) => (
              <li key={h.id}>
                <span>{h.filename}</span>
                <small>{new Date(h.at).toLocaleString()}{h.diagnostic ? ' · DIAGNOSTIC' : ''}</small>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
