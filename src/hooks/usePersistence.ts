import { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '../state/projectStore';
import { loadWorkingCopy, saveWorkingCopy } from '../services/storage';

/** Restore the working copy on start and autosave it (debounced) on every change. */
export function usePersistence(): boolean {
  const [ready, setReady] = useState(false);
  const project = useProjectStore((s) => s.project);
  const saveState = useProjectStore((s) => s.saveState);
  const setProject = useProjectStore((s) => s.setProject);
  const restored = useRef(false);

  useEffect(() => {
    loadWorkingCopy()
      .then((p) => {
        if (p) setProject(p.project, p.saveState);
      })
      .catch(() => undefined)
      .finally(() => {
        restored.current = true;
        setReady(true);
      });
  }, [setProject]);

  useEffect(() => {
    if (!restored.current) return;
    const t = setTimeout(() => {
      saveWorkingCopy(project, saveState).catch((e) => console.warn('Autosave failed', e));
    }, 400);
    return () => clearTimeout(t);
  }, [project, saveState]);

  return ready;
}
