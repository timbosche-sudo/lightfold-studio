import { useState } from 'react';
import { useProjectStore } from '../../state/projectStore';
import { useViewStore, type Workspace } from '../../state/viewStore';
import { Segmented } from '../controls/controls';
import { useLibraryActions } from '../../features/library/useLibraryActions';
import type { DisplayUnits } from '../../types/project';

const WORKSPACES: { value: Workspace; label: string }[] = [
  { value: 'form', label: 'Form Studio' },
  { value: 'light', label: 'Light Lab' },
  { value: 'live', label: 'Live Light' },
  { value: 'fabrication', label: 'Fabrication' },
  { value: 'library', label: 'Library' },
];

export function TopBar() {
  const name = useProjectStore((s) => s.project.name);
  const units = useProjectStore((s) => s.project.units);
  const saveState = useProjectStore((s) => s.saveState);
  const setUnits = useProjectStore((s) => s.setUnits);
  const { workspace, theme, panelOpen, set, showPart } = useViewStore();
  const { save } = useLibraryActions();
  const [saving, setSaving] = useState(false);

  return (
    <header className="topbar">
      <div className="brand">
        <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden>
          <path d="M16 3 27 26H5z" fill="none" stroke="currentColor" strokeWidth="2.5" />
        </svg>
        <span className="brand-name">LightFold</span>
        <span className="project-name" title={name}>{name}</span>
        <span className={`save-dot ${saveState}`} title={saveState === 'saved' ? 'Saved' : saveState === 'unsaved' ? 'Unsaved changes' : 'Not saved to library'} />
      </div>
      <nav className="ws-tabs" aria-label="Workspaces">
        {WORKSPACES.map((w) => (
          <button key={w.value} type="button" className={workspace === w.value ? 'active' : ''} onClick={() => {
              set({ workspace: w.value, panelOpen: true });
              if (w.value === 'form') showPart('assembly');
            }}>
            {w.label}
          </button>
        ))}
      </nav>
      <div className="top-actions">
        <button
          type="button"
          className="btn small"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await save();
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <Segmented<DisplayUnits> value={units} label="Display units" options={[{ value: 'in', label: 'in' }, { value: 'mm', label: 'mm' }]} onChange={setUnits} />
        <button
          type="button"
          className="btn small icon"
          aria-label="Toggle theme"
          onClick={() => {
            const next = theme === 'dark' ? 'light' : 'dark';
            set({ theme: next });
            try {
              localStorage.setItem('lightfold-theme', next);
            } catch {
              /* storage unavailable */
            }
          }}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
        <button type="button" className="btn small icon" aria-label={panelOpen ? 'Hide panel' : 'Show panel'} onClick={() => set({ panelOpen: !panelOpen })}>
          {panelOpen ? '⇥' : '⇤'}
        </button>
      </div>
    </header>
  );
}
