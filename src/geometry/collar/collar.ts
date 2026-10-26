import type { CollarParams } from '../../types/project';
import type { Profile2D } from '../core/revolve';
import { inToMm } from '../../utils/units';

export const DEFAULT_BASE_INTERIOR_DIAMETER = inToMm(3 + 15 / 16); // 100.0125 mm

export function defaultCollarParams(): CollarParams {
  return {
    baseInteriorDiameter: DEFAULT_BASE_INTERIOR_DIAMETER,
    fitClearance: 0.4,
    insertionHeight: inToMm(1 / 2),
    wallThickness: inToMm(1 / 16),
    leadInChamfer: 0.6,
    shoulderHeight: inToMm(1 / 8),
    // Assumed until the base rim is measured: 3 mm of radial overlap on the rim.
    shoulderOuterDiameter: Math.round((DEFAULT_BASE_INTERIOR_DIAMETER + 6) * 100) / 100,
    retentionLip: { enabled: false, width: 1.5, height: 1.2 },
    alignmentKey: { enabled: false, width: 3, depth: 1.5 },
    magnetPockets: { enabled: false, count: 3, diameter: 2, depth: 1.5 },
  };
}

/** Dimensions derived from collar parameters. */
export interface CollarDimensions {
  insertionOuterDiameter: number;
  insertionOuterRadius: number;
  innerDiameter: number;
  innerRadius: number;
  shoulderOuterRadius: number;
  /** How far the shoulder extends past the base interior wall onto the rim (radial). */
  shoulderRadialOverlap: number;
  /** Radial width of the shoulder underside that bears on the rim. */
  shoulderLedge: number;
  /** z of the shoulder underside = where the collar rests on the base rim. */
  rimContactZ: number;
  totalHeight: number;
  /**
   * Generative attachment boundary: the top outer edge of the shoulder.
   * Phase 2+ shade surfaces must originate flush with this circle.
   */
  attachment: { z: number; radius: number };
}

export function deriveCollarDimensions(p: CollarParams): CollarDimensions {
  const insertionOuterDiameter = p.baseInteriorDiameter - p.fitClearance;
  const insertionOuterRadius = insertionOuterDiameter / 2;
  const innerRadius = insertionOuterRadius - p.wallThickness;
  const shoulderOuterRadius = p.shoulderOuterDiameter / 2;
  const totalHeight = p.insertionHeight + p.shoulderHeight;
  return {
    insertionOuterDiameter,
    insertionOuterRadius,
    innerDiameter: innerRadius * 2,
    innerRadius,
    shoulderOuterRadius,
    shoulderRadialOverlap: (p.shoulderOuterDiameter - p.baseInteriorDiameter) / 2,
    shoulderLedge: shoulderOuterRadius - insertionOuterRadius,
    rimContactZ: p.insertionHeight,
    totalHeight,
    attachment: { z: totalHeight, radius: shoulderOuterRadius },
  };
}

export type IssueSeverity = 'error' | 'warning';

export interface ParamIssue {
  severity: IssueSeverity;
  field: string;
  message: string;
}

