import { create } from 'zustand';

export type Workspace = 'form' | 'light' | 'live' | 'fabrication' | 'library';
export type ShadingMode = 'clay' | 'wireframe' | 'normals' | 'inspection';
export type ViewPreset = 'iso' | 'top' | 'front' | 'side';
export type ThemeMode = 'dark' | 'light';
export type ViewportPart = 'assembly' | 'collar' | 'fit-test';

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
  /** Set when the displayed part changes; the camera refits on the next build. */
  fitPending: boolean;
  /** Incremented to request a camera move. */
  cameraRequest: { preset: ViewPreset; n: number };
  set: (patch: Partial<Omit<ViewStore, 'set' | 'requestView' | 'showPart'>>) => void;
  requestView: (preset: ViewPreset) => void;
  showPart: (part: ViewportPart, fitTestIndex?: number) => void;
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
  workspace: 'form',
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
  part: 'assembly',
  fitTestIndex: 1,
  fitPending: false,
  cameraRequest: { preset: 'iso', n: 0 },
  set: (patch) => set(patch),
  showPart: (part, fitTestIndex) =>
    set((s) => ({
      part,
      fitTestIndex: fitTestIndex ?? s.fitTestIndex,
      fitPending: s.fitPending || part !== s.part,
    })),
  requestView: (preset) => set((s) => ({ cameraRequest: { preset, n: s.cameraRequest.n + 1 } })),
}));
