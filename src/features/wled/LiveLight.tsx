import { Section } from '../../components/controls/controls';

export function LiveLight() {
  return (
    <div className="workspace">
      <header className="ws-head">
        <h2>Live Light</h2>
        <span className="phase-tag">Phase 7</span>
      </header>
      <div className="callout">Not implemented yet. This build does not communicate with any WLED device.</div>
      <Section title="Planned">
        <ul className="plain">
          <li>Manual connection to the QuinLED dig2go by hostname or IP, using the documented WLED JSON API (/json/state, /json/info, /json/effects, /json/palettes).</li>
          <li>Transport adapters: direct LAN, local bridge, and a clearly labelled mock/offline mode.</li>
          <li>Preview-only, live-control and sync-from-device modes, with throttled updates.</li>
        </ul>
      </Section>
      <Section title="Network note" defaultOpen={false}>
        <p className="note">
          A page served over HTTPS (e.g. GitHub Pages) generally cannot call a plain-HTTP device on your LAN because of mixed-content rules.
          Running the app locally over HTTP on the same network, or through a small local bridge, will be documented in Phase 7.
        </p>
      </Section>
    </div>
  );
}
