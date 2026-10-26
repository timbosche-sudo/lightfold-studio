import type { MaterialPresetId, PrinterProfile } from '../types/project';

export interface PrintPreset {
  id: MaterialPresetId;
  label: string;
  nozzle: number;
  layerHeight: number;
  /** Absolute minimum wall: roughly two extrusion widths. Below this is an error. */
  minWall: number;
  /** Recommended wall for robust prints. Below this is a warning. */
  recommendedWall: number;
  /** Overhang angle from vertical beyond which supports are usually needed. */
  maxOverhangDeg: number;
}

/**
 * Starting-point guidance only. These influence minimum-feature checks; they do
 * not replace slicing. Verify every STL in Bambu Studio before printing.
 */
export const PRINT_PRESETS: Record<MaterialPresetId, PrintPreset> = {
  'pla-0.4': { id: 'pla-0.4', label: 'PLA · 0.4 mm nozzle', nozzle: 0.4, layerHeight: 0.2, minWall: 0.8, recommendedWall: 1.2, maxOverhangDeg: 45 },
  'petg-0.4': { id: 'petg-0.4', label: 'PETG · 0.4 mm nozzle', nozzle: 0.4, layerHeight: 0.2, minWall: 0.8, recommendedWall: 1.2, maxOverhangDeg: 40 },
  'pla-0.2': { id: 'pla-0.2', label: 'Fine PLA · 0.2 mm nozzle', nozzle: 0.2, layerHeight: 0.1, minWall: 0.4, recommendedWall: 0.6, maxOverhangDeg: 45 },
};

export const BAMBU_P1S: PrinterProfile = {
  id: 'bambu-p1s',
  name: 'Bambu Lab P1S',
  buildVolume: [256, 256, 256],
  safetyMargin: 5,
};
