/**
 * Persistent project model. All lengths are millimetres.
 *
 * Fields for later phases (shade, lighting, WLED) are declared now as nullable
 * so saved Phase 1 projects stay forward-compatible.
 */

export type DisplayUnits = 'mm' | 'in';

export interface AlignmentKeyParams {
  enabled: boolean;
  /** Tangential width of the rib. */
  width: number;
  /** Radial protrusion beyond the insertion outer wall. */
  depth: number;
}

export interface RetentionLipParams {
  enabled: boolean;
  /** Radial inward projection from the bore wall. */
  width: number;
  /** Vertical height of the lip, measured down from the shoulder top. */
  height: number;
}

export interface MagnetPocketParams {
  enabled: boolean;
  count: number;
  diameter: number;
  depth: number;
}

export interface CollarParams {
  /** Clear interior diameter of the lamp base opening — the primary fit input. */
  baseInteriorDiameter: number;
  /** Diametral clearance subtracted from the base interior diameter. */
  fitClearance: number;
  insertionHeight: number;
  wallThickness: number;
  leadInChamfer: number;
  shoulderHeight: number;
  shoulderOuterDiameter: number;
  retentionLip: RetentionLipParams;
  alignmentKey: AlignmentKeyParams;
  magnetPockets: MagnetPocketParams;
}

export interface FitTestParams {
  /** Insertion length of the test ring. */
  height: number;
  includeShoulder: boolean;
  /** Cut 1..n notches in the top edge so printed rings can be told apart. */
  idNotches: boolean;
}

export interface CalibrationState {
  testClearances: number[];
  fitTest: FitTestParams;
  selectedClearance: number | null;
  notes: string;
}

export interface PrinterProfile {
  id: string;
  name: string;
  buildVolume: [number, number, number];
  /** Margin kept free on every side of the build volume. */
  safetyMargin: number;
}

export type ShadeFamilyId = 'cylinder' | 'twist' | 'ripple' | 'organic' | 'fold';

export type TransitionProfile = 'smooth' | 'linear';

/** Dimensions shared by every shade family; kept when switching families. */
export interface ShadeCommonParams {
  /** Height of the shade above the collar attachment boundary. */
  height: number;
  /** Outside envelope diameter: no part of the shade may exceed it. */
  maxDiameter: number;
  /** Wall thickness measured normal to the surface. */
  wallThickness: number;
  /** Height over which the form grows out of the collar shoulder. */
  transitionHeight: number;
}

export interface CylinderFamilyParams {
  transitionProfile: TransitionProfile;
}

/** Full parameter set seen by the cylinder generator. */
export type CylinderShadeParams = ShadeCommonParams & CylinderFamilyParams;

export interface TwistParams {
  /** Total rotation of the cross-section from base to top, degrees. */
  twistAngle: number;
  /** Starting orientation of the lobes, degrees. */
  rotation: number;
  lobes: number;
  /** Radial depth between lobe crest and valley, mm. */
  lobeDepth: number;
  /** Fractional radius reduction at the top (negative flares outward). */
  taper: number;
  /** Silhouette bow: positive = barrel, negative = waisted. */
  curvature: number;
}

export interface RippleParams {
  /** Number of flutes around the circumference. */
  waveCount: number;
  /** Radial flute depth, mm. */
  amplitude: number;
  /** Vertical ripple waves along the height (0 = straight flutes). */
  frequency: number;
  /** Phase of the vertical ripple, degrees. */
  phase: number;
}

export interface OrganicParams {
  /** Outward swelling of the silhouette, mm. */
  bulge: number;
  /** Strength of the seeded, non-symmetric flow (0–1). */
  asymmetry: number;
  /** Moves the bulge down (negative) or up (positive). */
  curvature: number;
  /** 1 = long gentle undulations, 0 = busier lumps. */
  smoothness: number;
  seed: number;
}

export interface FoldParams {
  foldCount: number;
  /** Radial depth from ridge to valley, mm. */
  depth: number;
  /** 0 = soft rounded folds, 1 = crisp creases. */
  sharpness: number;
  /** How far the pleats rotate from base to top, degrees. */
  rotation: number;
}

/**
 * The shade design. Family parameters are kept per family so switching
 * families never discards earlier settings.
 */
export interface ShadeDesign {
  family: ShadeFamilyId;
  common: ShadeCommonParams;
  cylinder: CylinderFamilyParams;
  twist: TwistParams;
  ripple: RippleParams;
  organic: OrganicParams;
  fold: FoldParams;
}

export type MaterialPresetId = 'pla-0.4' | 'petg-0.4' | 'pla-0.2';

export type CollarOrientation = 'installed' | 'inverted';

export interface ExportRecord {
  id: string;
  at: string;
  kind: 'assembly' | 'collar' | 'fit-test' | 'fit-test-set';
  filename: string;
  triangles: number;
  diagnostic: boolean;
}

export interface FabricationSettings {
  printer: PrinterProfile;
  materialPreset: MaterialPresetId;
  collarOrientation: CollarOrientation;
  exportHistory: ExportRecord[];
}

/** The editable design content of a project; this is what revisions snapshot. */
export interface ProjectContent {
  collar: CollarParams;
  collarLocked: boolean;
  calibration: CalibrationState;
  fabrication: FabricationSettings;
  shade: ShadeDesign;
  /** Phase 5+. */
  lighting: null;
  /** Phase 7+. Reference to a WLED preset id on the controller. */
  wledPresetId: number | null;
}

export interface Revision {
  id: string;
  savedAt: string;
  label: string;
  content: ProjectContent;
}

export interface Project extends ProjectContent {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  units: DisplayUnits;
  revisions: Revision[];
  /** Reserved for future NFC / magnet shade identification. */
  physicalTagId: string | null;
}
