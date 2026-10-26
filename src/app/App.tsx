import { useEffect } from 'react';
import { TopBar } from '../components/layout/TopBar';
import { Viewport } from '../components/viewport/Viewport';
import { useViewStore } from '../state/viewStore';
import { usePreviewGeometry } from '../hooks/usePreviewGeometry';
import { usePersistence } from '../hooks/usePersistence';
import { FormStudio } from '../features/form/FormStudio';
import { LightLab } from '../features/lighting/LightLab';
import { LiveLight } from '../features/wled/LiveLight';
import { FabricationWorkspace } from '../features/fabrication/FabricationWorkspace';
import { LibraryWorkspace } from '../features/library/LibraryWorkspace';

export function App() {
  const ready = usePersistence();
  usePreviewGeometry();
  const workspace = useViewStore((s) => s.workspace);
  const panelOpen = useViewStore((s) => s.panelOpen);
  const theme = useViewStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className={`app ${panelOpen ? 'panel-open' : 'panel-closed'}`}>
      <TopBar />
      <main className="main">
        <Viewport />
        {panelOpen ? (
          <aside className="panel" aria-label="Workspace panel">
            {!ready ? <p className="note">Restoring project…</p> : null}
            {workspace === 'form' ? <FormStudio /> : null}
            {workspace === 'light' ? <LightLab /> : null}
            {workspace === 'live' ? <LiveLight /> : null}
            {workspace === 'fabrication' ? <FabricationWorkspace /> : null}
            {workspace === 'library' ? <LibraryWorkspace /> : null}
          </aside>
        ) : null}
      </main>
    </div>
  );
}
