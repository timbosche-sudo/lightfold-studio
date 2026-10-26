import { create } from 'zustand';

export type Workspace = 'form' | 'light' | 'live' | 'fabrication' | 'library';
export type ShadingMode = 'clay' | 'wireframe' | 'normals' | 'inspection';
export type ViewPreset = 'iso' | 'top' | 'front' | 'side';
export type ThemeMode = 'dark' | 'light';
export type ViewportPart = 'collar' | 'fit-test';

interface ViewStore {
  workspace: Workspace;
  panelOpen: boolean;
  theme: ThemeMode;
  shading: ShadingMode;
  orthographic: boolean;
  section: boolean;
  /** Section plane offset along Y, mm. */
  sectionOffset: number;
  showBounds: boolean;
  showBase: boolean;
  showGrid: boolean;
  showDimensions: boolean;
  /** What the viewport displays. */
  part: ViewportPart;
  /** Index into calibration.testClearances when part = fit-test. */
  fitTestIndex: number;
  /** Incremented to request a camera move. */
  cameraRequest: { preset: ViewPreset; n: number };
  set: (patch: Partial<Omit<ViewStore, 'set' | 'requestView'>>) => void;
  requestView: (preset: ViewPreset) => void;
}

function initialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem('lightfold-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* storage unavailable */
  }
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export const useViewStore = create<ViewStore>((set) => ({
  workspace: 'fabrication',
  panelOpen: true,
  theme: initialTheme(),
  shading: 'clay',
  orthographic: false,
  section: false,
  sectionOffset: 0,
  showBounds: false,
  showBase: true,
  showGrid: true,
  showDimensions: true,
  part: 'collar',
  fitTestIndex: 1,
  cameraRequest: { preset: 'iso', n: 0 },
  set: (patch) => set(patch),
  requestView: (preset) => set((s) => ({ cameraRequest: { preset, n: s.cameraRequest.n + 1 } })),
}));
