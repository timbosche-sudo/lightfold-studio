import { create } from 'zustand';
import type {
  CalibrationState,
  CollarParams,
  DisplayUnits,
  ExportRecord,
  FabricationSettings,
  FitTestParams,
  Project,
  Revision,
} from '../types/project';
import { contentOf, newProject, uid } from '../services/projectFactory';

export type SaveState = 'saved' | 'unsaved' | 'never-saved';

interface ProjectStore {
  project: Project;
  /** Whether the current content differs from the last library save. */
  saveState: SaveState;
  setProject: (p: Project, saveState: SaveState) => void;
  setUnits: (u: DisplayUnits) => void;
  rename: (name: string) => void;
  /** Ignored while the collar is locked (except via forceCollar). */
  updateCollar: (patch: Partial<CollarParams>) => void;
  forceCollar: (patch: Partial<CollarParams>) => void;
  setCollarLocked: (locked: boolean) => void;
  updateCalibration: (patch: Partial<CalibrationState>) => void;
  updateFitTest: (patch: Partial<FitTestParams>) => void;
  updateFabrication: (patch: Partial<FabricationSettings>) => void;
  recordExport: (r: Omit<ExportRecord, 'id' | 'at'>) => void;
  /** Append a revision snapshot and mark saved; returns the updated project. */
  commitRevision: (label: string) => Project;
  restoreRevision: (revisionId: string) => void;
  markSaved: () => void;
}

const MAX_REVISIONS = 50;

export const useProjectStore = create<ProjectStore>((set, get) => {
  const edit = (fn: (p: Project) => Partial<Project>) =>
    set((s) => ({
      project: { ...s.project, ...fn(s.project), updatedAt: new Date().toISOString() },
      saveState: s.saveState === 'never-saved' ? 'never-saved' : 'unsaved',
    }));

  return {
    project: newProject(),
    saveState: 'never-saved',
    setProject: (project, saveState) => set({ project, saveState }),
    // Units are a display preference; they don't dirty the design.
    setUnits: (units) => set((s) => ({ project: { ...s.project, units } })),
    rename: (name) => edit(() => ({ name })),
    updateCollar: (patch) => {
      if (get().project.collarLocked) return;
      edit((p) => ({ collar: { ...p.collar, ...patch } }));
    },
    forceCollar: (patch) => edit((p) => ({ collar: { ...p.collar, ...patch } })),
    setCollarLocked: (collarLocked) => edit(() => ({ collarLocked })),
    updateCalibration: (patch) => edit((p) => ({ calibration: { ...p.calibration, ...patch } })),
    updateFitTest: (patch) =>
      edit((p) => ({ calibration: { ...p.calibration, fitTest: { ...p.calibration.fitTest, ...patch } } })),
    updateFabrication: (patch) => edit((p) => ({ fabrication: { ...p.fabrication, ...patch } })),
    recordExport: (r) =>
      set((s) => ({
        project: {
          ...s.project,
          fabrication: {
            ...s.project.fabrication,
            exportHistory: [{ ...r, id: uid(), at: new Date().toISOString() }, ...s.project.fabrication.exportHistory].slice(0, 100),
          },
        },
      })),
    commitRevision: (label) => {
      const p = get().project;
      const rev: Revision = { id: uid(), savedAt: new Date().toISOString(), label, content: contentOf(p) };
      const project = { ...p, revisions: [rev, ...p.revisions].slice(0, MAX_REVISIONS) };
      set({ project, saveState: 'saved' });
      return project;
    },
    restoreRevision: (revisionId) => {
      const rev = get().project.revisions.find((r) => r.id === revisionId);
      if (!rev) return;
      // Keep export history; restore design content.
      edit((p) => ({ ...structuredClone(rev.content), fabrication: { ...structuredClone(rev.content.fabrication), exportHistory: p.fabrication.exportHistory } }));
    },
    markSaved: () => set({ saveState: 'saved' }),
  };
});
