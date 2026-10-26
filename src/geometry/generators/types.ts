import type { CollarDimensions, ParamIssue } from '../collar/collar';
import type { MeshData } from '../core/mesh';
import type { PrintPreset } from '../presets';

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
  /** Angular segments around Z (match the collar so seams line up). */
  segments: number;
  /** Rows per unit of curved profile; generators choose how to use it. */
  quality: 'preview' | 'fabrication';
}

export interface ShadeSummary {
  /** Largest radius the shade reaches above the attachment plane. */
  envelopeRadius: number;
  /** z of the top of the shade. */
  topZ: number;
  /** Inner diameter of the top opening. */
  topOpeningDiameter: number;
  /** Steepest wall angle from vertical, degrees (for overhang guidance). */
  maxOverhangDeg: number;
}

/**
 * A shade family. Generators return a closed, outward-wound solid; the
 * assembly step unions it with the collar using the Manifold kernel.
 * Later families (crumpled, twisted, louvered...) implement this same
 * interface, so the assembly, validation and export paths do not change.
 */
export interface ShadeGenerator<P> {
  id: string;
  label: string;
  defaults(): P;
  /** Parameter checks that can be made before building geometry. */
  check(params: P, ctx: ShadeContext): ParamIssue[];
  summarize(params: P, ctx: ShadeContext): ShadeSummary;
  build(params: P, ctx: ShadeContext, opts: ShadeBuildOptions): MeshData;
}
