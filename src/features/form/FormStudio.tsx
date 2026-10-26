import { useProjectStore } from '../../state/projectStore';
import { useViewStore } from '../../state/viewStore';
import { deriveCollarDimensions } from '../../geometry/collar/collar';
import { formatLength } from '../../utils/units';
import { Readout, Section } from '../../components/controls/controls';

export function FormStudio() {
  const collar = useProjectStore((s) => s.project.collar);
  const units = useProjectStore((s) => s.project.units);
  const locked = useProjectStore((s) => s.project.collarLocked);
  const setView = useViewStore((s) => s.set);
  const d = deriveCollarDimensions(collar);
  return (
    <div className="workspace">
      <header className="ws-head">
        <h2>Form Studio</h2>
        <span className="phase-tag">Shade generator: Phase 2</span>
      </header>
      <div className="callout">
        The parametric shade generator is not built yet. Phase 1 establishes the collar — the fixed mechanical interface every shade will grow from.
        The viewport currently shows the collar only.
      </div>
      <Section title="Attachment foundation">
        <Readout label="Shade origin diameter" value={formatLength(d.attachment.radius * 2, units)} />
        <Readout label="Shade origin height" value={formatLength(d.attachment.z, units)} />
        <Readout label="Collar status" value={locked ? 'Locked (calibrated)' : 'Editable'} />
        <button type="button" className="btn" onClick={() => setView({ workspace: 'fabrication', part: 'collar' })}>
          Edit collar in Fabrication
        </button>
      </Section>
      <Section title="Planned in upcoming phases" defaultOpen={false}>
        <ul className="plain">
          <li>Phase 2 — cylindrical shade: height, maximum diameter, wall thickness, continuous attachment to the shoulder, full-assembly STL.</li>
          <li>Phase 3 — crumpled-paper generator with seeded folds, ridges, valleys and bevels.</li>
          <li>Phase 4 — twisted, louvered, perforated and organic families, plus hybrid modifier pipeline.</li>
        </ul>
      </Section>
    </div>
  );
}
