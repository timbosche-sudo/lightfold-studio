import { useCallback, useEffect, useRef, useState } from 'react';
import { useProjectStore } from '../../state/projectStore';
import { deleteProject, listProjects, loadProject, saveProject, type LibraryEntry } from '../../services/storage';
import { newProject, normalizeProject, uid } from '../../services/projectFactory';
import { exportProjectJson } from '../../services/exportService';
import { Section } from '../../components/controls/controls';
import { useLibraryActions } from './useLibraryActions';
import { deriveCollarDimensions } from '../../geometry/collar/collar';

export function LibraryWorkspace() {
  const project = useProjectStore((s) => s.project);
  const saveState = useProjectStore((s) => s.saveState);
  const setProject = useProjectStore((s) => s.setProject);
  const restoreRevision = useProjectStore((s) => s.restoreRevision);
  const rename = useProjectStore((s) => s.rename);
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    listProjects().then(setEntries).catch((e) => setMessage(`Could not read library: ${e.message}`));
  }, []);
  useEffect(refresh, [refresh]);
  const { save, saveAs } = useLibraryActions(refresh);

  const guardUnsaved = () => saveState !== 'unsaved' || confirm('The current project has unsaved changes. Continue and discard them?');

  const open = async (id: string) => {
    if (!guardUnsaved()) return;
    const p = await loadProject(id);
    if (p) {
      setProject(p, 'saved');
      setMessage(`Opened “${p.name}”.`);
    }
  };

  const duplicate = async (id: string) => {
    const p = await loadProject(id);
    if (!p) return;
    const now = new Date().toISOString();
    await saveProject({ ...p, id: uid(), name: `${p.name} copy`, createdAt: now, updatedAt: now }, entries.find((e) => e.id === id)?.thumbnail ?? null);
    refresh();
  };

  const renameEntry = async (id: string, current: string) => {
    const name = prompt('Rename project', current)?.trim();
    if (!name) return;
    if (id === project.id) {
      rename(name);
      await save('Renamed');
    } else {
      const p = await loadProject(id);
      if (!p) return;
      await saveProject({ ...p, name, updatedAt: new Date().toISOString() }, entries.find((e) => e.id === id)?.thumbnail ?? null);
    }
    refresh();
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete “${name}” from this device's library? This cannot be undone.`)) return;
    await deleteProject(id);
    refresh();
  };

  const importJson = async (file: File) => {
    try {
      const p = normalizeProject(JSON.parse(await file.text()));
      const existing = entries.some((e) => e.id === p.id);
      const imported = existing ? { ...p, id: uid(), name: `${p.name} (imported)` } : p;
      await saveProject(imported, null);
      setMessage(`Imported “${imported.name}”.`);
      refresh();
    } catch (e) {
      setMessage(`Import failed: ${(e as Error).message}`);
    }
  };

  const d = deriveCollarDimensions(project.collar);

  return (
    <div className="workspace">
      <header className="ws-head">
        <h2>Design Library</h2>
      </header>
      {message ? <div className="callout">{message}</div> : null}

      <Section title="Current project">
        <div className="field">
          <div className="field-head"><label htmlFor="pname">Name</label></div>
          <input id="pname" className="text-input" value={project.name} onChange={(e) => rename(e.target.value)} />
        </div>
        <p className="note">
          {saveState === 'saved' ? 'Saved to library.' : saveState === 'unsaved' ? 'Unsaved changes (working copy is autosaved on this device).' : 'Not yet saved to the library.'}{' '}
          Insertion ⌀ {d.insertionOuterDiameter.toFixed(3)} mm · clearance {project.collar.fitClearance.toFixed(2)} mm{project.collarLocked ? ' · collar locked' : ''}
        </p>
        <div className="btn-row">
          <button type="button" className="btn primary" onClick={() => save().then(() => setMessage('Saved.'))}>Save</button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              const name = prompt('Save as', `${project.name} v2`)?.trim();
              if (name) saveAs(name).then(() => setMessage(`Saved as “${name}”.`));
            }}
          >
            Save as…
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (!guardUnsaved()) return;
              // Start a new design that keeps the calibrated collar and fabrication settings.
              const p = newProject();
              const cur = useProjectStore.getState().project;
              setProject({ ...p, units: cur.units, collar: structuredClone(cur.collar), collarLocked: cur.collarLocked, calibration: structuredClone(cur.calibration), fabrication: { ...structuredClone(cur.fabrication), exportHistory: [] } }, 'never-saved');
            }}
          >
            New (keep collar)
          </button>
          <button type="button" className="btn" onClick={() => setMessage(`Downloaded ${exportProjectJson(project)}`)}>Export JSON</button>
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>Import JSON</button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importJson(f);
              e.target.value = '';
            }}
          />
        </div>
      </Section>

      <Section title={`Revisions (${project.revisions.length})`} defaultOpen={false}>
        {project.revisions.length === 0 ? (
          <p className="note">Each Save records a revision you can restore.</p>
        ) : (
          <ul className="history">
            {project.revisions.map((r) => (
              <li key={r.id}>
                <span>
                  {r.label} <small>{new Date(r.savedAt).toLocaleString()}</small>
                </span>
                <button type="button" className="btn small" onClick={() => confirm('Restore parameters from this revision?') && restoreRevision(r.id)}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Saved on this device (${entries.length})`}>
        {entries.length === 0 ? <p className="note">No saved projects yet.</p> : null}
        <ul className="library-grid">
          {entries.map((e) => (
            <li key={e.id} className={e.id === project.id ? 'current' : ''}>
              <button type="button" className="thumb" onClick={() => open(e.id)} aria-label={`Open ${e.name}`}>
                {e.thumbnail ? <img src={e.thumbnail} alt="" /> : <span>No preview</span>}
              </button>
              <div className="meta">
                <strong>{e.name}</strong>
                <small>{new Date(e.updatedAt).toLocaleString()} · {e.revisionCount} rev</small>
              </div>
              <div className="btn-row compact">
                <button type="button" className="btn small" onClick={() => open(e.id)}>Open</button>
                <button type="button" className="btn small" onClick={() => duplicate(e.id)}>Duplicate</button>
                <button type="button" className="btn small" onClick={() => renameEntry(e.id, e.name)}>Rename</button>
                <button type="button" className="btn small danger" onClick={() => remove(e.id, e.name)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
        <p className="note">Projects are stored in this browser's IndexedDB. Use Export JSON to back up or move designs between devices.</p>
      </Section>
    </div>
  );
}
