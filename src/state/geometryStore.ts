import { create } from 'zustand';
import type { BuildResult } from '../geometry/buildPart';

interface GeometryStore {
  result: BuildResult | null;
  building: boolean;
  error: string | null;
  set: (patch: Partial<Omit<GeometryStore, 'set'>>) => void;
}

/** Latest preview build shown in the viewport. */
export const useGeometryStore = create<GeometryStore>((set) => ({
  result: null,
  building: false,
  error: null,
  set: (patch) => set(patch),
}));

/** Viewport capture hook registered by the canvas (for thumbnails). */
export const thumbnailCapture: { capture: (() => string | null) | null } = { capture: null };
