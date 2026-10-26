import { useState } from 'react';
import { CollarEditor } from './CollarEditor';
import { CalibrationPanel } from './CalibrationPanel';
import { ExportPanel, PrintSetup } from './ExportPanel';
import type { ExportOutcome } from '../../services/exportService';
import { Segmented } from '../../components/controls/controls';
import { useViewStore } from '../../state/viewStore';

type Tab = 'collar' | 'calibrate' | 'export';

export function FabricationWorkspace() {
  const [tab, setTab] = useState<Tab>('collar');
  const [outcome, setOutcome] = useState<ExportOutcome | null>(null);
  const setView = useViewStore((s) => s.set);
  return (
    <div className="workspace">
      <header className="ws-head">
        <h2>Fabrication</h2>
        <Segmented<Tab>
          value={tab}
          label="Fabrication section"
          options={[
            { value: 'collar', label: 'Collar' },
            { value: 'calibrate', label: 'Fit test' },
            { value: 'export', label: 'Export' },
          ]}
          onChange={(t) => {
            setTab(t);
            setView({ part: t === 'calibrate' ? 'fit-test' : 'collar' });
          }}
        />
      </header>
      {tab === 'collar' ? <CollarEditor /> : null}
      {tab === 'calibrate' ? <CalibrationPanel onOutcome={setOutcome} /> : null}
      {tab === 'calibrate' && outcome ? (
        <div className={`callout ${outcome.ok ? 'ok' : 'error'}`}>
          {outcome.message}
          {outcome.download ? <a className="btn small" href={outcome.download.url} download={outcome.download.filename}>Download again</a> : null}
        </div>
      ) : null}
      {tab === 'export' ? (
        <>
          <PrintSetup />
          <ExportPanel outcome={outcome} onOutcome={setOutcome} />
        </>
      ) : null}
    </div>
  );
}
