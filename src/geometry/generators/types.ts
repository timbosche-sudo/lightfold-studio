import type { CollarDimensions, ParamIssue } from '../collar/collar';
import type { MeshData } from '../core/mesh';
import type { PrintPreset } from '../presets';
import type { ShadeCommonParams } from '../../types/project';

export type { ParamIssue };

/** What every shade generator receives about the collar it must attach to. */
export interface ShadeContext {
  collar: CollarDimensions;
  /** Collar top = shade origin plane (z) and shoulder outer radius. */
  attachment: { z: number; radius: number };
  /**
   * The shade solid must extend this far below `attachment.z`, staying inside
   * the shoulder (r between `collar.innerRadius` and `attachment.radius`), so
   * the Boolean union fuses it to the collar without a seam.
   */
  overlapDepth: number;
  preset: PrintPreset;
}

export interface ShadeBuildOptions {
  quality: 'preview' | 'fabrication';
  /**
   * Fast display-only build while the user is dragging: no overlap tab (it is
   * shown next to, not fused with, the collar) and no measured-wall estimate.
   */
  draft?: boolean;
}

export interface ShadeSummary {
  /** Largest radius the shade reaches above the attachment plane. */
  envelopeRadius: number;
  /** z of the top of the shade. */
  topZ: number;
  /** Smallest inner diameter of the top opening. */
  topOpeningDiameter: number;
  /** Steepest wall angle from vertical, degrees (for overhang guidance). */
  maxOverhangDeg: number;
  /** Share of the outer surface steeper than the preset's overhang limit (0–1). */
  overhangFraction?: number;
  /** Estimated thinnest wall measured on the mesh, mm. */
  minWallEstimate?: number;
  /** Factor applied so the form fits the maximum diameter (1 = untouched). */
  envelopeScale?: number;
}

export interface ShadeBuildResult {
  /** Closed, outward-wound solid that overlaps down into the shoulder. */
  mesh: MeshData;
  /** Angular segments used; the collar is revolved with the same count so seams coincide. */
  segments: number;
  summary: ShadeSummary;
  /** Issues found while building (measured wall, pinching, overhangs...). */
  issues: ParamIssue[];
}

/** Declarative description of one family control, rendered generically by the UI. */
export type ControlSpec = { key: string; label: string; hint?: string } & (
  | { kind: 'length'; min: number; max: number; step: number }
  | { kind: 'angle'; min: number; max: number; step: number }
  | { kind: 'number'; min: number; max: number; step: number; integer?: boolean; suffix?: string; percent?: boolean }
  | { kind: 'choice'; options: { value: string; label: string }[] }
  | { kind: 'seed' }
);

export interface FamilyExample<F> {
  name: string;
  params: Partial<F>;
}

/** A top-view cross-section (closed polyline of [x, y]) or side silhouette. */
export type Polyline = [number, number][];

/**
 * A shade family. `F` is the family-specific parameter set; generators always
 * receive it merged with the shared dimensions. Generators return a closed,
 * outward-wound solid; the assembly step unions it with the collar using the
 * Manifold kernel, so assembly, validation and export never change per family.
 */
export interface ShadeGenerator<F> {
  id: string;
  label: string;
  description: string;
  defaults(): F;
  controls: ControlSpec[];
  examples: FamilyExample<F>[];
  /** Minimum transition height this family needs to blend out of the collar. */
  minTransitionHeight: number;
  /** Parameter checks that can be made before building geometry. */
  check(params: ShadeCommonParams & F, ctx: ShadeContext): ParamIssue[];
  /** Cheap estimate for live readouts. */
  summarize(params: ShadeCommonParams & F, ctx: ShadeContext): ShadeSummary;
  build(params: ShadeCommonParams & F, ctx: ShadeContext, opts: ShadeBuildOptions): ShadeBuildResult;
  /** Top-view outlines at normalised heights `us`, and a side silhouette, for thumbnails. */
  sketch(params: ShadeCommonParams & F, ctx: ShadeContext, us: number[]): { sections: Polyline[]; silhouette: Polyline };
}
