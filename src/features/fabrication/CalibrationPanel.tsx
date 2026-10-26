import { useState } from 'react';
import { useProjectStore } from '../../state/projectStore';
import { useViewStore } from '../../state/viewStore';
import { LengthField, Section, Segmented, Toggle } from '../../components/controls/controls';
import { deriveCollarDimensions } from '../../geometry/collar/collar';
import { formatLength, parseLength } from '../../utils/units';
import { exportFitTest, exportFitTestSet, type ExportOutcome } from '../../services/exportService';

type HeightPreset = '5' | '10' | 'full' | 'custom';

export function CalibrationPanel({ onOutcome }: { onOutcome: (o: ExportOutcome) => void }) {
  const project = useProjectStore((s) => s.project);
  const { collar, calibration, collarLocked, units } = project;
  const updateCalibration = useProjectStore((s) => s.updateCalibration);
  const updateFitTest = useProjectStore((s) => s.updateFitTest);
  const forceCollar = useProjectStore((s) => s.forceCollar);
  const setLocked = useProjectStore((s) => s.setCollarLocked);
  const recordExport = useProjectStore((s) => s.recordExport);
  const view = useViewStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [newClearance, setNewClearance] = useState('');

  const ft = calibration.fitTest;
  const preset: HeightPreset = ft.height === 5 ? '5' : ft.height === 10 ? '10' : Math.abs(ft.height - collar.insertionHeight) < 1e-6 ? 'full' : 'custom';

  const run = async (key: string, fn: () => Promise<ExportOutcome>, record: (o: ExportOutcome) => void) => {
    setBusy(key);
    try {
      const o = await fn();
      if (o.ok) record(o);
      onOutcome(o);
    } catch (e) {
      onOutcome({ ok: false, message: `Export failed: ${(e as Error).message}` });
    } finally {
      setBusy(null);
    }
  };

  const addClearance = () => {
    const mm = parseLength(newClearance, 'mm');
    if (mm === null || mm < 0 || mm > 3) return;
    const list = [...calibration.testClearances, Math.round(mm * 1000) / 1000].sort((a, b) => a - b);
    updateCalibration({ testClearances: Array.from(new Set(list)) });
    setNewClearance('');
  };

  return (
    <Section title="Collar fit calibration">
      <p className="note">
        Print the test rings, try each in the base, then choose the clearance that fits best. Values are trial clearances, not manufacturing guarantees.
      </p>
      <LengthField
        label="Measured base interior diameter"
        value={collar.baseInteriorDiameter}
        min={60}
        max={160}
        step={0.01}
        disabled={collarLocked}
        onChange={(v) => forceCollar({ baseInteriorDiameter: v })}
      />
      <div className="field">
        <div className="field-head"><label>Test ring height</label></div>
        <Segmented<HeightPreset>
          value={preset}
          label="Test ring height"
          options={[
            { value: '5', label: '5 mm' },
            { value: '10', label: '10 mm' },
            { value: 'full', label: 'Full' },
            { value: 'custom', label: 'Custom' },
          ]}
          onChange={(v) => {
            if (v === '5') updateFitTest({ height: 5 });
            else if (v === '10') updateFitTest({ height: 10 });
            else if (v === 'full') updateFitTest({ height: collar.insertionHeight });
            else updateFitTest({ height: ft.height + 0.5 });
          }}
        />
      </div>
      {preset === 'custom' ? (
        <LengthField label="Custom height" value={ft.height} min={2} max={40} step={0.1} onChange={(height) => updateFitTest({ height })} />
      ) : null}
      <Toggle label="Include shoulder" description="Lets the ring seat on the rim like the real collar" checked={ft.includeShoulder} onChange={(includeShoulder) => updateFitTest({ includeShoulder })} />
      <Toggle label="ID notches" description="Ring n gets n notches so prints can be told apart" checked={ft.idNotches} onChange={(idNotches) => updateFitTest({ idNotches })} />

      <ul className="cal-list">
        {calibration.testClearances.map((c, i) => {
          const od = deriveCollarDimensions({ ...collar, fitClearance: c }).insertionOuterDiameter;
          const selected = calibration.selectedClearance === c;
          const viewing = view.part === 'fit-test' && view.fitTestIndex === i;
          return (
            <li key={`${c}-${i}`} className={selected ? 'selected' : ''}>
              <div className="cal-row-head">
                <span className="cal-index">{i + 1}</span>
                <span>
                  <strong>{c.toFixed(2)} mm</strong> clearance
                  <small>
                    Insertion ⌀ {od.toFixed(4)} mm{units === 'in' ? ` · ${formatLength(od, 'in')}` : ''}
                  </small>
                </span>
                <button
                  type="button"
                  className="btn small ghost"
                  aria-label={`Remove clearance ${c}`}
                  disabled={calibration.testClearances.length <= 1}
                  onClick={() => {
                    updateCalibration({ testClearances: calibration.testClearances.filter((_, j) => j !== i) });
                    if (view.fitTestIndex >= calibration.testClearances.length - 1) view.set({ fitTestIndex: 0 });
                  }}
                >
                  ✕
                </button>
              </div>
              <div className="btn-row compact">
                <button type="button" className={`btn small ${viewing ? 'active' : ''}`} onClick={() => view.set({ part: 'fit-test', fitTestIndex: i })}>
                  {viewing ? 'Viewing' : 'View'}
                </button>
                <button
                  type="button"
                  className="btn small"
                  disabled={busy !== null}
                  onClick={() =>
                    run(`ring-${i}`, () => exportFitTest(useProjectStore.getState().project, i, false), (o) =>
                      recordExport({ kind: 'fit-test', filename: o.filename!, triangles: o.result?.report.stats.triangles ?? 0, diagnostic: false }),
                    )
                  }
                >
                  {busy === `ring-${i}` ? 'Building…' : 'Export STL'}
                </button>
                <button
                  type="button"
                  className={`btn small ${selected ? 'active' : ''}`}
                  disabled={collarLocked}
                  onClick={() => {
                    forceCollar({ fitClearance: c });
                    updateCalibration({ selectedClearance: c });
                  }}
                >
                  {selected ? 'Chosen' : 'Use for collar'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="inline-add">
        <input type="text" inputMode="decimal" placeholder="Add clearance (mm)" value={newClearance} onChange={(e) => setNewClearance(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addClearance()} />
        <button type="button" className="btn small" onClick={addClearance}>Add</button>
      </div>
      <button
        type="button"
        className="btn primary"
        disabled={busy !== null}
        onClick={() =>
          run('set', () => exportFitTestSet(useProjectStore.getState().project), (o) =>
            recordExport({ kind: 'fit-test-set', filename: o.filename!, triangles: 0, diagnostic: false }),
          )
        }
      >
        {busy === 'set' ? 'Building rings…' : `Export all ${calibration.testClearances.length} rings (ZIP)`}
      </button>
      {calibration.selectedClearance !== null ? (
        <div className="callout">
          Chosen clearance: <strong>{calibration.selectedClearance.toFixed(2)} mm</strong> — applied to the project collar.
          {!collarLocked ? (
            <button type="button" className="btn small" onClick={() => setLocked(true)}>Lock collar</button>
          ) : (
            <span> Collar is locked.</span>
          )}
        </div>
      ) : null}
      <label className="notes">
        <span>Fit notes</span>
        <textarea rows={2} value={calibration.notes} placeholder="e.g. 0.40 snug, 0.60 loose" onChange={(e) => updateCalibration({ notes: e.target.value })} />
      </label>
    </Section>
  );
}
