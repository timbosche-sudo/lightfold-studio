import type { ShadeDesign, ShadeFamilyId } from '../../types/project';
import { cylinderShade } from './cylinder';
import type { ShadeGenerator } from './types';

/** Registry of shade families. Phase 3+ families are added here. */
export const SHADE_GENERATORS: { [K in ShadeFamilyId]: ShadeGenerator<ShadeDesign[K]> } = {
  cylinder: cylinderShade,
};

export function defaultShadeDesign(): ShadeDesign {
  return { family: 'cylinder', cylinder: cylinderShade.defaults() };
}

/** The active generator and its parameters, typed loosely for generic callers. */
export function activeShade(design: ShadeDesign): { generator: ShadeGenerator<unknown>; params: unknown } {
  const generator = SHADE_GENERATORS[design.family] as ShadeGenerator<unknown>;
  return { generator, params: design[design.family] };
}