/** Parameter-level checks that can be made before any mesh exists. */
export function checkCollarParams(p: CollarParams, minWall: number, recommendedWall: number): ParamIssue[] {
  const d = deriveCollarDimensions(p);
  const issues: ParamIssue[] = [];
  const err = (field: string, message: string) => issues.push({ severity: 'error', field, message });
  const warn = (field: string, message: string) => issues.push({ severity: 'warning', field, message });

  if (!(p.baseInteriorDiameter >= 20 && p.baseInteriorDiameter <= 240)) {
    err('baseInteriorDiameter', 'Base interior diameter must be between 20 and 240 mm.');
  }
  if (p.fitClearance < 0) err('fitClearance', 'Fit clearance cannot be negative (the collar would be larger than the opening).');
  if (p.fitClearance > 3) warn('fitClearance', 'Fit clearance above 3 mm will leave the collar loose in the base.');
  if (p.insertionHeight < 2) err('insertionHeight', 'Insertion height must be at least 2 mm.');
  if (p.shoulderHeight < 0.8) err('shoulderHeight', 'Shoulder height must be at least 0.8 mm.');
  if (p.wallThickness < minWall) {
    err('wallThickness', `Wall thickness is below the ${minWall.toFixed(2)} mm minimum for the selected print preset.`);
  } else if (p.wallThickness < recommendedWall) {
    warn('wallThickness', `Wall thickness is below the ${recommendedWall.toFixed(2)} mm recommended for the selected print preset.`);
  }
  if (d.innerRadius < 5) err('wallThickness', 'Inner bore diameter would be under 10 mm.');
  if (p.leadInChamfer < 0) err('leadInChamfer', 'Lead-in chamfer cannot be negative.');
  if (p.leadInChamfer >= p.wallThickness * 0.9) err('leadInChamfer', 'Lead-in chamfer must be smaller than 90% of the wall thickness.');
  if (p.leadInChamfer >= p.insertionHeight * 0.5) err('leadInChamfer', 'Lead-in chamfer must be less than half the insertion height.');
  if (p.shoulderOuterDiameter <= p.baseInteriorDiameter) {
    err('shoulderOuterDiameter', 'Shoulder outer diameter must exceed the base interior diameter, or the collar will drop into the base.');
  } else if (d.shoulderRadialOverlap < 1) {
    warn('shoulderOuterDiameter', 'Shoulder overlaps the rim by less than 1 mm per side; seating may be unreliable.');
  }
  if (d.shoulderLedge > 4) {
    warn('shoulderOuterDiameter', `Shoulder underside overhangs ${d.shoulderLedge.toFixed(1)} mm when printed upright; print the collar inverted or expect some droop.`);
  }

  const lip = p.retentionLip;
  if (lip.enabled) {
    if (lip.width <= 0 || lip.height <= 0) err('retentionLip', 'Retention lip width and height must be positive.');
    if (d.innerRadius - lip.width < 5) err('retentionLip', 'Retention lip leaves an opening under 10 mm.');
    if (lip.height >= d.totalHeight - 0.5) err('retentionLip', 'Retention lip is taller than the collar.');
    if (lip.width > lip.height * 1.5) warn('retentionLip', 'Retention lip is a flat overhang when printed upright; consider a taller, narrower lip or printing inverted.');
  }
  const key = p.alignmentKey;
  if (key.enabled) {
    if (key.width <= 0 || key.depth <= 0) err('alignmentKey', 'Alignment key width and depth must be positive.');
    if (d.insertionOuterRadius + key.depth > d.shoulderOuterRadius) err('alignmentKey', 'Alignment key protrudes past the shoulder.');
    warn('alignmentKey', 'The alignment key requires a matching slot in the lamp base, which this app does not generate.');
  }
  const mag = p.magnetPockets;
  if (mag.enabled) {
    const wallAround = (d.shoulderLedge - mag.diameter) / 2;
    if (mag.count < 1 || mag.count > 12) err('magnetPockets', 'Pocket count must be between 1 and 12.');
    if (mag.diameter <= 0 || mag.depth <= 0) err('magnetPockets', 'Pocket diameter and depth must be positive.');
    if (wallAround < 0.4) err('magnetPockets', `Pockets need ${(mag.diameter + 0.8).toFixed(2)} mm of shoulder ledge; only ${d.shoulderLedge.toFixed(2)} mm is available. Increase shoulder outer diameter.`);
    if (mag.depth > p.shoulderHeight - 0.6) err('magnetPockets', 'Pocket depth leaves less than 0.6 mm above it in the shoulder.');
  }
  return issues;
}

/**
 * Closed (r, z) cross-section of the collar, counter-clockwise, z = 0 at the
 * bottom of the insertion. Retention lip is part of the profile; key and
 * pockets are added with Booleans (they are not rotationally symmetric).
 */
export function collarProfile(p: CollarParams, opts: { includeShoulder?: boolean } = {}): Profile2D {
  const d = deriveCollarDimensions(p);
  const Ri = d.innerRadius;
  const Ro = d.insertionOuterRadius;
  const Rs = d.shoulderOuterRadius;
  const c = p.leadInChamfer;
  const includeShoulder = opts.includeShoulder ?? true;
  const top = includeShoulder ? d.totalHeight : p.insertionHeight;

  const pts: [number, number][] = [];
  pts.push([Ri, 0]);
  if (c > 0) {
    pts.push([Ro - c, 0]);
    pts.push([Ro, c]);
  } else {
    pts.push([Ro, 0]);
  }
  if (includeShoulder) {
    pts.push([Ro, p.insertionHeight]);
    pts.push([Rs, p.insertionHeight]);
    pts.push([Rs, top]);
  } else {
    pts.push([Ro, top]);
  }
  const lip = p.retentionLip;
  if (lip.enabled && includeShoulder) {
    const lipBottom = top - lip.height;
    pts.push([Ri - lip.width, top]);
    pts.push([Ri - lip.width, lipBottom]);
    pts.push([Ri, lipBottom]);
  } else {
    pts.push([Ri, top]);
  }
  return pts;
}
