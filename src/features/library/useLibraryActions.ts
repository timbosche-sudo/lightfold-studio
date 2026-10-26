import { useCallback } from 'react';
import { useProjectStore } from '../../state/projectStore';
import { thumbnailCapture } from '../../state/geometryStore';
import { saveProject } from '../../services/storage';
import { uid } from '../../services/projectFactory';

/** Save / Save As shared by the top bar and the library. */
export function useLibraryActions(onSaved?: () => void) {
  const save = useCallback(
    async (label = 'Saved') => {
      const project = useProjectStore.getState().commitRevision(label);
      await saveProject(project, thumbnailCapture.capture?.() ?? null);
      onSaved?.();
    },
    [onSaved],
  );

  const saveAs = useCallback(
    async (name: string) => {
      const s = useProjectStore.getState();
      const now = new Date().toISOString();
      s.setProject({ ...s.project, id: uid(), name, createdAt: now, updatedAt: now, revisions: [] }, 'never-saved');
      await save('Created by Save As');
    },
    [save],
  );

  return { save, saveAs };
}
