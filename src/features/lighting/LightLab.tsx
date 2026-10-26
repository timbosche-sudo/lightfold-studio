import { Section } from '../../components/controls/controls';

export function LightLab() {
  return (
    <div className="workspace">
      <header className="ws-head">
        <h2>Light Lab</h2>
        <span className="phase-tag">Phases 5–6</span>
      </header>
      <div className="callout">Not implemented yet. No lighting simulation runs in this build.</div>
      <Section title="Planned">
        <ul className="plain">
          <li>Parametric LED ring (default 35 LEDs) with zero-angle offset and direction matching the physical ring order.</li>
          <li>Interactive preview: shadows, self-shadowing, approximate translucency, material presets (PLA / PETG).</li>
          <li>Analysis: illumination heat maps, contrast metrics, orientation studies, variant comparison.</li>
          <li>All results labelled as conceptual or approximate unless calibrated with measured data.</li>
        </ul>
      </Section>
    </div>
  );
}
